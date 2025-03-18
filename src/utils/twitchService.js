import { supabase } from './supabaseClient';

// Constants for API requests
const TWITCH_API_BASE_URL = 'https://api.twitch.tv/helix';
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

// Function to fetch and refresh Twitch API token
const getTwitchToken = async () => {
  try {
    // Use the secure RPC function we created to get tokens
    const { data, error } = await supabase.rpc('get_service_token', {
      service_name: 'twitch'
    });
    
    if (error) throw error;
    
    if (!data || !data.access_token) {
      throw new Error('No valid token found');
    }
    
    // Check if token is expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt <= new Date()) {
      // Token is expired - this would normally trigger a refresh
      // but in our setup, token refreshes should be handled by an admin
      // or a secure server-side function
      console.warn('Twitch token expired - contact administrator');
    }
    
    return {
      accessToken: data.access_token,
      clientId: data.client_id
    };
  } catch (error) {
    console.error('Error getting Twitch token:', error);
    throw new Error('Unable to authenticate with Twitch');
  }
};

// Get Twitch API headers with authorization
const getTwitchHeaders = async () => {
  const { accessToken, clientId } = await getTwitchToken();
  
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Client-Id': clientId,
    'Content-Type': 'application/json',
  };
};

// Fetch top live streamers
export const fetchTopStreamers = async (limit = 20) => {
  try {
    const headers = await getTwitchHeaders();
    
    // First, get top streams
    const streamsResponse = await fetch(
      `${TWITCH_API_BASE_URL}/streams?first=${limit}`,
      { headers }
    );
    
    if (!streamsResponse.ok) {
      throw new Error(`Error fetching streams: ${streamsResponse.status}`);
    }
    
    const streamsData = await streamsResponse.json();
    
    // Extract user IDs for additional info
    const userIds = streamsData.data.map(stream => stream.user_id);
    
    if (userIds.length === 0) {
      return [];
    }
    
    // Get user info for all streamers
    const usersResponse = await fetch(
      `${TWITCH_API_BASE_URL}/users?id=${userIds.join('&id=')}`,
      { headers }
    );
    
    if (!usersResponse.ok) {
      throw new Error(`Error fetching users: ${usersResponse.status}`);
    }
    
    const usersData = await usersResponse.json();
    
    // Combine stream and user data
    const streamers = streamsData.data.map(stream => {
      const user = usersData.data.find(user => user.id === stream.user_id);
      
      return {
        twitch_id: stream.user_id,
        username: stream.user_login,
        display_name: stream.user_name,
        description: user?.description || '',
        profile_image_url: user?.profile_image_url || '',
        view_count: stream.viewer_count || 0,
        game_name: stream.game_name,
        title: stream.title,
        thumbnail_url: stream.thumbnail_url?.replace('{width}', '600').replace('{height}', '400'),
        started_at: stream.started_at,
        language: stream.language,
        is_live: true,
        // We don't set votes here as those come from our database
      };
    });
    
    return streamers;
  } catch (error) {
    console.error('Error in fetchTopStreamers:', error);
    throw error;
  }
};

