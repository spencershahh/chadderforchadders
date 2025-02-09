-- First, disable RLS on all tables to make changes
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE streamers DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read access for users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Enable insert for signup" ON users;
DROP POLICY IF EXISTS "Public read access for streamers" ON streamers;
DROP POLICY IF EXISTS "Public read access for votes" ON votes;
DROP POLICY IF EXISTS "Users can manage their own votes" ON votes;
DROP POLICY IF EXISTS "Public read access for subscription_credits" ON subscription_credits;
DROP POLICY IF EXISTS "Users can view their own credits" ON subscription_credits;

-- Users table policies
CREATE POLICY "Public read access for users"
ON users FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable insert for signup"
ON users FOR INSERT
TO public
WITH CHECK (true);

-- Streamers table policies
CREATE POLICY "Public read access for streamers"
ON streamers FOR SELECT
TO public
USING (true);

-- Votes table policies
CREATE POLICY "Public read access for votes"
ON votes FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can manage their own votes"
ON votes FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Subscription credits policies
CREATE POLICY "Public read access for subscription_credits"
ON subscription_credits FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can view their own credits"
ON subscription_credits FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON users TO authenticated;
GRANT SELECT ON users TO anon;
GRANT SELECT ON streamers TO anon, authenticated;
GRANT ALL ON votes TO authenticated;
GRANT SELECT ON votes TO anon;
GRANT SELECT ON subscription_credits TO anon, authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Ensure the auth.users() function exists
CREATE OR REPLACE FUNCTION auth.users() 
RETURNS SETOF auth.users 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = auth 
AS $$
    SELECT * FROM auth.users;
$$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_user_id ON subscription_credits(user_id);

-- Ensure user data exists in users table after signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (new.id, new.email, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add this function to handle subscription renewals more robustly
CREATE OR REPLACE FUNCTION process_subscription_renewal(
    p_user_id UUID,
    p_subscription_tier TEXT
)
RETURNS VOID AS $$
DECLARE
    v_credits INTEGER;
    v_amount_per_week DECIMAL;
    v_last_distribution TIMESTAMP;
BEGIN
    -- Validate subscription tier
    IF p_subscription_tier NOT IN ('common', 'rare', 'epic') THEN
        RAISE EXCEPTION 'Invalid subscription tier: %', p_subscription_tier;
    END IF;

    -- Get last distribution time
    SELECT last_credit_distribution 
    INTO v_last_distribution
    FROM users
    WHERE id = p_user_id;

    -- Check if it's too early for distribution (within 6 days)
    IF v_last_distribution IS NOT NULL AND 
       v_last_distribution > NOW() - INTERVAL '6 days' THEN
        RAISE EXCEPTION 'Too early for credit distribution. Last distribution was at %', v_last_distribution;
    END IF;

    -- Calculate credits based on tier
    v_credits := CASE 
        WHEN p_subscription_tier = 'common' THEN 25
        WHEN p_subscription_tier = 'rare' THEN 50
        WHEN p_subscription_tier = 'epic' THEN 100
        ELSE 0
    END;

    -- Calculate amount per week for prize pool
    v_amount_per_week := CASE 
        WHEN p_subscription_tier = 'common' THEN 3
        WHEN p_subscription_tier = 'rare' THEN 5
        WHEN p_subscription_tier = 'epic' THEN 7
        ELSE 0
    END;

    -- Update user's credits and last distribution time
    UPDATE users 
    SET credits = credits + v_credits,
        last_credit_distribution = NOW()
    WHERE id = p_user_id
    AND subscription_status = 'active'  -- Only distribute if subscription is active
    AND subscription_tier = p_subscription_tier;  -- Verify tier matches

    -- Record the distribution
    INSERT INTO subscription_credits (
        user_id,
        distribution_date,
        credits_amount,
        subscription_tier
    ) VALUES (
        p_user_id,
        NOW(),
        v_credits,
        p_subscription_tier
    );

    -- Update subscription amount for prize pool calculation
    INSERT INTO subscriptions (
        user_id,
        amount_per_week,
        status
    ) VALUES (
        p_user_id,
        v_amount_per_week,
        'active'
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        amount_per_week = EXCLUDED.amount_per_week,
        updated_at = NOW();

    -- Recalculate prize pool
    PERFORM calculate_weekly_prize_pool();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Public can insert during signup" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;

-- Create policies for the users table
CREATE POLICY "Users can view their own data"
ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Public can insert during signup"
ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Create policy for real-time subscriptions
CREATE POLICY "Enable read access for authenticated users"
ON users FOR SELECT
TO authenticated
USING (true);

-- Policies for subscriptions table
CREATE POLICY "Users can view their own subscriptions"
ON subscriptions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policies for subscription_revenue table
CREATE POLICY "Users can view their own revenue"
ON subscription_revenue FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policies for prize_pool table
CREATE POLICY "Anyone can view prize pool"
ON prize_pool FOR SELECT
TO authenticated
USING (true);

-- Policies for votes table
CREATE POLICY "Users can view their own votes"
ON votes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own votes"
ON votes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policies for weekly_winners table
CREATE POLICY "Anyone can view weekly winners"
ON weekly_winners FOR SELECT
TO authenticated
USING (true);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT ON prize_pool TO authenticated;
GRANT SELECT, INSERT ON votes TO authenticated;
GRANT SELECT ON weekly_winners TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON subscription_revenue TO authenticated;

-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE prize_pool;
ALTER PUBLICATION supabase_realtime ADD TABLE weekly_winners; 