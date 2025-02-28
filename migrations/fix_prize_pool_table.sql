-- Drop and recreate prize pool table with proper constraints
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

-- Add trigger for updated_at
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

-- Create function to calculate weekly prize pool
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

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON prize_pool TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_weekly_prize_pool() TO authenticated; 