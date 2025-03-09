import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Make sure environment variables are loaded
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const router = express.Router();

// Twitch API credentials from environment variables
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;

// Log initialization status
console.log(`Twitch API Router initialized, Client ID available: ${Boolean(TWITCH_CLIENT_ID)}`);
if (!TWITCH_CLIENT_ID) {
  console.warn('WARNING: Twitch Client ID is missing. API calls may fail.');
}

// Variables to store the access token and its expiry
let twitchAccessToken = null;
let tokenExpiry = 0;

// Function to get Twitch access token
async function getTwitchAccessToken() {
  try {
    // Check if token is still valid
    if (twitchAccessToken && Date.now() < tokenExpiry) {
      return twitchAccessToken;
    }

    // Try to get a new token using client credentials flow
    try {
      console.log('Attempting to get Twitch access token with client ID only');
      
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: TWITCH_CLIENT_ID,
          grant_type: 'client_credentials'
        }
      });

      twitchAccessToken = response.data.access_token;
      // Token expires in seconds, convert to milliseconds
      tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('Successfully obtained Twitch access token');
      return twitchAccessToken;
    } catch (tokenError) {
      console.error('Error in client credentials flow:', tokenError.message);
      console.log('Proceeding without access token, will use client ID only');
      return null;
    }
  } catch (error) {
    console.error('Unexpected error in getTwitchAccessToken:', error);
    return null;
  }
}

// GET access token endpoint
router.get('/token', async (req, res) => {
  try {
    const token = await getTwitchAccessToken();
    
    if (token) {
      res.json({ 
        access_token: token,
        expires_in: Math.floor((tokenExpiry - Date.now()) / 1000) // Convert to seconds
      });
    } else {
      // Instead of returning an error, inform the client that no token is available
      // but they can still use the client ID
      res.json({ 
        message: 'No access token available, use client ID only',
        client_id: TWITCH_CLIENT_ID
      });
    }
  } catch (error) {
    console.error('Error in token endpoint:', error);
    res.status(500).json({ error: 'Failed to get access token' });
  }
});

// GET streamers endpoint
router.get('/streamers', async (req, res) => {
  try {
    const { logins } = req.query;
    
    if (!logins) {
      return res.status(400).json({ error: 'Missing logins parameter' });
    }
    
    const usernames = logins.split(',');
    console.log(`Fetching streamers data for: ${usernames.join(', ')}`);
    
    // Set up headers with client ID always included
    const headers = {
      'Client-ID': TWITCH_CLIENT_ID
    };
    
    // Try to get an access token, but don't fail if we can't
    try {
      const accessToken = await getTwitchAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log('Using access token for streamers request');
      } else {
        console.log('No access token available, using client ID only');
      }
    } catch (tokenError) {
      console.warn('Error getting access token:', tokenError.message);
    }
    
    // Fetch user information (includes profile images)
    try {
      const userResponse = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers,
        params: {
          login: usernames
        }
      });
      
      const users = userResponse.data.data;
      
      if (!users || users.length === 0) {
        console.log('No users found from Twitch API');
        return res.json([]);
      }
      
      console.log(`Found ${users.length} users from Twitch API`);
      const userIds = users.map(user => user.id);
      
      // Fetch stream information
      const streamsResponse = await axios.get('https://api.twitch.tv/helix/streams', {
        headers,
        params: {
          user_id: userIds
        }
      });
      
      const liveStreams = streamsResponse.data.data;
      console.log(`Found ${liveStreams?.length || 0} live streams`);
      
      // Fetch game information if needed
      let games = [];
      if (liveStreams && liveStreams.length > 0) {
        const gameIds = liveStreams.map(stream => stream.game_id).filter(id => id);
        
        if (gameIds.length > 0) {
          const gamesResponse = await axios.get('https://api.twitch.tv/helix/games', {
            headers,
            params: {
              id: gameIds
            }
          });
          games = gamesResponse.data.data || [];
          console.log(`Found ${games.length} games`);
        }
      }
      
      // Combine all the data
      const result = users.map(user => {
        const stream = liveStreams?.find(s => s.user_id === user.id);
        const game = games.find(g => g.id === stream?.game_id);
        
        return {
          id: user.id,
          user_id: user.id,
          user_login: user.login.toLowerCase(),
          user_name: user.display_name,
          profile_image_url: user.profile_image_url,
          title: stream ? stream.title : 'Offline',
          type: stream ? 'live' : 'offline',
          viewer_count: stream ? stream.viewer_count : null,
          game_name: game ? game.name : 'N/A',
          thumbnail_url: stream
            ? stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
            : 'https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg',
          bio: user.description || 'No bio available.'
        };
      });
      
      console.log(`Returning ${result.length} processed streamers`);
      res.json(result);
    } catch (apiError) {
      console.error('Error making Twitch API requests:', apiError.message);
      if (apiError.response) {
        console.error('API Error Details:', apiError.response.data);
      }
      res.status(500).json({ error: 'Failed to fetch streamer data from Twitch API' });
    }
  } catch (error) {
    console.error('Unexpected error in /streamers endpoint:', error);
    res.status(500).json({ error: 'Server error processing streamer request' });
  }
});

// GET user endpoint
router.get('/user/:login', async (req, res) => {
  try {
    const { login } = req.params;
    
    if (!login) {
      return res.status(400).json({ error: 'Missing login parameter' });
    }
    
    console.log(`Fetching user data for: ${login}`);
    
    // Set up headers with client ID always included
    const headers = {
      'Client-ID': TWITCH_CLIENT_ID
    };
    
    // Try to get an access token, but don't fail if we can't
    try {
      const accessToken = await getTwitchAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log('Using access token for user request');
      } else {
        console.log('No access token available, using client ID only');
      }
    } catch (tokenError) {
      console.warn('Error getting access token for user request:', tokenError.message);
    }
    
    try {
      const response = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers,
        params: {
          login
        }
      });
      
      if (response.data.data && response.data.data.length > 0) {
        console.log(`Successfully fetched user data for ${login}`);
        res.json(response.data.data[0]);
      } else {
        console.log(`User not found: ${login}`);
        res.status(404).json({ error: 'User not found' });
      }
    } catch (apiError) {
      console.error(`Error fetching user ${login}:`, apiError.message);
      if (apiError.response) {
        console.error('API Error Details:', apiError.response.data);
      }
      res.status(500).json({ error: 'Failed to fetch user data from Twitch API' });
    }
  } catch (error) {
    console.error('Unexpected error in /user endpoint:', error);
    res.status(500).json({ error: 'Server error processing user request' });
  }
});

export default router; 