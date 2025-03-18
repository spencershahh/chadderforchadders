-- Create table for twitch streamers
CREATE TABLE IF NOT EXISTS public.twitch_streamers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  twitch_id VARCHAR NOT NULL UNIQUE,
  username VARCHAR NOT NULL,
  display_name VARCHAR,
  description TEXT,
  profile_image_url TEXT,
  view_count INTEGER DEFAULT 0,
  votes INTEGER DEFAULT 0,
  is_live BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for user favorites
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES public.twitch_streamers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, streamer_id)
);

-- Add a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_twitch_streamers_updated_at
BEFORE UPDATE ON public.twitch_streamers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on tables
ALTER TABLE public.twitch_streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for twitch_streamers
-- Anyone can read
CREATE POLICY "Anyone can read twitch_streamers" 
  ON public.twitch_streamers 
  FOR SELECT 
  USING (true);

-- Only authenticated users can insert
CREATE POLICY "Only authenticated users can insert twitch_streamers" 
  ON public.twitch_streamers 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Only authenticated users can update, and only specific columns
CREATE POLICY "Only authenticated users can update twitch_streamers votes" 
  ON public.twitch_streamers 
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (
    auth.role() = 'authenticated' AND
    (
      OLD.votes IS DISTINCT FROM NEW.votes OR
      OLD.is_live IS DISTINCT FROM NEW.is_live OR
      OLD.profile_image_url IS DISTINCT FROM NEW.profile_image_url OR
      OLD.view_count IS DISTINCT FROM NEW.view_count OR
      OLD.updated_at IS DISTINCT FROM NEW.updated_at
    )
  );

-- RLS Policies for user_favorites
-- Users can only see their own favorites
CREATE POLICY "Users can read their own favorites" 
  ON public.user_favorites 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert their own favorites
CREATE POLICY "Users can insert their own favorites" 
  ON public.user_favorites 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own favorites
CREATE POLICY "Users can delete their own favorites" 
  ON public.user_favorites 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_twitch_streamers_votes ON public.twitch_streamers (votes DESC);
CREATE INDEX IF NOT EXISTS idx_twitch_streamers_is_live ON public.twitch_streamers (is_live);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON public.user_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_streamer_id ON public.user_favorites (streamer_id); 