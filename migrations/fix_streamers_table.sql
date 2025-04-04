-- First, let's see what columns we actually have
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'streamers';

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add profile_image_url if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'streamers' 
        AND column_name = 'profile_image_url'
    ) THEN
        ALTER TABLE streamers 
        ADD COLUMN profile_image_url TEXT;
    END IF;

    -- Add username if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'streamers' 
        AND column_name = 'username'
    ) THEN
        ALTER TABLE streamers 
        ADD COLUMN username TEXT;
    END IF;
END $$;

-- Now let's modify the leaderboard query to work with the actual structure
WITH weekly_data AS (
    SELECT 
        streamer,
        COUNT(*) as vote_count,
        MAX(created_at) as last_vote
    FROM votes
    WHERE created_at >= date_trunc('week', NOW())
    GROUP BY streamer
)
SELECT 
    w.*,
    s.username,
    COALESCE(s.profile_image_url, 'https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png') as profile_image_url
FROM weekly_data w
LEFT JOIN streamers s ON w.streamer = COALESCE(s.username, s.streamer)
ORDER BY vote_count DESC;

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