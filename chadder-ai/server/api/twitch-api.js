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

// Twitch API credentials - we only need the Client ID for public data
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;

// Log initialization info
console.log('Twitch API Router initialized, Client ID available:', !!TWITCH_CLIENT_ID);
console.log('Client ID value first 5 chars:', TWITCH_CLIENT_ID ? TWITCH_CLIENT_ID.substring(0, 5) : 'N/A');

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
      // Headers for Twitch API - only need Client-ID for public data
      const headers = {
        'Client-ID': TWITCH_CLIENT_ID
      };
      
      console.log('Making Twitch API request for users');
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
      let allStreams = [];
      
      for (let i = 0; i < userIds.length; i += MAX_USERS_PER_REQUEST) {
        const batchUserIds = userIds.slice(i, i + MAX_USERS_PER_REQUEST);
        
        const params = new URLSearchParams();
        batchUserIds.forEach(id => params.append('user_id', id));
        
        const streamsResponse = await axios.get(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
          headers,
        });
        
        if (streamsResponse.data.data && streamsResponse.data.data.length > 0) {
          allStreams = allStreams.concat(streamsResponse.data.data);
        }
      }
      
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
        console.error('Response data:', twitchError.response.data);
      }
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
    
    const headers = {
      'Client-ID': TWITCH_CLIENT_ID
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
    
    // Return status information
    res.json({
      status: 'ok',
      environment: {
        clientIdPresent: !!TWITCH_CLIENT_ID,
        clientIdFirstChars: TWITCH_CLIENT_ID ? TWITCH_CLIENT_ID.substring(0, 5) + '...' : 'N/A',
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