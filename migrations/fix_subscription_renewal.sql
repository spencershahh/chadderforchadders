-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS process_subscription_renewal(UUID, TEXT);

-- Create the fixed version of the function
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION process_subscription_renewal(UUID, TEXT) TO authenticated; 