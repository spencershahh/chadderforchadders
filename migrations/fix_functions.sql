-- Create or replace the weekly donation calculation function
CREATE OR REPLACE FUNCTION calculate_weekly_donation_bomb()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_amount numeric;
BEGIN
    -- Get the start of the current week (Sunday)
    WITH week_start AS (
        SELECT date_trunc('week', NOW()) AS start_date
    )
    
    -- Calculate total from active subscriptions only
    SELECT COALESCE(SUM(amount_per_week), 0) * 0.55
    INTO total_amount
    FROM subscriptions
    WHERE status = 'active'
    AND (cancelled_at IS NULL OR cancelled_at > (SELECT start_date FROM week_start));
    
    RETURN total_amount;
END;
$$;

-- Grant execute permission to public
GRANT EXECUTE ON FUNCTION calculate_weekly_donation_bomb() TO public; 