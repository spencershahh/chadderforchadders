# Database Migration Instructions

This document explains how to fix the `users.credits` column issue by migrating to `gem_balance`.

## Issue

The application code is trying to access a column called `credits` in the `users` table, but the database schema has the column named `gem_balance`. This mismatch causes errors like:

```
Error: column users.credits does not exist
```

## Solution

We've already updated the application code to use `gem_balance` instead of `credits`. Now we need to ensure the database schema is consistent.

## Applying the Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. Log in to your Supabase dashboard: https://app.supabase.com/
2. Select your project
3. Go to the "SQL Editor" section
4. Create a new query
5. Paste the following SQL code:

```sql
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
```

6. Click "Run" to execute the query
7. This will:
   - Rename the `credits` column to `gem_balance` if only `credits` exists
   - Migrate data from `credits` to `gem_balance` if both exist
   - Update the `award_gems_for_ad` function to use `gem_balance`

### Option 2: Using Command Line (If you have direct database access)

If you have direct access to the database:

```bash
cd /Users/spencershahidzadeh/Desktop/Chadder/chadderforchadders
psql YOUR_SUPABASE_CONNECTION_STRING -f migrations/update_gem_balance.sql
```

Replace `YOUR_SUPABASE_CONNECTION_STRING` with your actual connection string.

## Verification

After running the migration, verify that:

1. The `users` table has a `gem_balance` column (and no `credits` column)
2. The `award_gems_for_ad` function is updated to use `gem_balance`

You can check this by running:

```sql
-- Check if gem_balance exists and credits doesn't
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'gem_balance') 
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credits')
    THEN 'Migration successful'
    ELSE 'Migration incomplete'
  END AS status;
  
-- Check the award_gems_for_ad function definition
SELECT pg_get_functiondef('public.award_gems_for_ad(uuid, integer, text, text)'::regprocedure);
```

The application should now work correctly with the `gem_balance` column. 