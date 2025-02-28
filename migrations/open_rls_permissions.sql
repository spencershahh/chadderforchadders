-- Disable RLS temporarily to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE nominations DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Public read access" ON votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON votes;
DROP POLICY IF EXISTS "Public read access" ON weekly_winners;
DROP POLICY IF EXISTS "Public read access" ON subscription_revenue;
DROP POLICY IF EXISTS "Public read access" ON streamers;
DROP POLICY IF EXISTS "Public read access" ON subscriptions;
DROP POLICY IF EXISTS "Public read access" ON prize_pool;

-- Create more permissive policies

-- Users table policies
CREATE POLICY "Enable read for everyone" 
ON users FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON users FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" 
ON users FOR UPDATE 
TO authenticated 
USING (true);

-- Subscriptions table policies
CREATE POLICY "Enable all access for authenticated users" 
ON subscriptions FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable read for everyone" 
ON subscriptions FOR SELECT 
TO public 
USING (true);

-- Votes table policies
CREATE POLICY "Enable all access for authenticated users" 
ON votes FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable read for everyone" 
ON votes FOR SELECT 
TO public 
USING (true);

-- Weekly winners table policies
CREATE POLICY "Enable read for everyone" 
ON weekly_winners FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Enable all for authenticated" 
ON weekly_winners FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Subscription revenue table policies
CREATE POLICY "Enable read for everyone" 
ON subscription_revenue FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Enable all for authenticated" 
ON subscription_revenue FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Subscription credits table policies
CREATE POLICY "Enable read for everyone" 
ON subscription_credits FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Enable all for authenticated" 
ON subscription_credits FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Prize pool table policies
CREATE POLICY "Enable read for everyone" 
ON prize_pool FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Enable all for authenticated" 
ON prize_pool FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant broad permissions to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant read-only access to anonymous users
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool ENABLE ROW LEVEL SECURITY; 