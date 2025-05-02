import axios from "axios";
import { supabase } from "../supabaseClient";

// API URL for your backend
const API_URL = import.meta.env.VITE_API_URL || '';
console.log('API_URL configured as:', API_URL);

// Maximum number of retries for API calls
const MAX_RETRIES = 3;

// Helper function to validate streamer data
const isValidStreamerData = (streamer) => {
  return streamer && 
    (streamer.user_login || streamer.username || streamer.name) && 
    typeof streamer === 'object';
};

// Helper function to normalize streamer data
const normalizeStreamerData = (streamer) => {
  if (!streamer) return null;
  
  // Ensure required properties exist
  return {
    ...streamer,
    user_name: streamer.user_name || streamer.display_name || streamer.username || streamer.name || 'Unknown',
    user_login: streamer.user_login || streamer.username || streamer.login || streamer.name || 'unknown',
    type: streamer.type || 'offline',
    title: streamer.title || 'No title',
    thumbnail_url: streamer.thumbnail_url || null,
    profile_image_url: streamer.profile_image_url || null,
    viewer_count: streamer.viewer_count || 0
  };
};

// Helper function for exponential backoff retries
const fetchWithRetry = async (url, options = {}, retries = MAX_RETRIES) => {
  try {
    const response = await fetch(url, options);
    if (response.ok) {
      return await response.json();
    }
    
    // If we get a 429 (too many requests), we should retry with backoff
    if (response.status === 429 && retries > 0) {
      const waitTime = Math.pow(2, MAX_RETRIES - retries) * 1000;
      console.log(`Rate limited. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw new Error(`Request failed with status ${response.status}`);
  } catch (error) {
    if (retries <= 0) throw error;
    
    const waitTime = Math.pow(2, MAX_RETRIES - retries) * 1000;
    console.log(`Request failed. Retrying in ${waitTime}ms...`, error);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return fetchWithRetry(url, options, retries - 1);
  }
};

export const fetchStreamers = async () => {
  try {
    console.log("Starting fetchStreamers process...");
    console.log("Browser info:", navigator.userAgent);
    let streamers = [];
    
    // Check if we're on desktop or mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log("Device type:", isMobile ? "Mobile" : "Desktop");
    
    // First, fetch streamers from Supabase
    try {
      const { data: dbStreamers, error } = await supabase
        .from('streamers')
        .select('*')
        .order('username');
  
      if (error) {
        console.error('Error fetching streamers from Supabase:', error);
        return { error: true, message: 'Failed to load streamers from database.' };
      } else if (dbStreamers && dbStreamers.length > 0) {
        console.log('Found streamers in database:', dbStreamers.length);
        streamers = dbStreamers.map(normalizeStreamerData).filter(Boolean);
      } else {
        console.warn('No streamers found in database');
        return { error: true, message: 'No streamers found in the database.' };
      }
    } catch (dbError) {
      console.error('Error querying Supabase:', dbError);
      return { error: true, message: 'Failed to connect to the database.' };
    }
    
    // Try to get enriched data from backend
    if (API_URL) {
      try {
        // Fetch enriched data from our backend API
        const streamerLogins = streamers.map(s => s.username || s.name).filter(Boolean).join(',');
        if (!streamerLogins) {
          console.warn('No valid streamer logins to fetch enriched data');
          return { error: true, message: 'Invalid streamer data' };
        }
        
        const apiUrl = `${API_URL}/api/twitch/streamers?logins=${streamerLogins}`;
        console.log(`Attempting to fetch enriched data from: ${apiUrl}`);
        
        // Use our retry fetch with improved error handling
        try {
          const enrichedData = await fetchWithRetry(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            mode: 'cors',
            credentials: 'include',
          });
          
          if (enrichedData && Array.isArray(enrichedData) && enrichedData.length > 0) {
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
            
            // Normalize and validate all the streamer data
            const validStreamers = enrichedData
              .map(normalizeStreamerData)
              .filter(isValidStreamerData);
            
            if (validStreamers.length === 0) {
              console.warn('No valid streamers in the enriched data');
              return { error: true, message: 'Received invalid streamer data from API.' };
            }
            
            // Return the normalized and validated enriched data
            return validStreamers;
          } else {
            console.warn('Backend returned empty or invalid enriched data', enrichedData);
            // Instead of returning an error, fall back to the basic data
            return streamers;
          }
        } catch (fetchError) {
          console.error('Fetch attempts failed:', fetchError);
          // Instead of throwing, return the basic streamer data
          return streamers;
        }
      } catch (enrichError) {
        console.error('Error fetching enriched data:', enrichError.message);
        console.error('Error details:', enrichError);
        // Return the basic streamer data we got from Supabase
        return streamers;
      }
    } else {
      console.log('API_URL is not configured');
      return { error: true, message: 'API configuration error. Please contact support.' };
    }
  } catch (error) {
    console.error("Critical error in fetchStreamers:", error);
    return { 
      error: true, 
      message: 'An unexpected error occurred while loading streamers.',
      errorDetails: error.message
    };
  }
};

// Function to fetch user data
export const fetchUserData = async (login) => {
  try {
    if (!login) {
      console.error('Invalid login provided to fetchUserData');
      return { error: true, message: 'Invalid username' };
    }
    
    // Get user data from backend API
    if (API_URL) {
      try {
        console.log(`Fetching user data for ${login} from backend`);
        const userData = await fetchWithRetry(`${API_URL}/api/twitch/user/${login}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          credentials: 'include',
        });
        
        if (userData && !userData.error) {
          console.log(`Successfully fetched user data for ${login}`, {
            has_profile_image: userData.profile_image_url ? 'yes' : 'no',
            has_description: userData.description ? 'yes' : 'no'
          });
          return normalizeStreamerData(userData);
        } else {
          console.warn(`Backend returned error for user ${login}:`, userData);
          return { 
            error: true, 
            message: `Could not retrieve user data for ${login}. Please try again later.` 
          };
        }
      } catch (error) {
        console.error(`Error fetching user data for ${login}:`, error.message);
        return { 
          error: true, 
          message: 'Failed to connect to the Twitch API. Please check your connection and try again.' 
        };
      }
    } else {
      console.warn('No API_URL configured, cannot fetch user data');
      return { 
        error: true, 
        message: 'API configuration error. Please contact support.' 
      };
    }
  } catch (error) {
    console.error(`Error in fetchUserData for ${login}:`, error);
    return { 
      error: true, 
      message: 'An unexpected error occurred while loading user data.' 
    };
  }
};

// Error state helper - export this to replace the fallback data function
export const createErrorState = (message) => {
  return {
    error: true,
    message: message || 'Unable to load data from Twitch API',
    timestamp: new Date().toISOString()
  };
};