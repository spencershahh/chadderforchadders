-- Migration to fully ensure gem_balance is used instead of credits
DO $$ 
BEGIN
    -- Ensure the users table has gem_balance and not credits
    BEGIN
        -- Rename credits to gem_balance if credits exists but gem_balance doesn't
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
            RAISE NOTICE 'Renamed credits column to gem_balance';
        END IF;
    END;

    -- If both columns exist, migrate data from credits to gem_balance and drop credits
    BEGIN
        IF EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'credits'
        ) AND EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'gem_balance'
        ) THEN
            -- Update gem_balance with the value from credits where gem_balance is null or 0
            UPDATE public.users 
            SET gem_balance = COALESCE(credits, 0) 
            WHERE gem_balance IS NULL OR gem_balance = 0;
            
            -- Drop the credits column
            ALTER TABLE public.users DROP COLUMN credits;
            RAISE NOTICE 'Migrated data from credits to gem_balance and dropped credits column';
        END IF;
    END;

    -- Update any stored procedures that might reference credits
    BEGIN
        -- Update award_gems_for_ad function to use gem_balance
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
        
        RAISE NOTICE 'Updated award_gems_for_ad function to use gem_balance';
    END;
END $$; 