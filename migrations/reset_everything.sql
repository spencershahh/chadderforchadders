-- Reset all user data
UPDATE users SET 
    credits = 0,
    subscription_tier = 'free',
    subscription_status = 'inactive',
    stripe_customer_id = NULL,
    last_credit_distribution = NULL;

-- Clear all votes
TRUNCATE votes;

-- Clear weekly winners
TRUNCATE weekly_winners;

-- Clear subscription revenue
TRUNCATE subscription_revenue;

-- Clear subscription credits
TRUNCATE subscription_credits;

-- Reset streamers table votes
UPDATE streamers SET votes_count = 0;

-- Clear nominations
TRUNCATE nominations;

-- Clear subscriptions
TRUNCATE subscriptions;

-- Verify the reset
SELECT 'users' as table_name, COUNT(*) as total, 
    COUNT(*) FILTER (WHERE credits > 0) as with_credits,
    COUNT(*) FILTER (WHERE subscription_tier != 'free') as with_subscription
FROM users
UNION ALL
SELECT 'votes' as table_name, COUNT(*) as total, 0, 0 FROM votes
UNION ALL
SELECT 'weekly_winners' as table_name, COUNT(*) as total, 0, 0 FROM weekly_winners
UNION ALL
SELECT 'subscription_revenue' as table_name, COUNT(*) as total, 0, 0 FROM subscription_revenue; 