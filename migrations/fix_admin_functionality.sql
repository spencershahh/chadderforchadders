-- Fix Admin Functionality
-- This script addresses issues with the admin page not loading correctly

-- Make sure RLS is disabled for troubleshooting
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- Create a simpler is_admin function that just checks the table directly
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = check_user_id
  ) INTO admin_exists;
  
  RETURN admin_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add an explicit admin check function that can be called from the frontend
CREATE OR REPLACE FUNCTION check_admin_status()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the admin table has the correct structure
DO $$
BEGIN
  -- Check if user_id column exists in admins table, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admins' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE admins ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Make sure there's at least one admin in the system (your current user)
-- Only if the admin table exists and has a user_id column
INSERT INTO admins (user_id)
SELECT auth.uid()
WHERE 
  NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
  AND auth.uid() IS NOT NULL;

-- Grant all permissions for admin-related tables
GRANT ALL ON admins TO anon, authenticated, service_role;
GRANT ALL ON users TO anon, authenticated, service_role;

-- Make sure related tables for admin functionality have permissions too
DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
  LOOP
    EXECUTE format('GRANT ALL ON %I TO anon, authenticated, service_role', table_record.table_name);
  END LOOP;
END $$; 