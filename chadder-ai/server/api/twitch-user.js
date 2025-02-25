const axios = require('axios');
const { supabase } = require('../supabaseClient');

// Cache for Twitch access tokens to avoid frequent calls
let twitchAccessToken = null;
let tokenExpiry = null;

export default async function handler(req, res) {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check if user is authenticated and is an admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (adminError || !adminData) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Get the username from query parameters
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get Twitch access token if needed
    if (!twitchAccessToken || (tokenExpiry && Date.now() > tokenExpiry)) {
      await getTwitchAccessToken();
    }

    // Fetch user information from Twitch API
    const userInfo = await fetchTwitchUserInfo(username);

    return res.status(200).json(userInfo);

  } catch (error) {
    console.error('Error fetching Twitch user info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Function to get Twitch access token
async function getTwitchAccessToken() {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      },
    });

    twitchAccessToken = response.data.access_token;
    // Set token expiry (typically valid for about 60 days, setting to 50 days to be safe)
    tokenExpiry = Date.now() + (50 * 24 * 60 * 60 * 1000);
    
    return twitchAccessToken;
  } catch (error) {
    console.error('Error fetching Twitch access token:', error);
    throw new Error('Failed to get Twitch access token');
  }
}

// Function to fetch Twitch user information
async function fetchTwitchUserInfo(username) {
  try {
    const response = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${twitchAccessToken}`,
      },
      params: {
        login: username,
      },
    });

    if (response.data.data.length === 0) {
      throw new Error('Twitch user not found');
    }

    return response.data.data[0];
  } catch (error) {
    console.error('Error fetching Twitch user info:', error);
    throw new Error('Failed to fetch Twitch user info');
  }
} 