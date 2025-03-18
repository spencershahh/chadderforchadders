import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Twitch API credentials
const TWITCH_CLIENT_ID = process.env.VITE_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.VITE_TWITCH_CLIENT_SECRET;

/**
 * Get Twitch access token
 */
async function getTwitchAccessToken() {
  try {
    // First check if we have a valid token in the database
    const { data: tokens, error } = await supabase
      .from('api_tokens')
      .select('*')
      .eq('service', 'twitch')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    // If we have a recent token that hasn't expired, use it
    if (tokens && tokens.length > 0) {
      const token = tokens[0];
      const now = new Date();
      const expiryDate = new Date(token.expires_at);
      
      if (expiryDate > now) {
        return token.access_token;
      }
    }

    // Otherwise, get a new token
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Error getting Twitch token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Calculate expiry time (subtract 5 minutes to be safe)
    const expiresIn = data.expires_in;
    const expiryDate = new Date(Date.now() + (expiresIn - 300) * 1000);

    // Save the token to the database
    await supabase
      .from('api_tokens')
      .insert({
        service: 'twitch',
        access_token: data.access_token,
        expires_at: expiryDate.toISOString(),
      });

    return data.access_token;
  } catch (error) {
    console.error('Error getting Twitch token:', error);
    throw error;
  }
}

/**
 * Get live streams for a list of user IDs
 */
async function getLiveStreams(userIds, accessToken) {
  try {
    // Split into chunks of 100 (Twitch API limit)
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 100) {
      chunks.push(userIds.slice(i, i + 100));
    }

    // Make requests for each chunk
    const allStreams = [];
    for (const chunk of chunks) {
      const queryString = chunk.map(id => `user_id=${id}`).join('&');
      const response = await fetch(`https://api.twitch.tv/helix/streams?${queryString}`, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error getting streams: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      allStreams.push(...data.data);
    }

    // Create a map of user_id to stream data for quick lookup
    const streamMap = {};
    allStreams.forEach(stream => {
      streamMap[stream.user_id] = {
        is_live: true,
        view_count: stream.viewer_count,
        game_name: stream.game_name,
        stream_title: stream.title
      };
    });

    return streamMap;
  } catch (error) {
    console.error('Error getting live streams:', error);
    throw error;
  }
}

/**
 * Get user information for a list of user IDs
 */
async function getUserInfo(userIds, accessToken) {
  try {
    // Split into chunks of 100 (Twitch API limit)
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 100) {
      chunks.push(userIds.slice(i, i + 100));
    }

    // Make requests for each chunk
    const allUsers = [];
    for (const chunk of chunks) {
      const queryString = chunk.map(id => `id=${id}`).join('&');
      const response = await fetch(`https://api.twitch.tv/helix/users?${queryString}`, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error getting user info: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      allUsers.push(...data.data);
    }

    // Create a map of user_id to user data for quick lookup
    const userMap = {};
    allUsers.forEach(user => {
      userMap[user.id] = {
        description: user.description,
        profile_image_url: user.profile_image_url,
        view_count: user.view_count,
        broadcaster_type: user.broadcaster_type
      };
    });

    return userMap;
  } catch (error) {
    console.error('Error getting user info:', error);
    throw error;
  }
}

/**
 * API endpoint to get streamers with real-time Twitch data
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get streamers from database
    const { data: streamers, error } = await supabase
      .from('twitch_streamers')
      .select('*')
      .order('votes', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!streamers || streamers.length === 0) {
      return res.status(404).json({ error: 'No streamers found' });
    }

    // Get Twitch access token
    const accessToken = await getTwitchAccessToken();

    // Extract user IDs
    const userIds = streamers.map(streamer => streamer.twitch_id);

    // Get live stream data and user info in parallel
    const [streamMap, userMap] = await Promise.all([
      getLiveStreams(userIds, accessToken),
      getUserInfo(userIds, accessToken)
    ]);

    // Update streamer data with live status, view count, and user info
    const updatedStreamers = streamers.map(streamer => {
      const streamData = streamMap[streamer.twitch_id];
      const userData = userMap[streamer.twitch_id];
      
      return {
        ...streamer,
        ...userData, // Add user data (bio, profile image, etc.)
        is_live: !!streamData,
        view_count: streamData?.view_count || 0,
        game_name: streamData?.game_name,
        stream_title: streamData?.stream_title
      };
    });

    // Update the database with the new information
    const updates = updatedStreamers.map(async (streamer) => {
      return supabase
        .from('twitch_streamers')
        .update({
          is_live: streamer.is_live,
          view_count: streamer.view_count || 0,
          description: streamer.description // Add bio to database
        })
        .eq('id', streamer.id);
    });

    await Promise.all(updates);

    return res.status(200).json({
      success: true,
      streamers: updatedStreamers
    });
  } catch (error) {
    console.error('Error in getStreamers API:', error);
    return res.status(500).json({ error: 'Failed to fetch streamers' });
  }
} 