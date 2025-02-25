# Admin Dashboard Setup

This guide walks you through setting up the admin dashboard for managing streamers in the Chadder.ai application.

## Overview

The admin dashboard allows you to:
- Add new streamers by providing their Twitch URL and bio
- Remove existing streamers
- Edit streamers directly using a JSON editor
- Export streamer data as JSON

## Setup Instructions

### 1. Create the Admins Table in Supabase

Run the SQL migration script to create the necessary tables and permissions:

```sql
-- From migrations/create_admins_table.sql
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT unique_admin_user_id UNIQUE (user_id)
);

-- Enable RLS on admins table
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to read other admins
CREATE POLICY "Admins can read the admins table"
  ON public.admins
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create policy for admins to manage other admins
CREATE POLICY "Admins can manage the admins table"
  ON public.admins
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

You can run this in the Supabase SQL Editor.

### 2. Make Yourself an Admin

Use the provided script to make your account an admin:

1. Create a `.env` file in the project root with the following variables:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. Install dependencies if needed:
```bash
npm install dotenv @supabase/supabase-js
```

3. Run the script:
```bash
node scripts/create-admin.js your-email@example.com
```

### 3. Accessing the Admin Dashboard

1. Log in to your account using your regular login credentials
2. You'll be automatically redirected to the admin dashboard if your account has admin privileges
3. Alternatively, you can access the admin dashboard at `/admin`

## Managing Streamers

### Adding a Streamer

1. Enter the Twitch URL (e.g., https://twitch.tv/username) in the "Twitch URL" field
2. Enter a bio for the streamer (optional)
3. Click "Add Streamer"

### Removing a Streamer

1. Find the streamer in the list
2. Click the "Remove" button next to their entry

### Editing JSON Directly

1. Click "Edit as JSON" to switch to JSON editing mode
2. Make your changes to the JSON
3. Click "Apply" to save your changes
4. Click "Cancel" to discard your changes

### Saving Changes

During development:
1. Click "Copy JSON" to copy the streamer data to your clipboard
2. Manually update the `src/data/streamers.json` file with this data

In production:
1. Click "Save to Server" to update the streamers list on the server (requires API implementation)

## Setting Up the API Endpoints (Production)

For production use, you'll need to implement two API endpoints:

1. `/api/update-streamers` - For updating the streamers.json file
2. `/api/twitch-user` - For fetching Twitch user information

These endpoints are already set up in the `server/api` directory and need to be connected to your production server.

## Troubleshooting

- If you're unable to access the admin dashboard, verify your admin status in the Supabase database
- If changes aren't saving, check the browser console for errors
- For any other issues, check the server logs for API-related errors

## Security Considerations

- Keep your Supabase service role key confidential
- Only grant admin access to trusted users
- Consider implementing additional security measures for production use, such as rate limiting and IP restrictions 