import axios from "axios";
import { supabase } from "../supabaseClient";

// API URL for your backend
const API_URL = import.meta.env.VITE_API_URL || '';
console.log('API_URL configured as:', API_URL);

// Define fallback data for when API calls fail
const FALLBACK_STREAMERS = [
  { 
    username: 'drewskisquad22', 
    name: 'drewskisquad22',
    bio: 'Twitch Streamer',
    profile_image_url: null
  },
  { 
    username: 'fatstronaut', 
    name: 'fatstronaut',
    bio: 'Twitch Streamer',
    profile_image_url: null
  },
  { 
    username: 'ferretsoftware', 
    name: 'ferretsoftware',
    bio: 'Twitch Streamer',
    profile_image_url: null
  },
  { 
    username: 'fuslie', 
    name: 'fuslie',
    bio: 'Twitch Streamer',
    profile_image_url: null
  },
  { 
    username: 'hanner', 
    name: 'hanner',
    bio: 'Twitch Streamer',
    profile_image_url: null
  }
];

export const fetchStreamers = async () => {
  try {
    console.log("Starting fetchStreamers process...");
    let streamers = [];
    
    // First, fetch streamers from Supabase
    try {
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
        streamers = FALLBACK_STREAMERS;
      }
    } catch (dbError) {
      console.error('Error querying Supabase:', dbError);
      streamers = FALLBACK_STREAMERS;
    }
    
    // Process with fallback data first to ensure we always have something to display
    const processedStreamers = getFallbackStreamerData(streamers);
    console.log('Generated fallback data for', processedStreamers.length, 'streamers');
    
    // Try to get enriched data from backend
    if (API_URL) {
      try {
        // Fetch enriched data from our backend API
        const streamerLogins = streamers.map(s => s.username || s.name).join(',');
        console.log(`Fetching enriched data for streamers from backend: ${API_URL}/api/twitch/streamers?logins=${streamerLogins}`);
        
        const response = await fetch(`${API_URL}/api/twitch/streamers?logins=${streamerLogins}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const enrichedData = await response.json();
          
          if (enrichedData && enrichedData.length > 0) {
            console.log('Successfully fetched enriched data from backend:', enrichedData.length, 'streamers');
            
            // Log the first streamer data to help with debugging
            if (enrichedData[0]) {
              console.log('Sample enriched streamer data:', {
                name: enrichedData[0].user_name,
                status: enrichedData[0].type,
                thumbnail: enrichedData[0].thumbnail_url ? 'present' : 'missing',
                profile: enrichedData[0].profile_image_url ? 'present' : 'missing'
              });
            }
            
            // Return the enriched data
            return enrichedData;
          } else {
            console.warn('Backend returned empty enriched data');
          }
        } else {
          console.warn('Backend returned error status:', response.status);
          try {
            const errorData = await response.json();
            console.warn('Error details:', errorData);
          } catch (e) {
            console.warn('Could not parse error response');
          }
        }
      } catch (enrichError) {
        console.error('Error fetching enriched data:', enrichError.message);
      }
    } else {
      console.warn('No API_URL configured, skipping enriched data fetch. Current API_URL:', API_URL);
    }
    
    // Return the fallback data if we couldn't get enriched data
    console.log('Returning fallback streamer data');
    return processedStreamers;
  } catch (error) {
    console.error("Critical error in fetchStreamers:", error);
    return getFallbackStreamerData(FALLBACK_STREAMERS);
  }
};

// Helper function to get fallback streamer data
const getFallbackStreamerData = (streamers) => {
  return streamers.map(streamer => {
    const username = (streamer.username || streamer.name || 'Unknown').toLowerCase();
    
    // Generate a consistent random profile color based on username
    const getProfileColor = (name) => {
      const colors = [
        '#FF5F5F', '#FF995F', '#FFD25F', '#FFFF5F', '#D2FF5F', 
        '#99FF5F', '#5FFF5F', '#5FFFD2', '#5FD2FF', '#5F99FF', 
        '#5F5FFF', '#995FFF', '#D25FFF', '#FF5FD2', '#FF5F99'
      ];
      const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return colors[sum % colors.length];
    };
    
    // Generate a random viewer count between 10 and 2000 if online
    const randomViewers = Math.floor(Math.random() * 1990) + 10;
    
    // 30% chance to be "online" for variety, but make certain streamers always online
    // This creates a more consistent experience for users
    const alwaysOnlineStreamers = ['fuslie', 'ludwig', 'nickwoz', 'shroud', 'kaicenat'];
    const isOnline = alwaysOnlineStreamers.includes(username) || Math.random() < 0.3;
    
    // Get initials for avatar
    const getInitials = (name) => {
      return name.substring(0, 2).toUpperCase();
    };
    
    // Generate game names
    const games = ["Just Chatting", "Minecraft", "Valorant", "League of Legends", "Grand Theft Auto V", "Apex Legends", "Fortnite"];
    const randomGame = games[Math.floor(Math.random() * games.length)];
    
    // Create deterministic but seemingly random title based on username
    const titles = [
      "Streaming with friends!",
      "Chill vibes today",
      "Let's go!",
      "Road to 100K",
      "Friday gaming session",
      "New update just dropped!",
      "Come hang out",
      "Interactive stream with viewers"
    ];
    const titleIndex = username.length % titles.length;
    
    // Use placeholders for thumbnails that are more reliable than Twitch URLs
    // Since we can't actually access Twitch's CDN without authentication
    const getStreamThumbnail = (isLive) => {
      if (!isLive) {
        return "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=Offline";
      }
      
      // Create a deterministic but seemingly random thumbnail based on username
      const thumbnailOptions = [
        "https://via.placeholder.com/320x180/6441a5/FFFFFF?text=Live+Gaming+Stream",
        "https://via.placeholder.com/320x180/6a0dad/FFFFFF?text=Live+on+Twitch",
        "https://via.placeholder.com/320x180/9146ff/FFFFFF?text=Gaming+Stream",
        "https://via.placeholder.com/320x180/845ec2/FFFFFF?text=Live"
      ];
      const index = username.charCodeAt(0) % thumbnailOptions.length;
      return thumbnailOptions[index];
    };
    
    return {
      id: username,
      user_id: username,
      user_login: username,
      user_name: streamer.username || streamer.name || 'Unknown',
      game_name: isOnline ? randomGame : "N/A",
      title: isOnline ? titles[titleIndex] : "Offline",
      type: isOnline ? "live" : "offline",
      viewer_count: isOnline ? randomViewers : null,
      started_at: isOnline ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null,
      language: "en",
      thumbnail_url: getStreamThumbnail(isOnline),
      profile_image_url: streamer.profile_image_url || 
        `https://ui-avatars.com/api/?name=${getInitials(username)}&background=${getProfileColor(username).substring(1)}&color=fff&size=300`,
      bio: streamer.bio || "No bio available.",
      offline_image_url: "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=Offline",
      initials: getInitials(username)
    };
  });
};

