-- First disable RLS to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read access for users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable insert for signup" ON users;

-- Create the necessary policies
CREATE POLICY "Public read access for users"
ON users FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow any insert during signup (we'll validate the user ID in our application code)
CREATE POLICY "Enable insert for signup"
ON users FOR INSERT
TO public
WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT ON users TO anon;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT INSERT ON users TO public;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY; 