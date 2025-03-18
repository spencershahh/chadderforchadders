# Dig Deeper - Tinder for Twitch

This feature allows users to discover new Twitch streamers with a Tinder-like swiping interface. Users can swipe right to add streamers to their favorites and left to pass. Each right swipe adds a vote to the streamer's total, contributing to their ranking on the leaderboard.

## Features

- Swipeable cards showing Twitch streamers
- Live status indication
- Favorite streamers by swiping right
- Leaderboard of the most popular streamers based on user votes
- Favorites management with ability to remove
- Direct Twitch stream viewing

## Setup Instructions

### 1. Database Setup

Run the SQL scripts in the `sql` directory in the following order:

1. Execute `sql/create_twitch_tables.sql` to create the main tables:
   - `twitch_streamers`: Stores streamer information
   - `user_favorites`: Tracks user favorite streamers

2. Execute `sql/create_api_tokens_table.sql` to create the API tokens table:
   - This table securely stores Twitch API credentials
   - Creates a secure RPC function for retrieving tokens

### 2. Twitch API Setup

1. Register a new application on the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Note your Client ID and generate a Client Secret
3. Generate an OAuth token with the following scopes:
   - `user:read:email`
   - `user:read:follows`
   - `clips:edit`

4. Insert your Twitch API credentials into the `api_tokens` table:

```sql
INSERT INTO public.api_tokens (
  service, 
  access_token, 
  refresh_token, 
  client_id, 
  client_secret, 
  expires_at
)
VALUES (
  'twitch', 
  'your_access_token_here', 
  'your_refresh_token_here', 
  'your_client_id_here', 
  'your_client_secret_here', 
  NOW() + INTERVAL '1 hour'
)
ON CONFLICT (service)
DO UPDATE SET 
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  client_id = EXCLUDED.client_id,
  client_secret = EXCLUDED.client_secret,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();
```

### 3. WebView Setup for Embed Playback

For the embedded Twitch player to work, you need to add your app's domain to the allowed list:

1. Edit the `src/screens/StreamScreen.js` file
2. Find the line with `const getEmbedUrl = () => {`
3. Update the `parent` parameter to match your app's domain:

```javascript
const baseUrl = `https://player.twitch.tv/?channel=${streamer.username}&parent=yourdomain.com`;
```

For development, you can use `localhost` or `127.0.0.1` as the parent domain.

### 4. Install Dependencies

Make sure you have the required dependencies installed:

```bash
npm install react-native-webview
```

### 5. Token Refresh

The current implementation requires manual token refresh. For production, implement a server-side cron job or Supabase Edge Function to refresh the Twitch API token automatically before it expires.

## Feature Structure

### Screens
- `DigDeeperScreen.js`: Main swipeable interface
- `FavoritesScreen.js`: Shows user's favorite streamers
- `StreamScreen.js`: Embedded Twitch player
- `LeaderboardScreen.js`: Updated to show streamer votes

### Service
- `twitchService.js`: Contains all Twitch API interactions

### Navigation
- `TabNavigator.js`: Updated with the new Dig Deeper tab

## Usage

1. Navigate to the "Dig Deeper" tab
2. Swipe right to favorite a streamer or left to pass
3. Tap the "Favorites" button to view your saved streamers
4. Long-press on a favorite to remove it
5. Check the "Streamers" tab in the Leaderboard to see the most popular streamers

## Troubleshooting

- **Empty streamer list**: Ensure the Twitch API token is valid and not expired
- **Stream playback issues**: Verify that your domain is allowed in the Twitch embed parent parameter
- **Authentication errors**: Check that your user is logged in and RLS policies are correctly set up

## Next Steps

1. Implement automatic token refresh mechanism
2. Add more filtering options (by game, category, etc.)
3. Enhance streamer cards with more Twitch-specific information
4. Implement real-time notifications when favorited streamers go live
5. Add streamer categories and tags for better discovery