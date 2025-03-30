-- Drop and recreate the admins table
BEGIN;

-- Drop the table if it exists
DROP TABLE IF EXISTS public.admins;

-- Create a fresh admins table
CREATE TABLE public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add the specified user as admin
INSERT INTO public.admins (user_id) 
VALUES ('5f6b3f6d-9aa9-4847-8238-b3b18beb4f3b');

-- Grant permissions
GRANT ALL ON TABLE public.admins TO anon;
GRANT ALL ON TABLE public.admins TO authenticated;
GRANT ALL ON TABLE public.admins TO service_role;

-- Disable Row Level Security
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;

-- Make sure we can access the users table
GRANT ALL ON TABLE auth.users TO anon;
GRANT ALL ON TABLE auth.users TO authenticated;
GRANT ALL ON TABLE auth.users TO service_role;

-- Make sure we can access streamers table
GRANT ALL ON TABLE public.streamers TO anon;
GRANT ALL ON TABLE public.streamers TO authenticated;
GRANT ALL ON TABLE public.streamers TO service_role;

ALTER TABLE public.streamers DISABLE ROW LEVEL SECURITY;

COMMIT; 