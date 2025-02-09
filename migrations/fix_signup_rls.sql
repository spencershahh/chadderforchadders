-- Temporarily disable RLS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.users;

-- Create new policies that allow signup
CREATE POLICY "Enable read access for all users"
ON public.users FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for signup"
ON public.users FOR INSERT
TO public  -- Changed from authenticated to public to allow signup
WITH CHECK (true);  -- Allow all inserts during signup

CREATE POLICY "Enable update for users based on id"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Grant necessary permissions
GRANT ALL ON public.users TO authenticated;
GRANT SELECT, INSERT ON public.users TO anon;  -- Added INSERT permission for anon

-- Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Verify the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_created(); 