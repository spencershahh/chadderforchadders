// Cache for streamer data
let streamersCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 60000 // 1 minute cache
};

export const fetchStreamers = async () => {
  // Check cache first
  if (streamersCache.data && streamersCache.timestamp && (Date.now() - streamersCache.timestamp < streamersCache.CACHE_DURATION)) {
    return streamersCache.data;
  }

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

    // Make all API calls in parallel
    const [userResponse, streamsResponse] = await Promise.all([
      axios.get("https://api.twitch.tv/helix/users", {
        headers: {
          "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          login: usernames,
        },
      }),
      axios.get("https://api.twitch.tv/helix/streams", {
        headers: {
          "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          user_login: usernames, // Using user_login instead of user_id for efficiency
        },
      })
    ]);

    const users = userResponse.data.data;
    const liveStreams = streamsResponse.data.data;

    // Get unique game IDs from live streams
    const gameIds = [...new Set(liveStreams.map(stream => stream.game_id).filter(Boolean))];

    // Only fetch games if there are live streams with games
    let games = [];
    if (gameIds.length > 0) {
      const gamesResponse = await axios.get("https://api.twitch.tv/helix/games", {
        headers: {
          "Client-ID": import.meta.env.VITE_TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          id: gameIds,
        },
      });
      games = gamesResponse.data.data;
    }

    // Combine all the data
    const result = users.map((user) => {
      const stream = liveStreams.find((s) => s.user_login.toLowerCase() === user.login.toLowerCase());
      const game = stream ? games.find((g) => g.id === stream.game_id) : null;
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

    // Update cache
    streamersCache.data = result;
    streamersCache.timestamp = Date.now();

    return result;
  } catch (error) {
    console.error("Error fetching Twitch data:", error);
    return [];
  }
}; 