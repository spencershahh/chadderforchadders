-- Function to create admins table
CREATE OR REPLACE FUNCTION create_admins_table()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT unique_admin_user_id UNIQUE (user_id)
  );

  -- Enable RLS
  ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create streamers table
CREATE OR REPLACE FUNCTION create_streamers_table()
RETURNS void AS $$
BEGIN
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

  -- Enable RLS
  ALTER TABLE public.streamers ENABLE ROW LEVEL SECURITY;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create admin policies
CREATE OR REPLACE FUNCTION create_admin_policies()
RETURNS void AS $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Admins can read the admins table" ON public.admins;
  DROP POLICY IF EXISTS "Admins can manage the admins table" ON public.admins;
  DROP POLICY IF EXISTS "Streamers are readable by everyone" ON public.streamers;
  DROP POLICY IF EXISTS "Admins can manage streamers" ON public.streamers;

  -- Create policies for admins table
  CREATE POLICY "Admins can read the admins table"
    ON public.admins
    FOR SELECT
    USING (
      auth.uid() IN (
        SELECT user_id FROM public.admins
      )
    );

  CREATE POLICY "Admins can manage the admins table"
    ON public.admins
    FOR ALL
    USING (
      auth.uid() IN (
        SELECT user_id FROM public.admins
      )
    );

  -- Create policies for streamers table
  CREATE POLICY "Streamers are readable by everyone"
    ON public.streamers
    FOR SELECT
    USING (true);

  CREATE POLICY "Admins can manage streamers"
    ON public.streamers
    FOR ALL
    USING (
      auth.uid() IN (
        SELECT user_id FROM public.admins
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 