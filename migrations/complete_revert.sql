-- Disable RLS on all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE nominations DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY IF EXISTS "Users can read their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Admin users can do everything" ON users;
DROP POLICY IF EXISTS "Anyone can read votes" ON votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON votes;
DROP POLICY IF EXISTS "Anyone can read weekly winners" ON weekly_winners;
DROP POLICY IF EXISTS "Anyone can read subscription revenue" ON subscription_revenue;
DROP POLICY IF EXISTS "Users can read their own credits" ON subscription_credits;
DROP POLICY IF EXISTS "Public can read subscription credits" ON subscription_credits;
DROP POLICY IF EXISTS "Anyone can read streamers" ON streamers;
DROP POLICY IF EXISTS "Anyone can read nominations" ON nominations;
DROP POLICY IF EXISTS "Authenticated users can create nominations" ON nominations;

-- Remove is_admin column from users table
ALTER TABLE users DROP COLUMN IF EXISTS is_admin CASCADE;

-- Drop admin function if it exists
DROP FUNCTION IF EXISTS set_admin_status(UUID, BOOLEAN) CASCADE;

-- Drop admin view if it exists
DROP VIEW IF EXISTS admin_dashboard CASCADE; 