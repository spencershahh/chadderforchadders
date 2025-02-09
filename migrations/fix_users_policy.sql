-- First disable RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read access for users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;

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

-- Grant necessary permissions
GRANT SELECT ON users TO anon;
GRANT SELECT, UPDATE ON users TO authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY; 