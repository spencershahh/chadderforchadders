-- Create the streamers table
CREATE TABLE IF NOT EXISTS public.streamers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL,
  bio TEXT,
  votes INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  viewers INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT unique_streamer_username UNIQUE (username)
);

-- Enable RLS on streamers table
ALTER TABLE public.streamers ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Streamers are readable by everyone"
  ON public.streamers
  FOR SELECT
  USING (true);

-- Create policy for admin write access
CREATE POLICY "Admins can manage streamers"
  ON public.streamers
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create function to upsert streamers
CREATE OR REPLACE FUNCTION upsert_streamers(streamers_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  streamer JSONB;
  username TEXT;
  bio TEXT;
  counter INTEGER := 0;
BEGIN
  -- Clear existing streamers
  DELETE FROM public.streamers;
  
  -- Insert new streamers
  FOR streamer IN SELECT * FROM jsonb_array_elements(streamers_data)
  LOOP
    username := streamer->>'username';
    bio := streamer->>'bio';
    
    INSERT INTO public.streamers (username, bio)
    VALUES (username, bio)
    ON CONFLICT (username) 
    DO UPDATE SET bio = EXCLUDED.bio, updated_at = now();
    
    counter := counter + 1;
  END LOOP;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 