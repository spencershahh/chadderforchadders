-- First check auth.users
SELECT id, email, last_sign_in_at, created_at
FROM auth.users
WHERE email = 'spencershahidzadeh@gmail.com';

-- Then check public.users
SELECT id, email, created_at
FROM public.users
WHERE email = 'spencershahidzadeh@gmail.com';

-- Check if the trigger is properly set up
SELECT 
    trigger_name,
    event_manipulation,
    event_object_schema,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'; 