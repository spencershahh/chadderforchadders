-- Fix streamers table for the admin page
-- This will ensure the streamers management part of the admin dashboard works

-- First, check if we need to create the streamers table
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'streamers') THEN
    CREATE TABLE public.streamers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      display_name TEXT,
      bio TEXT,
      twitch_id TEXT,
      profile_image_url TEXT,
      view_count INTEGER DEFAULT 0,
      follower_count INTEGER DEFAULT 0,
      is_live BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    );
  END IF;
END $$;

-- Add default sample data if table is empty
INSERT INTO streamers (name, display_name, bio)
SELECT 'example_streamer', 'Example Streamer', 'This is a sample streamer for testing.'
WHERE NOT EXISTS (SELECT 1 FROM streamers LIMIT 1);

-- Grant all permissions
GRANT ALL ON streamers TO anon, authenticated, service_role;

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

-- Keep RLS disabled for now
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY; 