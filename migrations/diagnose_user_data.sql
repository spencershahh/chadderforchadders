-- Check auth.users table
SELECT 
    id,
    email,
    CASE 
        WHEN last_sign_in_at > now() - interval '1 hour' THEN 'Recent signin'
        ELSE 'Old signin'
    END as login_status
FROM auth.users
WHERE email = 'spencershahidzadeh@gmail.com';

-- Check public.users table
SELECT *
FROM public.users
WHERE email = 'spencershahidzadeh@gmail.com';

-- Check for duplicate records
SELECT email, COUNT(*) 
FROM public.users 
GROUP BY email 
HAVING COUNT(*) > 1;

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';

-- Check table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for orphaned records
SELECT u.id, u.email
FROM public.users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE au.id IS NULL;

-- Check for auth users without public records
SELECT au.id, au.email
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL;

-- Check permissions
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'users'
AND table_schema = 'public';

-- Output current user's session info
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role,
    auth.jwt() as current_jwt; 