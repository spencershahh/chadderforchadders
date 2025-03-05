import axios from "axios";
import { supabase } from "../supabaseClient";

const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';

// Updated getTwitchAccessToken function
const getTwitchAccessToken = async () => {
  try {
    // Check if we have a cached token
    let accessToken = localStorage.getItem('twitch_access_token');
    
    // If we have a token, verify it's still valid
    if (accessToken) {
      try {
        const response = await fetch('https://id.twitch.tv/oauth2/validate', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (!response.ok) {
          // Token is invalid, remove it
          localStorage.removeItem('twitch_access_token');
          accessToken = null;
        }
      } catch (error) {
        console.error('Error validating token:', error);
        localStorage.removeItem('twitch_access_token');
        accessToken = null;
      }
    }

    // If no valid token, get a new one
    if (!accessToken) {
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          grant_type: 'client_credentials',
          // No client secret for public client
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get access token');
      }

      const data = await response.json();
      accessToken = data.access_token;
      localStorage.setItem('twitch_access_token', accessToken);
    }

    return accessToken;
  } catch (error) {
    console.error("Error in getTwitchAccessToken:", error);
    return null;
  }
};

export const fetchStreamers = async () => {
  try {
    // First, fetch streamers from Supabase
    const { data: dbStreamers, error } = await supabase
      .from('streamers')
      .select('name, bio')
      .order('name');

    if (error) {
      console.error('Error fetching streamers from Supabase:', error);
      return [];
    }

    if (!dbStreamers || dbStreamers.length === 0) {
      console.log('No streamers found in database');
      return [];
    }

    const accessToken = await getTwitchAccessToken();
    if (!accessToken) {
      console.error('Failed to get Twitch access token');
      return [];
    }

    const usernames = dbStreamers.map(streamer => streamer.name);
    console.log('Fetching data for streamers:', usernames);

    // Fetch user information (includes profile images)
    const userResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(login => `login=${login}`).join('&')}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error(`HTTP error! status: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    const users = userData.data;
    console.log('Received user data:', users);

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
    const gameIds = liveStreams.map((stream) => stream.game_id);

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

    const games = gamesResponse.data.data;

    // Combine all the data
    return users.map((user) => {
      const stream = liveStreams.find((s) => s.user_id === user.id);
      const game = games.find((g) => g.id === stream?.game_id);
      const streamerInfo = dbStreamers.find((s) => s.name.toLowerCase() === user.login.toLowerCase());

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
    console.error("Error in fetchStreamers:", error);
    return [];
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