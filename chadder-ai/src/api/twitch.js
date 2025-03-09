import axios from "axios";
import { supabase } from "../supabaseClient";

// Updated with the correct Client ID from your Twitch Developer Console
const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';

// Updated getTwitchAccessToken function for public client using Implicit Grant Flow
const getTwitchAccessToken = async () => {
  try {
    // Check if we have a cached token
    let accessToken = localStorage.getItem('twitch_access_token');
    
    if (!accessToken) {
      // For public clients, we need to use the Implicit Grant Flow
      // This will redirect to Twitch for authentication
      const redirectUri = `${window.location.origin}/auth/twitch`;
      const scope = 'user:read:email'; // Add any scopes you need

      const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}`;
      
      window.location.href = authUrl;
      return null;
    }

    return accessToken;
  } catch (error) {
    console.error("Error in getTwitchAccessToken:", error);
    return null;
  }
};

export const fetchStreamers = async () => {
  try {
    console.log("Starting fetchStreamers process...");
    let streamers = [];
    
    // First, fetch streamers from Supabase
    const { data: dbStreamers, error } = await supabase
      .from('streamers')
      .select('*')
      .order('username');

    if (error) {
      console.error('Error fetching streamers from Supabase:', error);
    } else if (dbStreamers && dbStreamers.length > 0) {
      console.log('Found streamers in database:', dbStreamers.length);
      streamers = dbStreamers;
    } else {
      console.warn('No streamers found in database, using fallback data');
      streamers = [
        { username: 'drewskisquad22', bio: 'Twitch Streamer' },
        { username: 'fatstronaut', bio: 'Twitch Streamer' },
        { username: 'ferretsoftware', bio: 'Twitch Streamer' },
        { username: 'fuslie', bio: 'Twitch Streamer' },
        { username: 'hanner', bio: 'Twitch Streamer' }
      ];
    }
    
    console.log('Processing streamer data with Twitch API, count:', streamers.length);
    return processTwitchData(streamers);
    
  } catch (error) {
    console.error("Error in fetchStreamers:", error);
    return [];
  }
};

// Helper function to process Twitch data for streamers
const processTwitchData = async (streamers) => {
  try {
    const usernames = streamers.map(streamer => streamer.username || streamer.name);
    console.log('Fetching data for streamers:', usernames);

    // Fetch user information (includes profile images)
    const userResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(login => `login=${login}`).join('&')}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID
      }
    });

    if (!userResponse.ok) {
      console.error(`Twitch API error! status: ${userResponse.status}`);
      console.error('Response:', await userResponse.text());
      throw new Error(`HTTP error! status: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    const users = userData.data;
    console.log('Received user data from Twitch:', users);

    if (!users || users.length === 0) {
      console.warn('No users found from Twitch API');
      return getFallbackStreamerData(streamers);
    }

    const userIds = users.map((user) => user.id);

    // Fetch stream information
    const streamsResponse = await axios.get("https://api.twitch.tv/helix/streams", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID
      },
      params: {
        user_id: userIds,
      },
    });

    const liveStreams = streamsResponse.data.data;
    console.log('Live streams data:', liveStreams);

    let games = [];
    if (liveStreams && liveStreams.length > 0) {
      const gameIds = liveStreams.map((stream) => stream.game_id).filter(id => id);
      
      if (gameIds.length > 0) {
        // Fetch game names
        const gamesResponse = await axios.get("https://api.twitch.tv/helix/games", {
          headers: {
            "Client-ID": TWITCH_CLIENT_ID
          },
          params: {
            id: gameIds,
          },
        });
        games = gamesResponse.data.data || [];
      }
    }

    // Combine all the data
    return users.map((user) => {
      const stream = liveStreams.find((s) => s.user_id === user.id);
      const game = games.find((g) => g.id === stream?.game_id);
      const streamerInfo = streamers.find((s) => 
        (s.username?.toLowerCase() === user.login.toLowerCase()) ||
        (s.name?.toLowerCase() === user.login.toLowerCase())
      );

      return {
        id: user.id,
        user_id: user.id,
        user_login: user.login.toLowerCase(),
        user_name: user.display_name,
        profile_image_url: user.profile_image_url,
        title: stream ? stream.title : "Offline",
        type: stream ? "live" : "offline",
        viewer_count: stream ? stream.viewer_count : null,
        game_name: game ? game.name : "N/A",
        thumbnail_url: stream
          ? stream.thumbnail_url.replace("{width}", "320").replace("{height}", "180")
          : "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg",
        bio: streamerInfo?.bio || "No bio available.",
      };
    });
  } catch (error) {
    console.error("Error processing Twitch data:", error);
    return getFallbackStreamerData(streamers);
  }
};

// Helper function to get fallback streamer data
const getFallbackStreamerData = (streamers) => {
  return streamers.map(streamer => ({
    id: null,
    user_id: null,
    user_login: (streamer.username || streamer.name || '').toLowerCase(),
    user_name: streamer.username || streamer.name || 'Unknown',
    profile_image_url: null,
    title: "Offline",
    type: "offline",
    viewer_count: null,
    game_name: "N/A",
    thumbnail_url: "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg",
    bio: streamer.bio || "No bio available.",
  }));
};

// Function to fetch user data
export const fetchUserData = async (login) => {
  try {
    const response = await axios.get(`https://api.twitch.tv/helix/users`, {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID
      },
      params: {
        login: login,
      },
    });

    return response.data.data[0] || null;
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
};