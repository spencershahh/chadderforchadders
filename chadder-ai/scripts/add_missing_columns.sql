-- Add is_live column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'twitch_streamers' 
        AND column_name = 'is_live'
    ) THEN
        ALTER TABLE public.twitch_streamers 
        ADD COLUMN is_live BOOLEAN DEFAULT false;
        
        RAISE NOTICE 'Added is_live column to twitch_streamers table';
    ELSE
        RAISE NOTICE 'is_live column already exists in twitch_streamers table';
    END IF;
END
$$;
