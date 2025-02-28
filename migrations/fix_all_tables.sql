-- Disable RLS temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool DISABLE ROW LEVEL SECURITY;

-- Drop and recreate prize_pool table with proper constraints
DROP TABLE IF EXISTS prize_pool CASCADE;

CREATE TABLE prize_pool (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start TIMESTAMPTZ NOT NULL,
    week_end TIMESTAMPTZ NOT NULL,
    current_amount DECIMAL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_week UNIQUE (week_start, week_end),
    CONSTRAINT valid_week_range CHECK (week_end > week_start)
);

-- Add trigger for prize_pool updated_at
CREATE OR REPLACE FUNCTION update_prize_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prize_pool_updated_at
    BEFORE UPDATE ON prize_pool
    FOR EACH ROW
    EXECUTE FUNCTION update_prize_pool_updated_at();

-- Ensure subscriptions table has correct schema
DROP TABLE IF EXISTS subscriptions CASCADE;

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    amount_per_week DECIMAL DEFAULT 0,
    status TEXT DEFAULT 'inactive' NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('free', 'common', 'rare', 'epic')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'inactive')),
    CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Add trigger for subscriptions updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();

-- Create or replace the calculate_weekly_prize_pool function
CREATE OR REPLACE FUNCTION calculate_weekly_prize_pool()
RETURNS void AS $$
DECLARE
    v_week_start TIMESTAMPTZ;
    v_week_end TIMESTAMPTZ;
    v_total_amount DECIMAL;
BEGIN
    -- Calculate the current week's start (Sunday) and end (Saturday)
    v_week_start := date_trunc('week', NOW());
    v_week_end := v_week_start + interval '6 days' + interval '23 hours 59 minutes 59 seconds';
    
    -- Calculate total amount from active subscriptions
    SELECT COALESCE(SUM(amount_per_week * 0.55), 0)  -- 55% of subscription revenue
    INTO v_total_amount
    FROM subscriptions
    WHERE status = 'active';
    
    -- Update or insert prize pool record for current week
    INSERT INTO prize_pool (
        week_start,
        week_end,
        current_amount,
        is_active
    ) VALUES (
        v_week_start,
        v_week_end,
        v_total_amount,
        true
    )
    ON CONFLICT (week_start, week_end) DO UPDATE
    SET 
        current_amount = EXCLUDED.current_amount,
        updated_at = NOW();
        
    -- Set previous weeks to inactive
    UPDATE prize_pool
    SET is_active = false
    WHERE week_start < v_week_start;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the subscription renewal function
CREATE OR REPLACE FUNCTION process_subscription_renewal(
    p_user_id UUID,
    p_subscription_tier TEXT
)
RETURNS VOID AS $$
DECLARE
    v_credits INTEGER;
    v_amount_per_week DECIMAL;
BEGIN
    -- Validate subscription tier
    IF p_subscription_tier NOT IN ('common', 'rare', 'epic') THEN
        RAISE EXCEPTION 'Invalid subscription tier: %', p_subscription_tier;
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
    AND subscription_status = 'active'
    AND subscription_tier = p_subscription_tier;

    -- Update subscription record
    INSERT INTO subscriptions (
        user_id,
        amount_per_week,
        status,
        subscription_tier,
        updated_at
    ) VALUES (
        p_user_id,
        v_amount_per_week,
        'active',
        p_subscription_tier,
        NOW()
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        amount_per_week = EXCLUDED.amount_per_week,
        subscription_tier = EXCLUDED.subscription_tier,
        status = EXCLUDED.status,
        updated_at = NOW();

    -- Update prize pool
    PERFORM calculate_weekly_prize_pool();
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prize_pool_week ON prize_pool(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_prize_pool_active ON prize_pool(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(subscription_tier);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON prize_pool TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_weekly_prize_pool() TO authenticated;
GRANT EXECUTE ON FUNCTION process_subscription_renewal(UUID, TEXT) TO authenticated;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pool ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for all users"
    ON prize_pool FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable all access for authenticated users"
    ON prize_pool FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable read access for all users"
    ON subscriptions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable all access for authenticated users"
    ON subscriptions FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true); 