-- First, ensure the function exists
CREATE OR REPLACE FUNCTION public.ensure_user_exists(user_id uuid, user_email text)
RETURNS void AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (user_id, user_email, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.ensure_user_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_exists TO anon;

-- Create a trigger to automatically create user records
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (new.id, new.email, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        updated_at = now();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_created();

-- Manually run for existing auth users
INSERT INTO public.users (id, email, created_at, updated_at)
SELECT id, email, COALESCE(created_at, now()), COALESCE(last_sign_in_at, now())
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET 
    email = EXCLUDED.email,
    updated_at = now(); 