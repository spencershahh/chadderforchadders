-- Ensure users table has correct structure
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    stripe_customer_id text,
    subscription_tier text DEFAULT 'free',
    subscription_status text DEFAULT 'inactive',
    credits integer DEFAULT 0,
    last_credit_distribution timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Add any missing columns
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credits integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_credit_distribution timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

-- Update any null values to defaults
UPDATE public.users 
SET 
    subscription_tier = COALESCE(subscription_tier, 'free'),
    subscription_status = COALESCE(subscription_status, 'inactive'),
    credits = COALESCE(credits, 0),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now());

-- Add necessary indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription ON public.users(subscription_tier, subscription_status); 