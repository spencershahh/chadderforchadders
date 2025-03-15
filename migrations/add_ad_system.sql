-- Add columns to users table for ad system
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_ad_watched timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ads_watched_today integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        -- Rename credits to gem_balance if it doesn't already exist
        IF EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'credits'
        ) AND NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'gem_balance'
        ) THEN
            ALTER TABLE public.users RENAME COLUMN credits TO gem_balance;
        END IF;
    END;

    BEGIN
        -- If neither credits nor gem_balance exists, add gem_balance
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'gem_balance'
        ) AND NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'credits'
        ) THEN
            ALTER TABLE public.users ADD COLUMN gem_balance integer DEFAULT 0;
        END IF;
    END;
END $$;

-- Create ad watch history table
CREATE TABLE IF NOT EXISTS public.ad_watch_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    watched_at timestamp with time zone DEFAULT now() NOT NULL,
    gems_earned integer NOT NULL,
    ad_provider text NOT NULL,
    ad_unit_id text NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ad_watch_history_user_id ON public.ad_watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_watch_history_date ON public.ad_watch_history(watched_at);

-- Create function to check if user can watch an ad
CREATE OR REPLACE FUNCTION public.can_watch_ad(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    ads_today integer;
    last_ad_time timestamp with time zone;
    can_watch boolean := true;
BEGIN
    -- Get user data
    SELECT last_ad_watched, ads_watched_today 
    INTO last_ad_time, ads_today
    FROM public.users WHERE id = p_user_id;
    
    -- Check cooldown (30 seconds)
    IF last_ad_time IS NOT NULL AND 
       (EXTRACT(EPOCH FROM (NOW() - last_ad_time)) < 30) THEN
        can_watch := false;
    END IF;
    
    -- Check daily limit (5 per day)
    IF COALESCE(ads_today, 0) >= 5 THEN
        can_watch := false;
    END IF;
    
    RETURN can_watch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to award gems for watching an ad
CREATE OR REPLACE FUNCTION public.award_gems_for_ad(
    p_user_id uuid,
    p_gems_amount integer,
    p_ad_provider text,
    p_ad_unit_id text
)
RETURNS boolean AS $$
DECLARE
    can_award boolean;
BEGIN
    -- Check if user can watch an ad
    SELECT public.can_watch_ad(p_user_id) INTO can_award;
    
    IF NOT can_award THEN
        RETURN false;
    END IF;
    
    -- Update user data
    UPDATE public.users
    SET 
        gem_balance = COALESCE(gem_balance, 0) + p_gems_amount,
        ads_watched_today = COALESCE(ads_watched_today, 0) + 1,
        last_ad_watched = NOW()
    WHERE id = p_user_id;
    
    -- Record ad watch
    INSERT INTO public.ad_watch_history 
        (user_id, gems_earned, ad_provider, ad_unit_id)
    VALUES 
        (p_user_id, p_gems_amount, p_ad_provider, p_ad_unit_id);
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset daily ad counts (to be run by a cron job)
CREATE OR REPLACE FUNCTION public.reset_daily_ad_counts() 
RETURNS void AS $$
BEGIN
    UPDATE public.users SET ads_watched_today = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on the ad_watch_history table
ALTER TABLE public.ad_watch_history ENABLE ROW LEVEL SECURITY;

-- Create policy for ad_watch_history
CREATE POLICY "Users can only view their own ad watch history"
ON public.ad_watch_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Only authenticated users can insert ad watches for themselves"
ON public.ad_watch_history
FOR INSERT
WITH CHECK (auth.uid() = user_id); 