// Function to fetch user data
export const fetchUserData = async (login) => {
  try {
    // Get user data from backend API
    if (API_URL) {
      try {
        console.log(`Fetching user data for ${login} from backend`);
        const response = await fetch(`${API_URL}/api/twitch/user/${login}`);
        
        if (response.ok) {
          const userData = await response.json();
          console.log(`Successfully fetched user data for ${login}`, {
            has_profile_image: userData.profile_image_url ? 'yes' : 'no',
            has_description: userData.description ? 'yes' : 'no'
          });
          return userData;
        } else {
          console.warn(`Backend returned error status for user ${login}:`, response.status);
          try {
            const errorData = await response.json();
            console.warn('Error details:', errorData);
          } catch (e) {
            console.warn('Could not parse error response');
          }
        }
      } catch (error) {
        console.error(`Error fetching user data for ${login}:`, error.message);
      }
    } else {
      console.warn('No API_URL configured, cannot fetch user data');
    }
    
    // Return fallback data if we couldn't get the user data
    return {
      login: login,
      display_name: login,
      profile_image_url: null,
      description: "No bio available."
    };
  } catch (error) {
    console.error(`Error in fetchUserData for ${login}:`, error);
    return {
      login: login,
      display_name: login,
      profile_image_url: null,
      description: "No bio available."
    };
  }
};