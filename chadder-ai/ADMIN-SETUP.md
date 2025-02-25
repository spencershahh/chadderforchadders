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

## Setting Up the Streamers Database

The admin dashboard now uses a Supabase database to store streamer information, which allows for proper functioning in production environments like Vercel.

### 1. Create the Streamers Table

Run the following SQL migration in your Supabase SQL Editor:

```sql
-- From migrations/create_streamers_table.sql
-- Create the streamers table
CREATE TABLE IF NOT EXISTS public.streamers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL,
  bio TEXT,
  votes INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  viewers INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT unique_streamer_username UNIQUE (username)
);

-- Enable RLS on streamers table
ALTER TABLE public.streamers ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Streamers are readable by everyone"
  ON public.streamers
  FOR SELECT
  USING (true);

-- Create policy for admin write access
CREATE POLICY "Admins can manage streamers"
  ON public.streamers
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.admins
    )
  );

-- Create function to upsert streamers
CREATE OR REPLACE FUNCTION upsert_streamers(streamers_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  streamer JSONB;
  username TEXT;
  bio TEXT;
  counter INTEGER := 0;
BEGIN
  -- Clear existing streamers
  DELETE FROM public.streamers;
  
  -- Insert new streamers
  FOR streamer IN SELECT * FROM jsonb_array_elements(streamers_data)
  LOOP
    username := streamer->>'username';
    bio := streamer->>'bio';
    
    INSERT INTO public.streamers (username, bio)
    VALUES (username, bio)
    ON CONFLICT (username) 
    DO UPDATE SET bio = EXCLUDED.bio, updated_at = now();
    
    counter := counter + 1;
  END LOOP;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Import Existing Streamers

If you already have streamers in your JSON file, you can import them to the database:

1. Make sure your `.env` file contains the following variables:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. Run the import script:
```bash
node scripts/import-streamers.js
```

### 3. Configure Vercel Environment

Make sure your Vercel project has the following environment variables set:

1. `SUPABASE_URL`: Your Supabase project URL
2. `SUPABASE_ANON_KEY`: Your Supabase anon key (for client access)
3. `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for admin operations)

## Troubleshooting

- If you're unable to access the admin dashboard, verify your admin status in the Supabase database
- If changes aren't saving, check the browser console for errors
- For any other issues, check the server logs for API-related errors

## Security Considerations

- Keep your Supabase service role key confidential
- Only grant admin access to trusted users
- Consider implementing additional security measures for production use, such as rate limiting and IP restrictions

## Troubleshooting Streamer Management

If you encounter issues with the streamer management functionality:

1. **"Failed to save to server: Failed to update streamers: 405"**
   - Check if your Vercel serverless function for `/api/update-streamers` is properly deployed
   - Verify that your environment variables are set correctly
   - Try using the direct database update method which should work regardless of API status

2. **"This streamer is already in the list"**
   - This is a validation error to prevent duplicate streamers
   - Check if a streamer with the same username already exists

3. **Changes not persisting after refresh**
   - Make sure you click "Save to Server" after making changes
   - Check the browser console for any errors during the save process
   - Verify that your admin account has the proper permissions 