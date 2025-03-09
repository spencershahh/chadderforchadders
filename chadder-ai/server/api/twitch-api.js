import express from 'express';
import axios from 'axios';

const router = express.Router();

// Twitch API credentials from environment variables
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;

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

    // Get a new token using client credentials flow
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        grant_type: 'client_credentials'
      }
    });

    twitchAccessToken = response.data.access_token;
    // Token expires in seconds, convert to milliseconds
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    return twitchAccessToken;
  } catch (error) {
    console.error('Error fetching Twitch access token:', error);
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
    
    const usernames = logins.split(',');
    
    // Try to get access token, but don't fail if we can't
    let accessToken = null;
    let headers = {
      'Client-ID': TWITCH_CLIENT_ID
    };
    
    try {
      accessToken = await getTwitchAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (tokenError) {
      console.warn('Could not get access token, proceeding with client ID only:', tokenError);
    }
    
    // Fetch user information (includes profile images)
    const userResponse = await axios.get(`https://api.twitch.tv/helix/users`, {
      headers,
      params: {
        login: usernames
      }
    });
    
    const users = userResponse.data.data;
    
    if (!users || users.length === 0) {
      return res.json([]);
    }
    
    const userIds = users.map(user => user.id);
    
    // Fetch stream information
    const streamsResponse = await axios.get('https://api.twitch.tv/helix/streams', {
      headers,
      params: {
        user_id: userIds
      }
    });
    
    const liveStreams = streamsResponse.data.data;
    
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
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching streamers:', error);
    res.status(500).json({ error: 'Failed to fetch streamers' });
  }
});

// GET user endpoint
router.get('/user/:login', async (req, res) => {
  try {
    const { login } = req.params;
    
    if (!login) {
      return res.status(400).json({ error: 'Missing login parameter' });
    }
    
    // Try to get access token, but don't fail if we can't
    let headers = {
      'Client-ID': TWITCH_CLIENT_ID
    };
    
    try {
      const accessToken = await getTwitchAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (tokenError) {
      console.warn('Could not get access token for user endpoint, proceeding with client ID only:', tokenError);
    }
    
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
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router; 