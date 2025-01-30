import axios from "axios";
import streamers from "../data/streamers.json";

export const getTwitchAccessToken = async () => {
  try {
    const response = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id: import.meta.env.VITE_TWITCH_CLIENT_ID,
        client_secret: import.meta.env.VITE_TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials",
      },
    });
    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching Twitch Access Token:", error);
    return null;
  }
};

export const fetchStreamers = async () => {
  const accessToken = await getTwitchAccessToken();
  if (!accessToken) return [];

  try {
    const usernames = streamers.map((streamer) => streamer.username);

    // Fetch user information (includes profile images)
    const userResponse = await axios.get("https://api.twitch.tv/helix/users", {
      headers: {
        "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
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
        "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
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
        "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
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
      const streamerInfo = streamers.find((s) => s.username.toLowerCase() === user.login.toLowerCase());

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