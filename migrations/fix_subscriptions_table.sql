-- Drop and recreate subscriptions table with proper constraints
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

-- Add trigger for updated_at
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(subscription_tier);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated; 