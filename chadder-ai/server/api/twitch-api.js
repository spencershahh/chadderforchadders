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
// For confidential clients, we use server-side variables
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'wk5ebp17im6knf70jgs0oxiljihr3r';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'dmlq88lzc5sp69j4une5wcqkx0o2el';

// Log initialization info
console.log('Twitch API Router initialized, Client ID available:', !!TWITCH_CLIENT_ID);
console.log('Client Secret available:', !!TWITCH_CLIENT_SECRET);
console.log('Client ID value first 5 chars:', TWITCH_CLIENT_ID ? TWITCH_CLIENT_ID.substring(0, 5) : 'N/A');

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

    console.log('Getting new Twitch access token with Client Credentials flow');
    
    // Using axios's params option which properly formats the request
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
      console.log('Successfully obtained access token for streamers request');
      
      // Fetch user information (includes profile images)
      const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      };
      
      console.log('Making Twitch API request for users with valid token');
      console.log('User count:', usernames.length);
      
      // Fetch in smaller batches to avoid URL length issues
      const MAX_USERS_PER_REQUEST = 20;
      let allUsers = [];
      
      for (let i = 0; i < usernames.length; i += MAX_USERS_PER_REQUEST) {
        const batchUsernames = usernames.slice(i, i + MAX_USERS_PER_REQUEST);
        
        console.log(`Fetching batch ${i/MAX_USERS_PER_REQUEST + 1} with ${batchUsernames.length} users`);
        
        const params = new URLSearchParams();
        batchUsernames.forEach(username => params.append('login', username));
        
        const userResponse = await axios.get(`https://api.twitch.tv/helix/users?${params.toString()}`, {
          headers,
        });
        
        if (userResponse.data.data && userResponse.data.data.length > 0) {
          allUsers = allUsers.concat(userResponse.data.data);
        }
      }
      
      console.log(`Received ${allUsers.length} users from Twitch API`);
      
      if (!allUsers || allUsers.length === 0) {
        console.log('No users found from Twitch API');
        return res.json([]);
      }
      
      const userIds = allUsers.map(user => user.id);
      
      // Fetch stream information
      console.log('Fetching stream information for', userIds.length, 'users');
      
      // Fetch streams in batches too
      let allStreams = [];
      
      for (let i = 0; i < userIds.length; i += MAX_USERS_PER_REQUEST) {
        const batchUserIds = userIds.slice(i, i + MAX_USERS_PER_REQUEST);
        
        console.log(`Fetching stream batch ${i/MAX_USERS_PER_REQUEST + 1} with ${batchUserIds.length} users`);
        
        const params = new URLSearchParams();
        batchUserIds.forEach(id => params.append('user_id', id));
        
        const streamsResponse = await axios.get(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
          headers,
        });
        
        if (streamsResponse.data.data && streamsResponse.data.data.length > 0) {
          allStreams = allStreams.concat(streamsResponse.data.data);
        }
      }
      
      console.log(`Received ${allStreams.length} live streams from Twitch API`);
      
      // Combine all the data
      const result = allUsers.map(user => {
        const stream = allStreams.find(s => s.user_id === user.id);
        
        return {
          id: user.id,
          user_id: user.id,
          user_login: user.login.toLowerCase(),
          user_name: user.display_name,
          profile_image_url: user.profile_image_url,
          title: stream ? stream.title : 'Offline',
          type: stream ? 'live' : 'offline',
          viewer_count: stream ? stream.viewer_count : null,
          game_name: stream ? stream.game_name : 'N/A',
          thumbnail_url: stream
            ? stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
            : 'https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg',
          bio: user.description || 'No bio available.'
        };
      });
      
      console.log(`Returning ${result.length} processed streamers`);
      return res.json(result);
      
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError.message);
      
      if (twitchError.response) {
        console.error('Status:', twitchError.response.status);
        console.error('Twitch API response:', twitchError.response.data);
      }
      
      // Return empty result on error
      return res.status(500).json({ 
        error: 'Failed to fetch data from Twitch API', 
        details: twitchError.message
      });
    }
  } catch (error) {
    console.error('Error in /streamers endpoint:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message
    });
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
      console.log(`Successfully obtained access token for user request: ${login}`);
      
      const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      };
      
      console.log(`Making Twitch API request for user: ${login}`);
      
      const response = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers,
        params: {
          login
        }
      });
      
      if (response.data.data && response.data.data.length > 0) {
        console.log(`Successfully retrieved data for user: ${login}`);
        return res.json(response.data.data[0]);
      } else {
        console.log(`User not found: ${login}`);
        return res.status(404).json({ error: 'User not found' });
      }
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError.message);
      if (twitchError.response) {
        console.error('Status:', twitchError.response.status);
        console.error('Response data:', twitchError.response.data);
      }
      return res.status(500).json({ 
        error: 'Failed to fetch user from Twitch API', 
        details: twitchError.message
      });
    }
  } catch (error) {
    console.error('Error in /user endpoint:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message
    });
  }
});

// Add a test endpoint to verify connectivity
router.get('/test', async (req, res) => {
  try {
    console.log('Test endpoint called, client ID:', TWITCH_CLIENT_ID ? 'Present' : 'Missing');
    console.log('Client Secret:', TWITCH_CLIENT_SECRET ? 'Present' : 'Missing');
    
    // Return status information
    res.json({
      status: 'ok',
      environment: {
        clientIdPresent: !!TWITCH_CLIENT_ID,
        clientIdFirstChars: TWITCH_CLIENT_ID ? TWITCH_CLIENT_ID.substring(0, 5) + '...' : 'N/A',
        clientSecretPresent: !!TWITCH_CLIENT_SECRET,
        clientSecretFirstChars: TWITCH_CLIENT_SECRET ? TWITCH_CLIENT_SECRET.substring(0, 5) + '...' : 'N/A',
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