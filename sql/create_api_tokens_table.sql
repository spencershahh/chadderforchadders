-- Create api_tokens table to store credentials for external APIs
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service VARCHAR NOT NULL,  -- e.g., 'twitch', 'twitter', etc.
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  client_id TEXT,
  client_secret TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(service)
);

-- Enable RLS
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies (very restrictive - only authenticated admins can access)
CREATE POLICY "Only admins can select api_tokens" 
  ON public.api_tokens 
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT user_id FROM admins
    )
  );

CREATE POLICY "Only admins can insert api_tokens" 
  ON public.api_tokens 
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM admins
    )
  );

CREATE POLICY "Only admins can update api_tokens" 
  ON public.api_tokens 
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM admins
    )
  );

-- Create secure function to get token for a specific service
-- This allows the client app to request a token without directly accessing the table
CREATE OR REPLACE FUNCTION public.get_service_token(service_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    token_record RECORD;
    result JSON;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get the token
    SELECT 
        access_token,
        client_id,
        expires_at
    INTO token_record
    FROM api_tokens
    WHERE service = service_name;

    -- Return as JSON
    SELECT json_build_object(
        'access_token', token_record.access_token,
        'client_id', token_record.client_id,
        'expires_at', token_record.expires_at
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_service_token TO authenticated;

-- Insert default Twitch API token (you'll need to replace these with your actual values)
INSERT INTO public.api_tokens (service, access_token, refresh_token, client_id, client_secret, expires_at)
VALUES ('twitch', 'your_access_token_here', 'your_refresh_token_here', 'your_client_id_here', 'your_client_secret_here', NOW() + INTERVAL '1 hour')
ON CONFLICT (service)
DO UPDATE SET 
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  client_id = EXCLUDED.client_id,
  client_secret = EXCLUDED.client_secret,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW(); 