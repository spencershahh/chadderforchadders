-- Update RLS Policies for Better Security
-- This migration addresses issues with Row Level Security for users and admins tables

-- First disable RLS to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- Clean up existing policies to avoid conflicts
-- First, get a list of all policies on the users table and drop them
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname FROM pg_policies WHERE tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
    END LOOP;
    
    -- Do the same for admins table
    FOR policy_record IN
        SELECT policyname FROM pg_policies WHERE tablename = 'admins'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON admins', policy_record.policyname);
    END LOOP;
END $$;

-- Create updated policies for users table
-- Allow users to read their own data
CREATE POLICY "Users can access their own data" 
ON users 
FOR SELECT 
USING (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "Users can update their own records" 
ON users 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow insert for authenticated users
CREATE POLICY "Enable insert for authenticated users only" 
ON users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow public signup (with more control through application logic)
CREATE POLICY "Enable insert for signup" 
ON users 
FOR INSERT 
TO public 
WITH CHECK (true);

-- Allow admins to access all user data
CREATE POLICY "Admins can access all users" 
ON users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = auth.uid()
  )
);

-- Create policies for admins table
-- Allow admins to access their own data
CREATE POLICY "Admins can access their own data" 
ON admins 
FOR ALL 
USING (auth.uid() = user_id);

-- Allow admins to read all admin records
CREATE POLICY "Admins can read the admins table" 
ON admins 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = auth.uid()
  )
);

-- Allow admins to manage other admins
CREATE POLICY "Admins can manage the admins table" 
ON admins 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = auth.uid()
  )
);

-- Grant necessary permissions
GRANT SELECT ON users TO anon, authenticated;
GRANT UPDATE ON users TO authenticated;
GRANT INSERT ON users TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON admins TO authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- *** Add function to check if a user is an admin ***
-- First drop the existing function if it exists
DROP FUNCTION IF EXISTS is_admin(uuid);

-- Now create our new function
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 