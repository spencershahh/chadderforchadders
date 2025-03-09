import axios from "axios";
import { supabase } from "../supabaseClient";

// Updated with the correct Client ID from your Twitch Developer Console
const TWITCH_CLIENT_ID = 'ngu1x9g67l2icpdxw6sa2uumvot5hz';

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

// API URL for your backend (if available)
const API_URL = import.meta.env.VITE_API_URL;

// Get an app access token for public client
const getTwitchAccessToken = async () => {
  try {
    // Check if we have a cached token
    let accessToken = localStorage.getItem('twitch_access_token');
    let tokenExpiry = localStorage.getItem('twitch_token_expiry');
    
    // If token exists and is not expired, return it
    if (accessToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      return accessToken;
    }

    // Try to get a token from our backend proxy
    if (API_URL) {
      try {
        const response = await fetch(`${API_URL}/api/twitch/token`);
        if (response.ok) {
          const data = await response.json();
          accessToken = data.access_token;
          
          // Store token and its expiry
          localStorage.setItem('twitch_access_token', accessToken);
          localStorage.setItem('twitch_token_expiry', Date.now() + (data.expires_in * 1000));
          
          return accessToken;
        }
      } catch (error) {
        console.warn('Could not get token from backend:', error);
      }
    }
    
    // If we couldn't get a token from the backend, we'll proceed without one
    return null;
  } catch (error) {
    console.error("Error getting Twitch access token:", error);
    return null;
  }
};

// Get headers for Twitch API requests
const getTwitchHeaders = async () => {
  const headers = {
    'Client-ID': TWITCH_CLIENT_ID
  };
  
  const accessToken = await getTwitchAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return headers;
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
      streamers = FALLBACK_STREAMERS;
    }
    
    // Process with fallback data first to ensure we always have something to display
    const processedStreamers = getFallbackStreamerData(streamers);
    
    // Try to get enriched data from Twitch if possible
    try {
      if (API_URL) {
        // Try to fetch enriched data from our backend proxy
        const streamerLogins = streamers.map(s => s.username || s.name).join(',');
        console.log(`Fetching enriched data for streamers: ${streamerLogins}`);
        
        const response = await fetch(`${API_URL}/api/twitch/streamers?logins=${streamerLogins}`);
        
        if (response.ok) {
          const enrichedData = await response.json();
          
          if (enrichedData && enrichedData.length > 0) {
            console.log('Successfully fetched enriched data from backend:', enrichedData.length);
            // Return the enriched data instead
            return enrichedData;
          } else {
            console.warn('Backend returned empty enriched data');
          }
        } else {
          console.warn('Backend returned error status:', response.status);
        }
      } else {
        console.warn('No API_URL configured, skipping enriched data fetch');
      }
    } catch (enrichError) {
      console.error('Could not fetch enriched data:', enrichError);
    }
    
    // Return the fallback data if we couldn't get enriched data
    return processedStreamers;
  } catch (error) {
    console.error("Error in fetchStreamers:", error);
    return getFallbackStreamerData(FALLBACK_STREAMERS);
  }
};

// Helper function to get fallback streamer data
const getFallbackStreamerData = (streamers) => {
  return streamers.map(streamer => ({
    id: null,
    user_id: null,
    user_login: (streamer.username || streamer.name || '').toLowerCase(),
    user_name: streamer.username || streamer.name || 'Unknown',
    profile_image_url: streamer.profile_image_url || null,
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
    // Try to get user data from backend proxy if available
    if (API_URL) {
      try {
        console.log(`Fetching user data for ${login} from backend`);
        const response = await fetch(`${API_URL}/api/twitch/user/${login}`);
        
        if (response.ok) {
          const userData = await response.json();
          console.log(`Successfully fetched user data for ${login}`);
          return userData;
        } else {
          console.warn(`Backend returned error status for user ${login}:`, response.status);
        }
      } catch (error) {
        console.warn(`Could not fetch user data for ${login} from backend:`, error);
      }
    } else {
      console.warn('No API_URL configured, skipping user data fetch');
    }
    
    // Return basic fallback data if backend fetch failed
    return {
      login: login,
      display_name: login,
      profile_image_url: null,
      description: "No bio available."
    };
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
};