import axios from "axios";
import { supabase } from "../supabaseClient";

const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';

// Helper function to get access token using PKCE
const getTwitchAccessToken = async () => {
  try {
    // Check if we have a cached token
    let accessToken = localStorage.getItem('twitch_access_token');
    if (accessToken) {
      return accessToken;
    }

    // If no token, initiate PKCE flow
    const response = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        grant_type: "client_credentials",
        // No client secret needed for public client
      },
    });

    accessToken = response.data.access_token;
    localStorage.setItem('twitch_access_token', accessToken);
    return accessToken;
  } catch (error) {
    console.error("Error fetching Twitch Access Token:", error);
    return null;
  }
};

export const fetchStreamers = async () => {
  const accessToken = await getTwitchAccessToken();
  if (!accessToken) return [];

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

    const usernames = dbStreamers.map((streamer) => streamer.name);

    // Fetch user information (includes profile images)
    const userResponse = await axios.get("https://api.twitch.tv/helix/users", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
      },
      params: {
        login: usernames,
      },
    });

    const users = userResponse.data.data;
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
    console.error("Error fetching Twitch data:", error);
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