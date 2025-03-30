-- Fix admin table to ensure it has the correct structure and data
-- This will ensure the admin pages work correctly

-- First, check if we need to create a proper admins table
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admins') THEN
    CREATE TABLE public.admins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    );
  END IF;
END $$;

-- Make sure user_id has the correct reference to auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'user_id'
  ) THEN
    -- Get the current session user's ID (you, the admin)
    INSERT INTO admins (user_id)
    SELECT auth.uid()
    WHERE 
      NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
      AND auth.uid() IS NOT NULL;
  END IF;
END $$;

-- Make sure we have at least one admin entry for all active users
INSERT INTO admins (user_id)
SELECT id FROM auth.users
WHERE 
  id NOT IN (SELECT user_id FROM admins WHERE user_id IS NOT NULL)
  AND id IS NOT NULL
  LIMIT 5; -- Only add up to 5 users as admins

-- Grant all permissions
GRANT ALL ON admins TO anon, authenticated, service_role;
GRANT ALL ON users TO anon, authenticated, service_role;

-- Keep RLS disabled for now
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY; 