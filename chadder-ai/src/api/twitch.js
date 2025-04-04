import axios from "axios";
import { supabase } from "../supabaseClient";

// API URL for your backend
const API_URL = import.meta.env.VITE_API_URL || '';
console.log('API_URL configured as:', API_URL);

// We no longer use environment flags to control fetching behavior
// All requests will go through the real API directly

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
        streamers = dbStreamers;
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
        const streamerLogins = streamers.map(s => s.username || s.name).join(',');
        const apiUrl = `${API_URL}/api/twitch/streamers?logins=${streamerLogins}`;
        console.log(`Attempting to fetch enriched data from: ${apiUrl}`);
        
        // Simplified fetch with consistent CORS settings
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            mode: 'cors',
            credentials: 'include', // Changed from 'same-origin' to 'include' for cross-origin requests
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
              return { error: true, message: 'No streamers available at this time. Please try again later.' };
            }
          } else {
            console.warn('Backend returned error status:', response.status);
            try {
              const errorData = await response.json();
              console.warn('Error details:', errorData);
            } catch (e) {
              console.warn('Could not parse error response');
            }
            return { error: true, message: `Could not retrieve streamer data. Server returned status ${response.status}.` };
          }
        } catch (fetchError) {
          console.error('Fetch attempt failed, trying axios as fallback:', fetchError);
          
          try {
            // Try with axios as backup with no credentials to avoid CORS issues
            const axiosResponse = await axios.get(apiUrl, { 
              withCredentials: false
            });
            
            if (axiosResponse.status >= 200 && axiosResponse.status < 300 && axiosResponse.data) {
              console.log('Successfully fetched data via axios:', axiosResponse.data.length, 'streamers');
              return axiosResponse.data;
            } else {
              console.warn('Axios request failed:', axiosResponse.status);
              return { error: true, message: 'Failed to retrieve streamer data via backup method.' };
            }
          } catch (axiosError) {
            console.error('All fetch attempts failed:', axiosError);
            throw axiosError;
          }
        }
      } catch (enrichError) {
        console.error('Error fetching enriched data:', enrichError.message);
        console.error('Error details:', enrichError);
        return { error: true, message: 'Failed to connect to the Twitch API. Please check your connection and try again.' };
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
    // Get user data from backend API
    if (API_URL) {
      try {
        console.log(`Fetching user data for ${login} from backend`);
        const userResponse = await fetch(`${API_URL}/api/twitch/user/${login}`);
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log(`Successfully fetched user data for ${login}`, {
            has_profile_image: userData.profile_image_url ? 'yes' : 'no',
            has_description: userData.description ? 'yes' : 'no'
          });
          return userData;
        } else {
          console.warn(`Backend returned error status for user ${login}:`, userResponse.status);
          try {
            const errorData = await userResponse.json();
            console.warn('Error details:', errorData);
          } catch (e) {
            console.warn('Could not parse error response');
          }
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