-- Fix permissions for all relevant tables
DO $$
BEGIN
    -- Grant permissions on streamers table
    EXECUTE 'GRANT ALL ON TABLE public.streamers TO anon';
    EXECUTE 'GRANT ALL ON TABLE public.streamers TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.streamers TO service_role';
    
    -- Grant permissions on users table
    EXECUTE 'GRANT ALL ON TABLE auth.users TO anon';
    EXECUTE 'GRANT ALL ON TABLE auth.users TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE auth.users TO service_role';
    
    -- Create admins table if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admins') THEN
        CREATE TABLE public.admins (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
    END IF;
    
    -- Grant permissions on admins table
    EXECUTE 'GRANT ALL ON TABLE public.admins TO anon';
    EXECUTE 'GRANT ALL ON TABLE public.admins TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.admins TO service_role';
    
    -- Disable RLS on all tables
    ALTER TABLE public.streamers DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
    
    -- Add current user as admin if not already
    INSERT INTO public.admins (user_id)
    SELECT id FROM auth.users 
    WHERE email = current_user
    AND NOT EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.users.id
    );

END $$; 