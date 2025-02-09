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