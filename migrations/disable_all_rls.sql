-- Temporarily disable RLS on all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE nominations DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_usernames DISABLE ROW LEVEL SECURITY;

-- Grant full access to authenticated and anon users temporarily
GRANT ALL ON users TO authenticated, anon;
GRANT ALL ON nominations TO authenticated, anon;
GRANT ALL ON votes TO authenticated, anon;
GRANT ALL ON subscription_revenue TO authenticated, anon;
GRANT ALL ON subscription_credits TO authenticated, anon;
GRANT ALL ON streamers TO authenticated, anon;
GRANT ALL ON weekly_winners TO authenticated, anon;
GRANT ALL ON subscriptions TO authenticated, anon;
GRANT ALL ON deleted_usernames TO authenticated, anon;

-- Note: After fixing the immediate issues, we should re-enable RLS with proper policies
-- Run the fix_users_rls_policy.sql script again to restore proper security 