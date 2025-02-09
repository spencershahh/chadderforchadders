-- Check current auth state
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role,
    auth.email() as current_email;

-- Check if user exists in auth.users
SELECT 
    id as auth_id,
    email,
    last_sign_in_at,
    created_at
FROM auth.users 
WHERE email = 'spencershahidzadeh@gmail.com';

-- Check if user exists in public.users with all fields
SELECT *
FROM public.users
WHERE email = 'spencershahidzadeh@gmail.com';

-- Check if the IDs match between auth and public
SELECT 
    au.id as auth_id,
    au.email as auth_email,
    pu.id as public_id,
    pu.email as public_email,
    CASE 
        WHEN au.id = pu.id THEN 'IDs Match'
        ELSE 'IDs DO NOT Match'
    END as id_check
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE au.email = 'spencershahidzadeh@gmail.com'; 