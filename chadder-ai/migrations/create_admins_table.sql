-- Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT unique_admin_user_id UNIQUE (user_id)
);

-- Enable RLS on admins table
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to read other admins
CREATE POLICY "Admins can read the admins table"
  ON public.admins
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create policy for admins to manage other admins
CREATE POLICY "Admins can manage the admins table"
  ON public.admins
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 