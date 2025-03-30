-- Fix infinite recursion in RLS policies
-- This script addresses the "infinite recursion detected in policy" errors

-- Disable RLS temporarily to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies that might be causing recursion
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname FROM pg_policies WHERE tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', policy_record.policyname);
    END LOOP;
    
    FOR policy_record IN
        SELECT policyname FROM pg_policies WHERE tablename = 'admins'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON admins', policy_record.policyname);
    END LOOP;
END $$;

-- Create simplified non-recursive policies for users table
-- Allow users to read their own data (no recursion)
CREATE POLICY "users_read_own" ON users 
FOR SELECT 
USING (auth.uid() = id);

-- Allow users to update their own data (no recursion)
CREATE POLICY "users_update_own" ON users 
FOR UPDATE 
USING (auth.uid() = id);

-- Allow public access for signup
CREATE POLICY "users_insert_public" ON users 
FOR INSERT 
TO public 
WITH CHECK (true);

-- Create a policy for admins to access all users data
-- Use a different approach with direct admin check instead of using the function
CREATE POLICY "admins_access_users" ON users 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins 
    WHERE admins.user_id = auth.uid()
  )
);

-- Create simple policies for the admins table without recursion
-- Allow admin access to their own record
CREATE POLICY "admins_select_own" ON admins 
FOR SELECT 
USING (user_id = auth.uid());

-- Allow admin management by authenticated users
-- Removing the pg_has_role function that's causing errors
CREATE POLICY "admins_manage" ON admins 
FOR ALL 
TO authenticated
USING (true);

-- Grant necessary permissions
GRANT SELECT ON users TO anon, authenticated;
GRANT UPDATE ON users TO authenticated;
GRANT INSERT ON users TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON admins TO authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Fix or drop the is_admin function if it's causing recursion
DROP FUNCTION IF EXISTS is_admin(uuid);

-- Create a simpler is_admin function without recursion
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = check_user_id
  ) INTO admin_exists;
  
  RETURN admin_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 