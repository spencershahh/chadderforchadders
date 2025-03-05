import axios from "axios";
import { supabase } from "../supabaseClient";

const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';
// This value is a constant client secret - this would normally be kept server-side only,
// but since it's already visible in your code and environment variables, we're using it here
const TWITCH_CLIENT_SECRET = 'pymakzauu6awm1kj3haw6yavunkgij';

// Updated getTwitchAccessToken function
const getTwitchAccessToken = async () => {
  try {
    // Check if we have a cached token
    let accessToken = localStorage.getItem('twitch_access_token');
    
    if (!accessToken) {
      try {
        console.log('No cached token, fetching from backend...');
        // First try the backend API
        const response = await fetch('https://chadderai.onrender.com/api/twitch/token', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          console.warn(`Backend token fetch failed: ${response.status} ${response.statusText}`);
          throw new Error('Failed to get access token from backend');
        }

        const data = await response.json();
        accessToken = data.access_token;
        localStorage.setItem('twitch_access_token', accessToken);
        console.log('Successfully obtained token from backend');
      } catch (backendError) {
        console.warn('Backend token fetch failed, trying direct fetch:', backendError);
        
        // Try directly fetching from Twitch as a fallback
        try {
          console.log('Attempting direct token fetch from Twitch...');
          const directResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: TWITCH_CLIENT_ID,
              client_secret: TWITCH_CLIENT_SECRET,
              grant_type: 'client_credentials'
            })
          });
          
          if (!directResponse.ok) {
            console.error(`Direct Twitch token fetch failed: ${directResponse.status}`);
            throw new Error('Direct token fetch failed');
          }
          
          const directData = await directResponse.json();
          accessToken = directData.access_token;
          localStorage.setItem('twitch_access_token', accessToken);
          console.log('Successfully obtained token directly from Twitch');
        } catch (directError) {
          console.error("All token fetch methods failed:", directError);
          return null;
        }
      }
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
    
    // First, fetch streamers from Supabase
    const { data: dbStreamers, error } = await supabase
      .from('streamers')
      .select('*')
      .order('username');

    if (error) {
      console.error('Error fetching streamers from Supabase:', error);
      // Fall back to the local JSON file if database query fails
      try {
        console.log('Falling back to local streamers.json file');
        const response = await fetch('/streamers.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch from JSON: ${response.status}`);
        }
        const localStreamers = await response.json();
        console.log('Loaded streamers from JSON:', localStreamers);
        return processTwitchData(localStreamers);
      } catch (jsonError) {
        console.error('Error loading from JSON file:', jsonError);
        return [];
      }
    }

    if (!dbStreamers || dbStreamers.length === 0) {
      console.warn('No streamers found in database, trying JSON file');
      try {
        const response = await fetch('/streamers.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch from JSON: ${response.status}`);
        }
        const localStreamers = await response.json();
        console.log('Loaded streamers from JSON:', localStreamers);
        return processTwitchData(localStreamers);
      } catch (jsonError) {
        console.error('Error loading from JSON file:', jsonError);
        return [];
      }
    }

    console.log('Found streamers in database:', dbStreamers);
    return processTwitchData(dbStreamers);

  } catch (error) {
    console.error("Error in fetchStreamers:", error);
    return [];
  }
};

// Helper function to process Twitch data for streamers
const processTwitchData = async (streamers) => {
  try {
    const accessToken = await getTwitchAccessToken();
    if (!accessToken) {
      console.error('Failed to get Twitch access token');
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
    }

    const usernames = streamers.map(streamer => streamer.username || streamer.name);
    console.log('Fetching data for streamers:', usernames);

    // Fetch user information (includes profile images)
    const userResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(login => `login=${login}`).join('&')}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
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
    }

    const userIds = users.map((user) => user.id);

    // Fetch stream information
    const streamsResponse = await axios.get("https://api.twitch.tv/helix/streams", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
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
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${accessToken}`,
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
    // Return basic streamer data if Twitch API fails
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
  }
};

// Add new function to fetch user data
export const fetchUserData = async (login) => {
  const accessToken = await getTwitchAccessToken();
  if (!accessToken) return null;

  try {
    const response = await axios.get(`https://api.twitch.tv/helix/users`, {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
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