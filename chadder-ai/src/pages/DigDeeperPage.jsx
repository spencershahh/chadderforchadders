import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

const isDevelopment = typeof import.meta !== 'undefined' && 
  import.meta.env && 
  (import.meta.env.DEV || window.location.hostname === 'localhost');

const DigDeeperPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const controls = useAnimation();
  const [expandedBios, setExpandedBios] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [twitchAccessToken, setTwitchAccessToken] = useState(null);
  
  // Preference selector state
  const [showPreferenceSelector, setShowPreferenceSelector] = useState(false);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [hasSetPreferences, setHasSetPreferences] = useState(false);
  
  // Category definitions with icons
  const streamCategories = [
    { id: '509658', name: 'Just Chatting', icon: '💬' },
    { id: '26936', name: 'Music', icon: '🎵' },
    { id: '33214', name: 'Fortnite', icon: '🔫' },
    { id: '27471', name: 'Minecraft', icon: '⛏️' },
    { id: '32982', name: 'Grand Theft Auto V', icon: '🚗' },
    { id: '21779', name: 'League of Legends', icon: '🧙' },
    { id: '516575', name: 'VALORANT', icon: '🎯' },
    { id: '509659', name: 'Art', icon: '🎨' },
    { id: '518203', name: 'Sports', icon: '⚽' },
    { id: '417752', name: 'Talk Shows', icon: '🎙️' },
    { id: '518248', name: 'Indie Games', icon: '🎮' }
  ];
  
  // Check if this is the first visit
  useEffect(() => {
    if (user) {
      // Check localStorage for previously saved preferences
      const savedPreferences = localStorage.getItem(`digdeeper_preferences_${user.id}`);
      if (savedPreferences) {
        try {
          const parsedPreferences = JSON.parse(savedPreferences);
          setSelectedPreferences(parsedPreferences);
          setHasSetPreferences(true);
        } catch (e) {
          console.error('Error parsing saved preferences', e);
          setShowPreferenceSelector(true);
        }
      } else {
        // First time, show selector
        setShowPreferenceSelector(true);
      }
    }
  }, [user]);

  // Only fetch streamers when user is authenticated
  useEffect(() => {
    if (user) {
      const loadTwitchAuth = async () => {
        try {
          const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
          const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
          
          if (!clientId || !clientSecret) {
            console.error('Twitch API credentials missing');
            toast.error('Twitch API credentials are missing in environment variables');
            return null;
          }
          
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
          });
          
          if (!tokenResponse.ok) {
            throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
          }
          
          const tokenData = await tokenResponse.json();
          const accessToken = tokenData.access_token;
          
          if (!accessToken) {
            throw new Error('No access token received from Twitch');
          }
          
          setTwitchAccessToken(accessToken);
          
          // Once we have the token, fetch low-viewer streamers directly from Twitch
          await fetchLowViewerStreams(accessToken);
        } catch (error) {
          console.error('Error initializing Twitch auth:', error);
          toast.error(`Error connecting to Twitch: ${error.message}`);
        }
      };
      
      loadTwitchAuth();
    } else {
      // Reset state if user logs out
      setStreamers([]);
      setLoading(false);
    }
  }, [user]);

  const fetchLowViewerStreams = async (accessToken) => {
    try {
      setLoading(true);
      toast.loading('Looking for small streamers...', { id: 'loading' });
      
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      if (!clientId || !accessToken) {
        throw new Error('Twitch API credentials or token missing');
      }
      
      // Log to confirm we have valid credentials
      console.log("Using Twitch API with:", { 
        clientIdFirstFiveChars: clientId.substring(0, 5),
        hasToken: !!accessToken 
      });
      
      // Determine which categories to use based on preferences
      let categoriesToSearch = [];
      
      if (selectedPreferences.length > 0) {
        // User has preferences, prioritize those
        categoriesToSearch = selectedPreferences;
        console.log(`Using user's ${selectedPreferences.length} preferred categories`);
      } else {
        // No preferences - use a randomized selection of categories to provide variety
        const shuffledCategories = [...streamCategories].sort(() => Math.random() - 0.5);
        // Use all categories but in a random order to provide maximum diversity
        categoriesToSearch = shuffledCategories.map(cat => cat.id);
        console.log('No preferences set - using randomized categories for diversity');
      }
      
      let allStreamers = [];
      let apiCallsMade = 0;
      
      // Track how many streamers we've found per category to ensure diversity
      const streamersPerCategory = {};
      const MAX_PER_CATEGORY = 3; // Limit to 3 per category for better variety
      
      // Try different game categories to find small streamers
      for (const gameId of categoriesToSearch) {
        if (allStreamers.length >= 20) break; // Stop if we have enough
        
        // Skip if we already have enough from this category
        if (streamersPerCategory[gameId] >= MAX_PER_CATEGORY) continue;
        
        try {
          apiCallsMade++;
          // Get streams for this game, sorted by viewers (low to high)
          const queryParams = new URLSearchParams({
            first: 100,
            game_id: gameId,
            language: 'en'
          });
          
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!streamsResponse.ok) {
            console.error(`Error fetching streams for game ${gameId}: ${streamsResponse.status}`);
            continue; // Try next game
          }
          
          const streamsData = await streamsResponse.json();
          console.log(`Got ${streamsData?.data?.length || 0} streams for game ${gameId}`);
          
          // Filter for small streams (5-50 viewers)
          if (streamsData?.data && Array.isArray(streamsData.data)) {
            // Sort by viewer count (lowest first)
            const sortedStreams = [...streamsData.data].sort((a, b) => {
              return (a.viewer_count || 999) - (b.viewer_count || 999);
            });
            
            // Take streams with between 5-50 viewers
            const smallStreams = sortedStreams.filter(stream => 
              stream && 
              typeof stream.viewer_count === 'number' && 
              stream.viewer_count >= 5 && 
              stream.viewer_count <= 50
            );
            
            console.log(`Found ${smallStreams.length} streams with 5-50 viewers for game ${gameId}`);
            
            // Track how many we're taking from this category
            streamersPerCategory[gameId] = (streamersPerCategory[gameId] || 0) + 
              Math.min(smallStreams.length, MAX_PER_CATEGORY);
            
            // Map to our format, but limit how many we take from each category
            const formattedStreams = smallStreams
              .slice(0, MAX_PER_CATEGORY)
              .map(stream => ({
                id: stream.user_id,
                twitch_id: stream.user_id,
                username: stream.user_login,
                display_name: stream.user_name,
                is_live: true,
                view_count: stream.viewer_count,
                game_name: stream.game_name || "",
                stream_title: stream.title || "",
                thumbnail_url: stream.thumbnail_url ? 
                  stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                  null,
                votes: 0,
                category_id: gameId,
                isWildcard: false
              }));
            
            // Add new streamers to our list
            allStreamers = [...allStreamers, ...formattedStreams];
          }
        } catch (gameError) {
          console.error(`Error processing game ${gameId}:`, gameError);
          // Continue with next game
        }
      }
      
      console.log(`Made ${apiCallsMade} API calls, found ${allStreamers.length} total small streamers`);
      
      // If we're using preferences but still don't have enough streamers, try some random categories
      if (selectedPreferences.length > 0 && allStreamers.length < 10) {
        console.log("Not enough streamers from preferred categories, adding some variety");
        
        // Get categories that aren't in user preferences
        const otherCategories = streamCategories
          .filter(cat => !selectedPreferences.includes(cat.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map(cat => cat.id);
          
        // Flag these as wildcard streamers
        let wildcardStreamers = [];
        
        for (const gameId of otherCategories) {
          if (allStreamers.length >= 20) break;
          
          try {
            apiCallsMade++;
            // Get streams for this game
            const queryParams = new URLSearchParams({
              first: 100,
              game_id: gameId,
              language: 'en'
            });
            
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (streamsResponse.ok) {
              const streamsData = await streamsResponse.json();
              
              if (streamsData?.data && Array.isArray(streamsData.data)) {
                // Sort by viewer count
                const sortedStreams = [...streamsData.data].sort((a, b) => {
                  return (a.viewer_count || 999) - (b.viewer_count || 999);
                });
                
                // Take the smallest viewer streams
                const smallStreams = sortedStreams
                  .filter(stream => stream && typeof stream.viewer_count === 'number' && stream.viewer_count <= 20)
                  .slice(0, 3); // Just take a few for diversity
                  
                // Map to our format with wildcard indicator
                const formattedStreams = smallStreams.map(stream => ({
                  id: stream.user_id,
                  twitch_id: stream.user_id,
                  username: stream.user_login,
                  display_name: stream.user_name,
                  is_live: true,
                  view_count: stream.viewer_count,
                  game_name: stream.game_name || "",
                  stream_title: stream.title || "",
                  thumbnail_url: stream.thumbnail_url ? 
                    stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                    null,
                  votes: 0,
                  category_id: gameId,
                  isWildcard: true
                }));
                
                // Add to our wildcards list
                wildcardStreamers.push(...formattedStreams);
              }
            }
          } catch (error) {
            console.error(`Error processing additional category ${gameId}:`, error);
          }
        }
        
        // Add these wildcards to our main list
        allStreamers.push(...wildcardStreamers);
        console.log(`Added ${wildcardStreamers.length} wildcard streamers from outside preferred categories`);
      }
      
      // Final fallback - if we still have no streamers, try with higher viewer count
      if (allStreamers.length === 0) {
        try {
          console.log("Last resort: Trying with higher viewer threshold");
          
          const queryParams = new URLSearchParams({
            first: 100,
            language: 'en'
          });
          
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (streamsResponse.ok) {
            const streamsData = await streamsResponse.json();
            
            if (streamsData?.data && Array.isArray(streamsData.data)) {
              // Sort by viewer count (lowest first)
              const sortedStreams = [...streamsData.data].sort((a, b) => {
                return (a.viewer_count || 999) - (b.viewer_count || 999);
              });
              
              // Take streams with between 5-50 viewers
              const smallestStreams = sortedStreams.filter(stream =>
                stream && 
                typeof stream.viewer_count === 'number' && 
                stream.viewer_count >= 5 && 
                stream.viewer_count <= 50
              ).slice(0, 20);
              
              // Map to our format
              const formattedStreams = smallestStreams.map(stream => ({
                id: stream.user_id,
                twitch_id: stream.user_id,
                username: stream.user_login,
                display_name: stream.user_name,
                is_live: true,
                view_count: stream.viewer_count,
                game_name: stream.game_name || "",
                stream_title: stream.title || "",
                thumbnail_url: stream.thumbnail_url ? 
                  stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                  null,
                votes: 0,
                category_id: stream.game_id || 'unknown',
                isWildcard: true // These are all wildcards as they're from the fallback
              }));
              
              console.log(`Found ${formattedStreams.length} smallest streams from final fallback`);
              
              // Add new streamers to our list
              allStreamers = [...allStreamers, ...formattedStreams];
            }
          }
        } catch (fallbackError) {
          console.error("Error with fallback approach:", fallbackError);
        }
      }
      
      // Make sure all streamers have required fields to prevent errors
      allStreamers = allStreamers.filter(streamer => 
        streamer && streamer.twitch_id && streamer.username
      );
      
      // Sort by viewer count (lowest first)
      allStreamers.sort((a, b) => (a.view_count || 0) - (b.view_count || 0));
      
      // Get only unique streamers
      const uniqueStreamers = [];
      const seenIds = new Set();
      
      for (const streamer of allStreamers) {
        if (!seenIds.has(streamer.twitch_id)) {
          seenIds.add(streamer.twitch_id);
          uniqueStreamers.push(streamer);
        }
      }
      
      // Limit to a reasonable number
      allStreamers = uniqueStreamers.slice(0, 20);
      
      // If we have streamers, get their profile data
      if (allStreamers.length > 0) {
        try {
          // Extract unique user IDs for profile lookup
          const userIds = [];
          for (let i = 0; i < allStreamers.length; i++) {
            if (allStreamers[i].twitch_id) {
              userIds.push(allStreamers[i].twitch_id);
            }
          }
          
          if (userIds.length > 0) {
            const userQueryParams = [];
            for (let j = 0; j < userIds.length; j++) {
              userQueryParams.push(`id=${userIds[j]}`);
            }
            
            const userQueryString = userQueryParams.join('&');
            
            const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${userQueryString}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (usersResponse.ok) {
              const userData = await usersResponse.json();
              
              // Create a lookup map for easier access
              const userDataMap = {};
              if (userData && userData.data && Array.isArray(userData.data)) {
                for (let j = 0; j < userData.data.length; j++) {
                  const user = userData.data[j];
                  if (user && user.id) {
                    userDataMap[user.id] = user;
                  }
                }
              }
              
              // Enhance streamer data with profile information
              allStreamers = allStreamers.map(streamer => {
                if (!streamer || !streamer.twitch_id) return streamer;
                
                const profile = userDataMap[streamer.twitch_id];
                if (profile) {
                  return {
                    ...streamer,
                    profile_image_url: profile.profile_image_url || null,
                    description: profile.description || null
                  };
                }
                return streamer;
              });
            }
          }
        } catch (profileError) {
          console.error('Error fetching user profiles:', profileError);
          // Continue with what we have
        }
      }
      
      if (allStreamers.length === 0) {
        toast.error('No small streamers found right now. Try again later.', { id: 'loading' });
      } else {
        // Update our component state
        setStreamers(allStreamers);
        setCurrentIndex(0);
        toast.success(`Found ${allStreamers.length} small streamers!`, { id: 'loading' });
      }
    } catch (error) {
      console.error('Error fetching low-viewer streams:', error);
      toast.error(error.message || 'Failed to load streamers', { id: 'loading' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamers = async () => {
    if (refreshing) return; // Prevent multiple clicks
    
    setRefreshing(true);
    toast.loading('Finding small streamers...', { id: 'refresh' });
    
    try {
      // Clear existing streamer data to avoid showing stale data
      setStreamers([]);
      
      if (twitchAccessToken) {
        // Use the existing token to refresh data from Twitch
        await fetchLowViewerStreams(twitchAccessToken);
      } else {
        // Re-authenticate if token is missing
        const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
        const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          throw new Error('Twitch API credentials missing');
        }
        
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        if (!accessToken) {
          throw new Error('No access token received from Twitch');
        }
        
        setTwitchAccessToken(accessToken);
        await fetchLowViewerStreams(accessToken);
      }
      
      toast.success('Found new small streamers!', { id: 'refresh' });
    } catch (error) {
      console.error('Error refreshing streamer data:', error);
      toast.error(`Failed to refresh data: ${error.message}`, { id: 'refresh' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSwipeRight = async () => {
    // Keep track of the streamer before showing auth modal
    const currentStreamer = streamers[currentIndex];
    
    if (!user) {
      toast.info('Sign in to save favorites & view them later!');
      setShowAuthModal(true);
      return;
    }

    // Learn from user preference - they liked this streamer's category
    if (currentStreamer?.category_id && hasSetPreferences) {
      learnFromInteraction(currentStreamer.category_id, true);
    }

    // Move to next card first to prevent UI freeze
    nextCard();

    // Now handle the database operations if needed
    if (currentStreamer?.twitch_id) {
      try {
        // First check if this streamer already exists in our database
        const { data: existingStreamer } = await supabase
          .from('twitch_streamers')
          .select('id')
          .eq('twitch_id', currentStreamer.twitch_id)
          .single();
          
        let streamerId;
        
        if (existingStreamer) {
          // Use existing record
          streamerId = existingStreamer.id;
          
          // Update votes
          await supabase
            .from('twitch_streamers')
            .update({ votes: currentStreamer.votes + 1 })
            .eq('id', streamerId);
        } else {
          // Insert new streamer into database
          const { data: newStreamer, error } = await supabase
            .from('twitch_streamers')
            .insert({
              username: currentStreamer.username,
              twitch_id: currentStreamer.twitch_id,
              votes: 1
            })
            .select()
            .single();
            
          if (error) throw error;
          streamerId = newStreamer.id;
        }
        
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: streamerId 
          });
          
        // Record in history
        await supabase
          .from('user_history')
          .upsert({
            user_id: user.id,
            streamer_id: streamerId,
            interaction_type: 'swiped_right'
          });
          
        toast.success('Added to favorites!');
      } catch (error) {
        console.error('Error saving favorite:', error);
        toast.error('Failed to save favorite. Please try again.');
      }
    }
  };

  const handleSwipeLeft = async () => {
    // Record in history that user swiped left if they're logged in
    const currentStreamer = streamers[currentIndex];
    
    // Learn from user preference - they didn't like this streamer's category
    if (currentStreamer?.category_id && hasSetPreferences) {
      learnFromInteraction(currentStreamer.category_id, false);
    }
    
    // Move to next card immediately to prevent UI freeze
    nextCard();
    
    // Only record this if user is logged in and we have the streamer in our database
    if (user && currentStreamer?.twitch_id) {
      try {
        // Check if streamer exists in our database
        const { data: existingStreamer } = await supabase
          .from('twitch_streamers')
          .select('id')
          .eq('twitch_id', currentStreamer.twitch_id)
          .single();
          
        // Only record if we have this streamer in our database
        if (existingStreamer) {
          await supabase
            .from('user_history')
            .upsert({
              user_id: user.id,
              streamer_id: existingStreamer.id,
              interaction_type: 'swiped_left'
            });
        }
      } catch (error) {
        console.error('Error recording swipe left:', error);
        // Don't show error to user, just log it
      }
    }
  };

  const nextCard = () => {
    // Reset animation
    controls.start({ x: 0, rotateZ: 0 });
    
    // Go to next card
    setCurrentIndex(prevIndex => prevIndex + 1);
    
    // Reorder remaining streamers to mix up categories
    if (streamers.length > currentIndex + 2) { // Don't shuffle if we're on the last card
      setStreamers(prev => {
        // Keep the next card the same (at currentIndex + 1)
        const nextCardStreamer = prev[currentIndex + 1];
        
        // Get all streamers after the next card
        const remainingStreamers = prev.slice(currentIndex + 2);
        
        // Check if we just showed a wildcard
        const wasWildcard = prev[currentIndex]?.isWildcard;
        
        // Group streamers by category and wildcard status for better shuffling
        const streamersByCategory = {};
        const preferredStreamers = [];
        const wildcardStreamers = [];
        
        remainingStreamers.forEach(streamer => {
          if (streamer.isWildcard) {
            wildcardStreamers.push(streamer);
          } else {
            preferredStreamers.push(streamer);
            
            // Also group by category
            const categoryId = streamer.category_id || 'unknown';
            if (!streamersByCategory[categoryId]) {
              streamersByCategory[categoryId] = [];
            }
            streamersByCategory[categoryId].push(streamer);
          }
        });
        
        // Flatten in a way that alternates categories
        let shuffledStreamers = [];
        
        // If we just showed a wildcard, prioritize preferred streamers next
        if (wasWildcard && preferredStreamers.length > 0) {
          console.log("Just showed wildcard, prioritizing preferred streamers next");
          
          // First add all preferred streamers
          const categories = Object.keys(streamersByCategory);
          const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);
          
          let categoryIndex = 0;
          while (shuffledStreamers.length < preferredStreamers.length) {
            const category = shuffledCategories[categoryIndex % shuffledCategories.length];
            const streamersInCategory = streamersByCategory[category];
            
            if (streamersInCategory && streamersInCategory.length > 0) {
              // Take the first streamer from this category
              shuffledStreamers.push(streamersInCategory.shift());
            }
            
            // Move to next category
            categoryIndex++;
            
            // If we've gone through all categories, check if we need a second round
            if (categoryIndex >= shuffledCategories.length) {
              // Remove empty categories
              for (let i = shuffledCategories.length - 1; i >= 0; i--) {
                if (!streamersByCategory[shuffledCategories[i]] || 
                    streamersByCategory[shuffledCategories[i]].length === 0) {
                  shuffledCategories.splice(i, 1);
                }
              }
              
              // If no categories left, we're done
              if (shuffledCategories.length === 0) break;
            }
          }
          
          // Then add wildcards at the end
          shuffledStreamers = [...shuffledStreamers, ...wildcardStreamers.sort(() => Math.random() - 0.5)];
        } else {
          // Normal category-based shuffling, but still keeping wildcards proportionally distributed
          const categories = Object.keys(streamersByCategory);
          const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);
          
          // Calculate how often to insert wildcards
          const wildcardInterval = preferredStreamers.length > 0 ? 
            Math.max(2, Math.floor(preferredStreamers.length / wildcardStreamers.length)) : 1;
          
          let categoryIndex = 0;
          let wildcardIndex = 0;
          
          // Mix preferred and wildcard streamers
          while (shuffledStreamers.length < remainingStreamers.length) {
            // Insert a wildcard every few streamers
            if (wildcardStreamers.length > 0 && 
                shuffledStreamers.length > 0 && 
                shuffledStreamers.length % wildcardInterval === 0 && 
                wildcardIndex < wildcardStreamers.length) {
              shuffledStreamers.push(wildcardStreamers[wildcardIndex++]);
              continue;
            }
            
            // Otherwise add from preferred categories
            if (shuffledCategories.length > 0) {
              const category = shuffledCategories[categoryIndex % shuffledCategories.length];
              const streamersInCategory = streamersByCategory[category];
              
              if (streamersInCategory && streamersInCategory.length > 0) {
                // Take the first streamer from this category
                shuffledStreamers.push(streamersInCategory.shift());
              }
              
              // Move to next category
              categoryIndex++;
              
              // If we've gone through all categories, remove empty ones
              if (categoryIndex >= shuffledCategories.length) {
                for (let i = shuffledCategories.length - 1; i >= 0; i--) {
                  if (!streamersByCategory[shuffledCategories[i]] || 
                      streamersByCategory[shuffledCategories[i]].length === 0) {
                    shuffledCategories.splice(i, 1);
                  }
                }
              }
            } else if (wildcardIndex < wildcardStreamers.length) {
              // If we've gone through all preferred streamers, add remaining wildcards
              shuffledStreamers.push(wildcardStreamers[wildcardIndex++]);
            } else {
              // No more streamers to add
              break;
            }
          }
        }
        
        // Return updated array: [current cards up to next card, then shuffled remaining]
        return [...prev.slice(0, currentIndex + 2), ...shuffledStreamers];
      });
    }
  };

  const handleDragStart = (_, info) => {
    setDragStart({ x: info.point.x, y: info.point.y });
  };

  const handleDragEnd = (_, info) => {
    const dragEndX = info.point.x;
    const deltaX = dragEndX - dragStart.x;
    
    if (deltaX > 100) {
      // Swiped right
      controls.start({ x: window.innerWidth, rotateZ: 10 }).then(handleSwipeRight);
    } else if (deltaX < -100) {
      // Swiped left
      controls.start({ x: -window.innerWidth, rotateZ: -10 }).then(handleSwipeLeft);
    } else {
      // Reset if the swipe wasn't far enough
      controls.start({ x: 0, rotateZ: 0 });
    }
  };

  const toggleBio = (streamerId) => {
    setExpandedBios(prev => {
      const newSet = new Set(prev);
      if (newSet.has(streamerId)) {
        newSet.delete(streamerId);
      } else {
        newSet.add(streamerId);
      }
      return newSet;
    });
  };

  const renderNoMoreCards = () => {
    return (
      <div className={styles.noMoreCardsContainer}>
        <h2>Loading more streamers...</h2>
        <div className={styles.spinner}></div>
        <p>Finding more small streamers for you...</p>
      </div>
    );
  };

  // Auto-load more streamers when user reaches the end
  useEffect(() => {
    if (currentIndex >= streamers.length && streamers.length > 0 && !loading) {
      // We've reached the end of the current batch, load more
      fetchMoreStreamers();
    }
  }, [currentIndex, streamers.length]);

  const fetchMoreStreamers = async () => {
    if (loading || !twitchAccessToken) return;
    
    try {
      setLoading(true);
      
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      let newLowViewerStreams = [];
      let paginationCursor = null;
      const maxPagesToCheck = 3;
      let currentPage = 0;
      
      // Avoid showing streamers we've already seen
      const existingIds = new Set(streamers.map(s => s.twitch_id));
      
      // Randomize which categories to check
      let categoriesToCheck = [];
      if (selectedPreferences.length > 0) {
        // User has preferences, prioritize those first
        categoriesToCheck = [...selectedPreferences];
      } else {
        // No preferences - use a randomized selection of top categories
        const shuffledCategories = [...streamCategories].sort(() => Math.random() - 0.5);
        categoriesToCheck = shuffledCategories.map(cat => cat.id);
      }
      
      // Limit categories to check to keep API calls reasonable
      categoriesToCheck = categoriesToCheck.slice(0, 5);
      
      // Keep track of streamers per category for diversity
      const streamersPerCategory = {};
      const MAX_PER_CATEGORY = 3;
      
      // Try different game categories to find streamers
      for (const gameId of categoriesToCheck) {
        if (newLowViewerStreams.length >= 15) break; // Stop if we have enough
        
        // Skip if we already have enough from this category
        if (streamersPerCategory[gameId] >= MAX_PER_CATEGORY) continue;
        
        try {
          const queryParams = new URLSearchParams({
            first: 100,
            game_id: gameId,
            language: 'en'
          });
          
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${twitchAccessToken}`
            }
          });
          
          if (!streamsResponse.ok) {
            console.error(`Error fetching streams for game ${gameId}: ${streamsResponse.status}`);
            continue; // Try next game
          }
          
          const streamsData = await streamsResponse.json();
          
          // Process the results
          if (streamsData && streamsData.data && Array.isArray(streamsData.data)) {
            // Sort by viewer count
            const sortedStreams = [...streamsData.data].sort((a, b) => {
              return (a.viewer_count || 999) - (b.viewer_count || 999);
            });
            
            // Take streams with between 5-50 viewers
            const eligibleStreams = sortedStreams.filter(stream =>
              stream && 
              typeof stream.viewer_count === 'number' && 
              stream.viewer_count >= 5 && 
              stream.viewer_count <= 50 &&
              !existingIds.has(stream.user_id)
            );
            
            // Track how many from this category
            const countToTake = Math.min(eligibleStreams.length, MAX_PER_CATEGORY);
            streamersPerCategory[gameId] = (streamersPerCategory[gameId] || 0) + countToTake;
            
            const selectedStreams = eligibleStreams.slice(0, countToTake);
            
            // Flag whether these are from preferred categories
            const isPreferredCategory = !selectedPreferences.length || selectedPreferences.includes(gameId);
            
            // Map to our format with wildcard indicator
            const formattedStreams = selectedStreams.map(stream => ({
              id: stream.user_id,
              twitch_id: stream.user_id,
              username: stream.user_login,
              display_name: stream.user_name,
              is_live: true,
              view_count: stream.viewer_count,
              game_name: stream.game_name || "",
              stream_title: stream.title || "",
              thumbnail_url: stream.thumbnail_url ? 
                stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                null,
              votes: 0,
              category_id: gameId,
              isWildcard: !isPreferredCategory
            }));
            
            // Add new streamers to our list
            newLowViewerStreams.push(...formattedStreams);
          }
        } catch (error) {
          console.error(`Error processing game ${gameId}:`, error);
        }
      }
      
      // If we don't have enough streamers yet, try the generic approach
      if (newLowViewerStreams.length < 10) {
        while (newLowViewerStreams.length < 10 && currentPage < maxPagesToCheck) {
          currentPage++;
          
          // Use a different approach for each page to diversify results
          const queryParams = new URLSearchParams({
            first: 100,
            language: 'en'
          });
          
          if (paginationCursor) {
            queryParams.append('after', paginationCursor);
          }
          
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${twitchAccessToken}`
            }
          });
          
          if (!streamsResponse.ok) {
            throw new Error(`Error fetching streams: ${streamsResponse.status}`);
          }
          
          const streamsData = await streamsResponse.json();
          
          // Update pagination cursor for next page
          paginationCursor = streamsData.pagination?.cursor;
          
          // Process the results
          if (streamsData && streamsData.data && Array.isArray(streamsData.data)) {
            for (let i = 0; i < streamsData.data.length; i++) {
              const stream = streamsData.data[i];
              if (stream && 
                  typeof stream.viewer_count === 'number' && 
                  stream.viewer_count >= 5 && 
                  stream.viewer_count <= 50 &&
                  !existingIds.has(stream.user_id)) { // Skip streamers we already have
                
                newLowViewerStreams.push({
                  id: stream.user_id,
                  twitch_id: stream.user_id,
                  username: stream.user_login,
                  display_name: stream.user_name,
                  is_live: true,
                  view_count: stream.viewer_count,
                  game_name: stream.game_name || "",
                  stream_title: stream.title || "",
                  thumbnail_url: stream.thumbnail_url ? 
                    stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                    null,
                  votes: 0,
                  category_id: stream.game_id || 'unknown',
                  isWildcard: true
                });
                
                // Only add up to 15 streamers
                if (newLowViewerStreams.length >= 15) break;
              }
            }
          }
          
          // Break if we can't get more pages
          if (!paginationCursor) break;
        }
      }
      
      // Sort by viewer count (lowest first)
      newLowViewerStreams.sort((a, b) => (a.view_count || 0) - (b.view_count || 0));
      
      if (newLowViewerStreams.length > 0) {
        // Get profile data for new streamers
        const userIds = [];
        for (let i = 0; i < newLowViewerStreams.length; i++) {
          if (newLowViewerStreams[i].twitch_id) {
            userIds.push(newLowViewerStreams[i].twitch_id);
          }
        }
        
        // Remove duplicates
        const uniqueUserIds = [...new Set(userIds)];
        
        if (uniqueUserIds.length > 0) {
          try {
            const userQueryParams = [];
            for (let i = 0; i < uniqueUserIds.length; i++) {
              userQueryParams.push(`id=${uniqueUserIds[i]}`);
            }
            
            const userQueryString = userQueryParams.join('&');
            
            const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${userQueryString}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${twitchAccessToken}`
              }
            });
            
            if (usersResponse.ok) {
              const userData = await usersResponse.json();
              
              // Create a lookup map
              const userDataMap = {};
              if (userData && userData.data && Array.isArray(userData.data)) {
                for (let i = 0; i < userData.data.length; i++) {
                  const user = userData.data[i];
                  if (user && user.id) {
                    userDataMap[user.id] = user;
                  }
                }
              }
              
              // Add profile data
              for (let i = 0; i < newLowViewerStreams.length; i++) {
                const streamer = newLowViewerStreams[i];
                if (streamer && streamer.twitch_id && userDataMap[streamer.twitch_id]) {
                  const profile = userDataMap[streamer.twitch_id];
                  newLowViewerStreams[i] = {
                    ...streamer,
                    profile_image_url: profile.profile_image_url || null,
                    description: profile.description || null
                  };
                }
              }
            }
          } catch (profileError) {
            console.error('Error fetching profiles for new batch:', profileError);
            // Continue with what we have
          }
        }
        
        // Append new streamers to the existing list
        setStreamers(prev => [...prev, ...newLowViewerStreams]);
        
        // Don't advance the currentIndex, just add to the list
        toast.success(`Found ${newLowViewerStreams.length} more streamers!`, { duration: 2000 });
      } else {
        // If no new streamers found, try again with different params later
        toast.info('Looking for more small streamers...', { duration: 2000 });
        setTimeout(() => fetchMoreStreamers(), 1000);
      }
    } catch (error) {
      console.error('Error fetching more streamers:', error);
      toast.error('Error loading more streamers', { duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const renderCards = () => {
    if (loading) {
      return (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading streamers...</p>
        </div>
      );
    }

    if (!streamers.length) {
      return (
        <div className={styles.loadingContainer}>
          <p>No streamers found. Try refreshing.</p>
          <button 
            className={styles.refreshButton}
            onClick={fetchStreamers}
          >
            Refresh Streamers
          </button>
        </div>
      );
    }

    if (currentIndex >= streamers.length) {
      return renderNoMoreCards();
    }

    const streamer = streamers[currentIndex];
    
    // Ensure streamer data is valid
    if (!streamer) {
      return (
        <div className={styles.loadingContainer}>
          <p>Streamer data is missing. Try refreshing.</p>
          <button 
            className={styles.refreshButton}
            onClick={fetchStreamers}
          >
            Refresh Streamers
          </button>
        </div>
      );
    }
    
    return (
      <motion.div 
        className={styles.card}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        whileTap={{ scale: 0.98 }}
      >
        <div 
          className={styles.cardImageContainer}
          style={{ backgroundImage: `url(${streamer.thumbnail_url || streamer.profile_image_url || 'https://via.placeholder.com/300'})` }}
        >
          <div className={styles.streamerOverlay}>
            <span className={styles.streamerNameOverlay}>{streamer.display_name || streamer.username}</span>
          </div>
          
          {streamer.is_live === true && (
            <div className={styles.liveIndicator}>
              LIVE
              <div className={styles.viewerCount}>
                {(streamer.view_count || 0).toLocaleString()} viewers
              </div>
            </div>
          )}
          
          {streamer.isWildcard && (
            <div className={styles.wildcardIndicator}>
              WILDCARD
            </div>
          )}
          
          <div className={styles.swipeOverlay}>
            <motion.div 
              className={styles.likeOverlay} 
              animate={{ opacity: controls.x > 50 ? 1 : 0 }}
            >
              FAVORITE
            </motion.div>
            <motion.div 
              className={styles.dislikeOverlay} 
              animate={{ opacity: controls.x < -50 ? 1 : 0 }}
            >
              PASS
            </motion.div>
          </div>
        </div>
        <div className={styles.cardContent}>
          <h2 className={styles.streamerName}>{streamer.display_name || streamer.username}</h2>
          
          <div className={styles.contentScroll}>
            {streamer.stream_title && (
              <p className={styles.streamTitle}>
                {streamer.stream_title}
              </p>
            )}
            
            {streamer.game_name && (
              <div className={styles.gameTag}>Playing: {streamer.game_name}</div>
            )}
            
            {streamer.description && (
              <div className={styles.bioSection}>
                <button 
                  className={styles.bioToggle}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBio(streamer.id);
                  }}
                >
                  {expandedBios.has(streamer.id) ? '▼ Hide Bio' : '▶ Show Bio'}
                </button>
                {expandedBios.has(streamer.id) && (
                  <p className={styles.bio}>{streamer.description}</p>
                )}
              </div>
            )}
          </div>
          
          <div className={styles.cardFooter}>
            <div className={styles.statsContainer}>
              {streamer.is_live && streamer.view_count > 0 && (
                <span className={styles.viewCount}>👁️ {streamer.view_count.toLocaleString()} viewers</span>
              )}
              {streamer.votes > 0 && (
                <span className={styles.voteCount}>❤️ {streamer.votes} votes</span>
              )}
            </div>
            
            {streamer.is_live && (
              <Link 
                to={`/stream/${streamer.username}`} 
                className={styles.watchButton}
              >
                🔴 Watch Live
              </Link>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const renderButtons = () => {
    if (currentIndex >= streamers.length) return null;
    
    return (
      <div className={styles.actionButtons}>
        <button 
          className={`${styles.actionButton} ${styles.dislikeButton}`}
          onClick={() => controls.start({ x: -window.innerWidth, rotateZ: -10 }).then(handleSwipeLeft)}
        >
          👎
        </button>
        <button 
          className={`${styles.actionButton} ${styles.likeButton}`}
          onClick={() => controls.start({ x: window.innerWidth, rotateZ: 10 }).then(handleSwipeRight)}
        >
          ❤️
        </button>
      </div>
    );
  };

  const renderAuthSplash = () => {
    return (
      <div className={styles.authSplashContainer}>
        <div className={styles.authSplashContent}>
          <h1>Discover New Streamers</h1>
          <div className={styles.splashImageContainer}>
            <img 
              src="/dig-deeper-preview.png" 
              alt="Dig Deeper Preview"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/500x300?text=Dig+Deeper";
              }}
              className={styles.splashImage}
            />
          </div>
          <div className={styles.splashDescription}>
            <h2>Find Your Next Favorite Streamer</h2>
            <p>Browse through trending and up-and-coming streamers on Twitch.</p>
            <ul className={styles.featureList}>
              <li>See who's currently live</li>
              <li>Discover streamers based on popularity</li>
              <li>Save your favorites to watch later</li>
              <li>Support streamers with your votes</li>
            </ul>
          </div>
          
          <div className={styles.authButtons}>
            <button 
              onClick={() => navigate('/login')}
              className={styles.authButton}
            >
              Login to Continue
            </button>
            <button 
              onClick={() => navigate('/signup')}
              className={styles.authButtonSecondary}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Check if user is authenticated, if not show splash screen
  if (!user) {
    return renderAuthSplash();
  }

  // Preference handling functions
  const togglePreference = (categoryId) => {
    setSelectedPreferences(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        // Limit to 3 selections
        if (prev.length >= 3) {
          return [...prev.slice(1), categoryId]; // Remove oldest, add new
        }
        return [...prev, categoryId];
      }
    });
  };
  
  const savePreferences = () => {
    if (user) {
      localStorage.setItem(`digdeeper_preferences_${user.id}`, JSON.stringify(selectedPreferences));
    }
    setHasSetPreferences(true);
    setShowPreferenceSelector(false);
    // Now fetch streamers with new preferences
    if (twitchAccessToken) {
      fetchLowViewerStreams(twitchAccessToken);
    }
  };
  
  const skipPreferences = () => {
    // If user has already set preferences before, this is a cancel action
    if (hasSetPreferences) {
      // Just close the modal without changing preferences
      setShowPreferenceSelector(false);
      
      // Reset to their previous preferences
      if (user) {
        const savedPreferences = localStorage.getItem(`digdeeper_preferences_${user.id}`);
        if (savedPreferences) {
          try {
            const parsedPreferences = JSON.parse(savedPreferences);
            setSelectedPreferences(parsedPreferences);
          } catch (e) {
            console.error('Error parsing saved preferences', e);
          }
        }
      }
      return;
    }
    
    // This is initial setup - user is skipping preference selection
    setSelectedPreferences([]); // Empty preferences = show all
    setHasSetPreferences(true);
    setShowPreferenceSelector(false);
    // Fetch streamers with default settings
    if (twitchAccessToken) {
      fetchLowViewerStreams(twitchAccessToken);
    }
  };
  
  // Render the preference selector
  const renderPreferenceSelector = () => {
    const isUpdate = hasSetPreferences;
    
    return (
      <div className={styles.preferenceSelectorOverlay}>
        <div className={styles.preferenceSelector}>
          <h2>{isUpdate ? 'Update Your Preferences' : 'What kind of streams do you enjoy?'}</h2>
          <p>{isUpdate 
            ? 'Select up to 3 categories to update your recommendations' 
            : 'Select up to 3 categories to personalize your recommendations'}
          </p>
          
          <div className={styles.categoryGrid}>
            {streamCategories.map(category => (
              <div 
                key={category.id}
                className={`${styles.categoryCard} ${selectedPreferences.includes(category.id) ? styles.selected : ''}`}
                onClick={() => togglePreference(category.id)}
              >
                <div className={styles.categoryIcon}>{category.icon}</div>
                <div className={styles.categoryName}>{category.name}</div>
                {selectedPreferences.includes(category.id) && (
                  <div className={styles.selectedIndicator}>✓</div>
                )}
              </div>
            ))}
          </div>
          
          <div className={styles.preferencesButtons}>
            <button 
              className={styles.skipButton}
              onClick={skipPreferences}
            >
              {isUpdate ? 'Cancel' : 'Skip / Show Everything'}
            </button>
            <button 
              className={styles.saveButton}
              onClick={savePreferences}
              disabled={selectedPreferences.length === 0}
            >
              {selectedPreferences.length === 0 
                ? 'Select Categories' 
                : isUpdate 
                  ? 'Update Preferences' 
                  : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Learning algorithm to refine preferences based on user interactions
  const learnFromInteraction = (categoryId, isLiked) => {
    if (!user) return; // Only learn for logged-in users
    
    // Get the current category preferences
    const categoryPreferences = JSON.parse(localStorage.getItem(`digdeeper_category_stats_${user.id}`) || '{}');
    
    // Update the preference stats for this category
    if (!categoryPreferences[categoryId]) {
      categoryPreferences[categoryId] = { likes: 0, dislikes: 0 };
    }
    
    if (isLiked) {
      categoryPreferences[categoryId].likes += 1;
    } else {
      categoryPreferences[categoryId].dislikes += 1;
    }
    
    // Save the updated stats
    localStorage.setItem(`digdeeper_category_stats_${user.id}`, JSON.stringify(categoryPreferences));
    
    // Every 5 interactions, consider updating user preferences
    const totalInteractions = Object.values(categoryPreferences).reduce(
      (sum, stats) => sum + stats.likes + stats.dislikes, 0
    );
    
    if (totalInteractions % 5 === 0 && totalInteractions >= 10) {
      recalculatePreferences(categoryPreferences);
    }
  };
  
  // Automatically update preferences based on interaction history
  const recalculatePreferences = (categoryStats) => {
    // Calculate a score for each category based on like/dislike ratio
    const categoryScores = {};
    
    Object.entries(categoryStats).forEach(([categoryId, stats]) => {
      const total = stats.likes + stats.dislikes;
      if (total >= 3) { // Only consider categories with enough interactions
        const score = (stats.likes / total) * 100; // Score as percentage of likes
        categoryScores[categoryId] = score;
      }
    });
    
    // Sort categories by score
    const rankedCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1]) // Sort by score desc
      .map(([id]) => id); // Just keep the IDs
    
    // Select top 3 categories with score > 60%
    const recommendedCategories = rankedCategories
      .filter(id => categoryScores[id] >= 60)
      .slice(0, 3);
    
    // If user has manually selected preferences, and our recommendations are different,
    // show a notification suggesting new preferences
    if (recommendedCategories.length > 0 && 
        !arraysEqual(recommendedCategories, selectedPreferences) &&
        selectedPreferences.length > 0) {
      
      const categoryNames = recommendedCategories.map(id => {
        const category = streamCategories.find(c => c.id === id);
        return category ? category.name : 'Unknown';
      });
      
      toast((t) => (
        <div onClick={() => { 
          updatePreferences(recommendedCategories); 
          toast.dismiss(t.id);
        }}>
          <b>Update your preferences?</b>
          <p>Based on your likes, we suggest: {categoryNames.join(', ')}</p>
          <small>(Tap to update)</small>
        </div>
      ), { duration: 8000 });
    }
  };
  
  // Update preferences based on learned preferences
  const updatePreferences = (newPreferences) => {
    setSelectedPreferences(newPreferences);
    if (user) {
      localStorage.setItem(`digdeeper_preferences_${user.id}`, JSON.stringify(newPreferences));
    }
    toast.success('Preferences updated! Pull to refresh for new recommendations.', { duration: 3000 });
  };
  
  // Helper function to compare arrays
  const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  };

  return (
    <div className={styles.container}>
      <AuthModal 
        show={showAuthModal} 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)} 
        onLogin={() => window.location.href = '/login'}
        onSignup={() => window.location.href = '/signup'}
      />
      
      <div className={styles.header}>
        <h1>Dig Deeper</h1>
        <p>Discover and vote for your favorite Twitch streamers</p>
        
        <div className={styles.headerButtons}>
          <Link to="/leaderboard" className={styles.leaderboardLink}>
            View Leaderboard
          </Link>
          
          {user ? (
            <Link to="/favorites" className={styles.favoritesLink}>
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </Link>
          ) : (
            <button 
              onClick={() => {
                toast.info('Sign in to access your saved favorites!');
                setShowAuthModal(true);
              }}
              className={styles.favoritesLink}
            >
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </button>
          )}
          
          <button
            onClick={() => setShowPreferenceSelector(true)}
            className={styles.preferencesButton}
            title="Update your content preferences"
          >
            <span className={styles.prefIcon}>⚙️</span> Preferences
          </button>
          
          <button
            onClick={fetchStreamers}
            className={`${styles.refreshButton} ${refreshing ? styles.refreshing : ''}`}
            title="Refresh real-time data from Twitch"
            disabled={refreshing}
          >
            <span className={styles.refreshIcon}>🔄</span> 
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>
      
      <div className={styles.instructionsContainer}>
        <div className={styles.instruction}>
          <span>👈</span>
          <p>Swipe left to pass</p>
        </div>
        <div className={styles.instruction}>
          <span>👉</span>
          <p>Swipe right to favorite</p>
        </div>
      </div>
      
      <div className={styles.cardsContainer}>
        {renderCards()}
      </div>
      
      {renderButtons()}
      
      {showPreferenceSelector && renderPreferenceSelector()}
    </div>
  );
};

export default DigDeeperPage;
