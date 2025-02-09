-- First disable RLS
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read access for votes" ON votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON votes;
DROP POLICY IF EXISTS "Public read access for weekly_winners" ON weekly_winners;
DROP POLICY IF EXISTS "Public read access for subscription_revenue" ON subscription_revenue;
DROP POLICY IF EXISTS "Public read access for streamers" ON streamers;

-- Create the necessary policies for leaderboard
CREATE POLICY "Public read access for votes"
ON votes FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can vote"
ON votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read access for weekly_winners"
ON weekly_winners FOR SELECT
TO public
USING (true);

CREATE POLICY "Public read access for subscription_revenue"
ON subscription_revenue FOR SELECT
TO public
USING (true);

CREATE POLICY "Public read access for streamers"
ON streamers FOR SELECT
TO public
USING (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT ON votes TO anon;
GRANT SELECT ON weekly_winners TO anon;
GRANT SELECT ON subscription_revenue TO anon;
GRANT SELECT ON streamers TO anon;
GRANT SELECT ON current_donation_bomb TO anon;

GRANT SELECT, INSERT ON votes TO authenticated;
GRANT SELECT ON weekly_winners TO authenticated;
GRANT SELECT ON subscription_revenue TO authenticated;
GRANT SELECT ON streamers TO authenticated;

-- Re-enable RLS
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE streamers ENABLE ROW LEVEL SECURITY;

-- Verify the policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'; 