// Fetch a specific streamer by Twitch ID
export const fetchStreamerById = async (twitchId) => {
  try {
    const headers = await getTwitchHeaders();
    
    // Get user info
    const userResponse = await fetch(
      `${TWITCH_API_BASE_URL}/users?id=${twitchId}`,
      { headers }
    );
    
    if (!userResponse.ok) {
      throw new Error(`Error fetching user: ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();
    
    if (!userData.data || userData.data.length === 0) {
      throw new Error('Streamer not found');
    }
    
    const user = userData.data[0];
    
    // Check if user is streaming
    const streamResponse = await fetch(
      `${TWITCH_API_BASE_URL}/streams?user_id=${twitchId}`,
      { headers }
    );
    
    if (!streamResponse.ok) {
      throw new Error(`Error fetching stream: ${streamResponse.status}`);
    }
    
    const streamData = await streamResponse.json();
    const isLive = streamData.data && streamData.data.length > 0;
    
    // Combine data
    return {
      twitch_id: user.id,
      username: user.login,
      display_name: user.display_name,
      description: user.description || '',
      profile_image_url: user.profile_image_url || '',
      view_count: user.view_count || 0,
      is_live: isLive,
      stream_info: isLive ? streamData.data[0] : null,
    };
  } catch (error) {
    console.error('Error in fetchStreamerById:', error);
    throw error;
  }
};

// Search for streamers by username
export const searchStreamers = async (query, limit = 20) => {
  try {
    const headers = await getTwitchHeaders();
    
    const searchResponse = await fetch(
      `${TWITCH_API_BASE_URL}/search/channels?query=${query}&first=${limit}`,
      { headers }
    );
    
    if (!searchResponse.ok) {
      throw new Error(`Error searching streamers: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    // Transform data to match our schema
    const streamers = searchData.data.map(channel => ({
      twitch_id: channel.id,
      username: channel.broadcaster_login,
      display_name: channel.display_name,
      description: channel.title || '',
      profile_image_url: channel.thumbnail_url || '',
      view_count: 0, // Actual view count isn't available in search results
      is_live: channel.is_live,
      game_name: channel.game_name || '',
    }));
    
    return streamers;
  } catch (error) {
    console.error('Error in searchStreamers:', error);
    throw error;
  }
};

// Save or update streamer in database
export const saveStreamerToDatabase = async (streamer) => {
  try {
    // Check if streamer already exists
    const { data: existingStreamer, error: fetchError } = await supabase
      .from('twitch_streamers')
      .select('id, votes')
      .eq('twitch_id', streamer.twitch_id)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "row not found" error
      throw fetchError;
    }
    
    const streamerData = {
      twitch_id: streamer.twitch_id,
      username: streamer.username,
      display_name: streamer.display_name,
      description: streamer.description,
      profile_image_url: streamer.profile_image_url,
      view_count: streamer.view_count,
      is_live: streamer.is_live || false,
      // Preserve existing vote count if it exists
      votes: existingStreamer ? existingStreamer.votes : 0,
      updated_at: new Date(),
    };
    
    let result;
    
    if (existingStreamer) {
      // Update existing record
      const { data, error } = await supabase
        .from('twitch_streamers')
        .update(streamerData)
        .eq('id', existingStreamer.id)
        .select()
        .single();
        
      if (error) throw error;
      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('twitch_streamers')
        .insert(streamerData)
        .select()
        .single();
        
      if (error) throw error;
      result = data;
    }
    
    return result;
  } catch (error) {
    console.error('Error in saveStreamerToDatabase:', error);
    throw error;
  }
};

// Fetch and sync multiple streamers from Twitch API to our database
export const syncTwitchStreamers = async (limit = 20) => {
  try {
    // Fetch top streamers from Twitch
    const streamers = await fetchTopStreamers(limit);
    
    // Save each streamer to database
    const savedStreamers = await Promise.all(
      streamers.map(streamer => saveStreamerToDatabase(streamer))
    );
    
    return savedStreamers;
  } catch (error) {
    console.error('Error syncing Twitch streamers:', error);
    throw error;
  }
};

// Get streamers from our database with their vote counts
export const getStreamersFromDatabase = async (limit = 20, orderBy = 'votes') => {
  try {
    const { data, error } = await supabase
      .from('twitch_streamers')
      .select('*')
      .order(orderBy, { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting streamers from database:', error);
    throw error;
  }
};

// Integration point for DigDeeperScreen to get streamers
export const getStreamersForDigDeeper = async (limit = 20) => {
  try {
    // First, try to get from database
    let streamers = await getStreamersFromDatabase(limit);
    
    // If not enough in database, sync from Twitch
    if (streamers.length < limit) {
      await syncTwitchStreamers(limit);
      streamers = await getStreamersFromDatabase(limit);
    }
    
    return streamers;
  } catch (error) {
    console.error('Error getting streamers for Dig Deeper:', error);
    throw error;
  }
}; 