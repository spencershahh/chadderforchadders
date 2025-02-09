-- First, disable RLS to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE nominations DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access for users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Public read access for votes" ON votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON votes;
DROP POLICY IF EXISTS "Public read access for weekly_winners" ON weekly_winners;
DROP POLICY IF EXISTS "Public read access for subscription_revenue" ON subscription_revenue;
DROP POLICY IF EXISTS "Public read access for streamers" ON streamers;
DROP POLICY IF EXISTS "Public read access for subscriptions" ON subscriptions;

-- Ensure correct schema for users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_credit_distribution TIMESTAMPTZ;

-- Ensure correct schema for votes table
ALTER TABLE votes ADD COLUMN IF NOT EXISTS amount INTEGER DEFAULT 1;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create or update necessary functions
CREATE OR REPLACE FUNCTION process_subscription_renewal(
    p_user_id UUID,
    p_subscription_tier TEXT
) RETURNS void AS $$
DECLARE
    v_credits INTEGER;
BEGIN
    -- Determine credits based on tier
    v_credits := CASE p_subscription_tier
        WHEN 'common' THEN 25
        WHEN 'rare' THEN 50
        WHEN 'epic' THEN 100
        ELSE 0
    END;

    -- Update user's credits and last distribution time
    UPDATE users
    SET 
        credits = v_credits,
        last_credit_distribution = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Create policies for users table
CREATE POLICY "Public read access for users"
ON users FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create policies for votes table
CREATE POLICY "Public read access for votes"
ON votes FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can vote"
ON votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create policy for weekly_winners
CREATE POLICY "Public read access for weekly_winners"
ON weekly_winners FOR SELECT
TO public
USING (true);

-- Create policy for subscription_revenue
CREATE POLICY "Public read access for subscription_revenue"
ON subscription_revenue FOR SELECT
TO public
USING (true);

-- Create policy for streamers
CREATE POLICY "Public read access for streamers"
ON streamers FOR SELECT
TO public
USING (true);

-- Create policy for subscriptions
CREATE POLICY "Public read access for subscriptions"
ON subscriptions FOR SELECT
TO public
USING (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON votes TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT ON weekly_winners TO authenticated;
GRANT SELECT ON subscription_revenue TO authenticated;
GRANT SELECT ON streamers TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Verify the policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'; 