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
// Use dedicated server variables, falling back to the frontend variables if needed
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || process.env.VITE_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Log initialization info
console.log('Twitch API Router initialized, Client ID available:', !!TWITCH_CLIENT_ID);
console.log('Client Secret available:', !!TWITCH_CLIENT_SECRET);

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

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      console.error('Missing Twitch credentials! Need both Client ID and Client Secret');
      throw new Error('Missing Twitch API credentials');
    }

    console.log('Getting new Twitch access token with Client Credentials flow');
    
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      }
    });

    twitchAccessToken = response.data.access_token;
    // Token expires in seconds, convert to milliseconds
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    console.log('Successfully obtained Twitch access token');
    return twitchAccessToken;
  } catch (error) {
    console.error('Error fetching Twitch access token:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw new Error('Failed to get Twitch access token');
  }
}

// GET access token endpoint
router.get('/token', async (req, res) => {
  try {
    const token = await getTwitchAccessToken();
    res.json({ 
      access_token: token,
      expires_in: Math.floor((tokenExpiry - Date.now()) / 1000) // Convert to seconds
    });
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
    
    console.log('Fetch streamers request for logins:', logins);
    const usernames = logins.split(',');
    
    try {
      // Get access token - this will throw an error if it fails
      const accessToken = await getTwitchAccessToken();
    
      // Fetch user information (includes profile images)
      const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      };
      
      console.log('Making Twitch API request for users with valid token');
      
      const userResponse = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers,
        params: {
          login: usernames
        }
      });
      
      const users = userResponse.data.data;
      console.log(`Received ${users?.length || 0} users from Twitch API`);
      
      if (!users || users.length === 0) {
        console.log('No users found from Twitch API');
        return res.json([]);
      }
      
      const userIds = users.map(user => user.id);
      
      // Fetch stream information
      console.log('Fetching stream information for', userIds.length, 'users');
      const streamsResponse = await axios.get('https://api.twitch.tv/helix/streams', {
        headers,
        params: {
          user_id: userIds
        }
      });
      
      const liveStreams = streamsResponse.data.data;
      console.log(`Received ${liveStreams?.length || 0} live streams from Twitch API`);
      
      // Fetch game information if needed
      let games = [];
      if (liveStreams && liveStreams.length > 0) {
        const gameIds = liveStreams.map(stream => stream.game_id).filter(id => id);
        
        if (gameIds.length > 0) {
          console.log('Fetching game information for', gameIds.length, 'games');
          const gamesResponse = await axios.get('https://api.twitch.tv/helix/games', {
            headers,
            params: {
              id: gameIds
            }
          });
          games = gamesResponse.data.data || [];
          console.log(`Received ${games.length} games from Twitch API`);
        }
      }
      
      // Combine all the data
      const result = users.map(user => {
        const stream = liveStreams.find(s => s.user_id === user.id);
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
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError.message);
      // Return empty result on error
      res.status(500).json({ error: 'Failed to fetch data from Twitch API', details: twitchError.message });
    }
  } catch (error) {
    console.error('Error in /streamers endpoint:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET user endpoint
router.get('/user/:login', async (req, res) => {
  try {
    const { login } = req.params;
    
    if (!login) {
      return res.status(400).json({ error: 'Missing login parameter' });
    }
    
    try {
      const accessToken = await getTwitchAccessToken();
      
      const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      };
      
      const response = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers,
        params: {
          login
        }
      });
      
      if (response.data.data && response.data.data.length > 0) {
        res.json(response.data.data[0]);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError.message);
      res.status(500).json({ error: 'Failed to fetch user from Twitch API', details: twitchError.message });
    }
  } catch (error) {
    console.error('Error in /user endpoint:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Add a test endpoint to verify connectivity
router.get('/test', async (req, res) => {
  try {
    const clientId = TWITCH_CLIENT_ID;
    const clientSecret = TWITCH_CLIENT_SECRET;
    
    console.log('Test endpoint called, client ID:', clientId ? 'Present' : 'Missing');
    console.log('Client Secret:', clientSecret ? 'Present' : 'Missing');
    
    // Return status information
    res.json({
      status: 'ok',
      environment: {
        clientIdPresent: !!clientId,
        clientIdFirstChars: clientId ? clientId.substring(0, 5) + '...' : 'N/A',
        clientSecretPresent: !!clientSecret,
        clientSecretFirstChars: clientSecret ? clientSecret.substring(0, 5) + '...' : 'N/A',
        nodeVersion: process.version,
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ error: 'Test endpoint failed', details: error.message });
  }
});

export default router; 