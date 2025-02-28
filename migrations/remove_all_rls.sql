-- Disable RLS on all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE nominations DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON users;

DROP POLICY IF EXISTS "Enable read access for all users" ON votes;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON votes;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON votes;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON votes;

DROP POLICY IF EXISTS "Enable read access for all users" ON weekly_winners;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON weekly_winners;

DROP POLICY IF EXISTS "Enable read access for all users" ON subscription_revenue;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON subscription_revenue;

DROP POLICY IF EXISTS "Enable read access for all users" ON subscription_credits;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON subscription_credits;

DROP POLICY IF EXISTS "Enable read access for all users" ON streamers;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON streamers;

DROP POLICY IF EXISTS "Enable read access for all users" ON nominations;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON nominations;

DROP POLICY IF EXISTS "Enable read access for all users" ON subscriptions;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON subscriptions;

DROP POLICY IF EXISTS "Enable read access for all users" ON prize_pool;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON prize_pool;

-- Grant full access to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant read-only access to anonymous users
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role; 