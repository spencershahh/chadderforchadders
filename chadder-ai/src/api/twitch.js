import axios from "axios";
import { supabase } from "../supabaseClient";

// API URL for your backend
const API_URL = import.meta.env.VITE_API_URL || '';

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
        console.log(`Fetching enriched data for streamers from backend: ${streamerLogins}`);
        
        const response = await fetch(`${API_URL}/api/twitch/streamers?logins=${streamerLogins}`);
        
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
      console.warn('No API_URL configured, skipping enriched data fetch');
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