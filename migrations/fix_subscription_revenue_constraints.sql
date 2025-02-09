-- First, drop the existing constraint
ALTER TABLE subscription_revenue DROP CONSTRAINT IF EXISTS subscription_revenue_user_id_fkey;

-- Recreate the constraint with ON DELETE CASCADE
ALTER TABLE subscription_revenue 
ADD CONSTRAINT subscription_revenue_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Add an index to improve performance
CREATE INDEX IF NOT EXISTS idx_subscription_revenue_user_id 
ON subscription_revenue(user_id);

-- Grant necessary permissions
GRANT SELECT, DELETE ON subscription_revenue TO authenticated; 