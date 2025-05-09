import { useEffect, useState, useRef } from "react";
import { fetchStreamers, createErrorState } from "../api/twitch";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import styles from './Discover.module.css';
import { FaLock } from 'react-icons/fa';

// Configurable vote threshold for promoting streamers from Dig Deeper
const VOTE_THRESHOLD = 5; // Minimum votes needed to appear on Discover page

const Discover = () => {
  const navigate = useNavigate();
  const [streamers, setStreamers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');
  const streamersGridRef = useRef(null);
  const nominationRef = useRef(null);
  const nominationSectionRef = useRef(null);
  const [nomination, setNomination] = useState({ name: '', reason: '' });
  const [nominationUrl, setNominationUrl] = useState('');
  const [nominationStatus, setNominationStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authAction, setAuthAction] = useState(null);
  const [totalDonations, setTotalDonations] = useState(0);
  const [timeUntilPayout, setTimeUntilPayout] = useState('');
  const [showViewMore, setShowViewMore] = useState(false);
  const [streamerVotes, setStreamerVotes] = useState({});
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredStreamer, setHoveredStreamer] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const FREE_STREAMER_LIMIT = 5;
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Get user's preferences or default values
  const getUserPreferences = () => {
    if (user) {
      return {
        sortOption: localStorage.getItem(`sortPreference_${user.id}`) || "viewers-high",
        streamersFilter: localStorage.getItem(`streamersFilter_${user.id}`) || "all"
      };
    }
    return {
      sortOption: localStorage.getItem('sortPreference') || "viewers-high",
      streamersFilter: localStorage.getItem('streamersFilter') || "all"
    };
  };

  // Initialize with user preferences
  const userPrefs = getUserPreferences();
  const [sortOption, setSortOption] = useState(userPrefs.sortOption);
  const [streamersFilter, setStreamersFilter] = useState(userPrefs.streamersFilter);

  const OFFLINE_THUMBNAIL = "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg";
  const DEFAULT_PROFILE_IMAGE = "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";

  // Add this function to detect mobile at the start of your component
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  const loadStreamers = async () => {
    try {
      console.log('Starting to load streamers...');
      setIsLoading(true);
      setLoadError(null);
      
      // Add a timeout to ensure we don't wait forever
      const apiTimeout = 15000; // 15 seconds max wait time
      let didTimeout = false;
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          didTimeout = true;
          reject(new Error('API request timed out'));
        }, apiTimeout);
      });
      
      // Check if the API server is reachable before making the full request
      if (import.meta.env.VITE_API_URL) {
        try {
          console.log('Testing API connectivity...');
          const testResponse = await Promise.race([
            fetch(`${import.meta.env.VITE_API_URL}/api/health`, { 
              method: 'GET',
              mode: 'cors',
              cache: 'no-cache',
              headers: {
                'Content-Type': 'application/json',
              }
            }).catch(e => {
              console.error('API connectivity test failed:', e);
              return { ok: false, status: 0 };
            }),
            timeoutPromise
          ]);
          
          if (!testResponse.ok) {
            console.warn('API server not responding properly. Status:', testResponse.status);
            if (testResponse.status === 0) {
              setLoadError('Unable to connect to the API server. The server may be down or unavailable.');
              setIsLoading(false);
              return;
            }
          } else {
            console.log('API server is reachable.');
          }
        } catch (connectError) {
          console.error('Error testing API connectivity:', connectError);
          // Continue anyway to show the proper error from the API call
        }
      }
      
      // Fetch streamers with votes >= threshold from Dig Deeper
      try {
        const { data: votedStreamers, error: votedError } = await supabase
          .from('votes')
          .select('streamer, count')
          .eq('active', true)
          .gte('count', VOTE_THRESHOLD)
          .order('count', { ascending: false });
          
        if (votedError) {
          console.error('Error fetching voted streamers:', votedError);
          // Continue with empty votedStreamers
        }
        
        // Get streamer data from main API
        let streamersData;
        try {
          // Use Promise.race to add a timeout
          streamersData = await Promise.race([
            fetchStreamers(),
            timeoutPromise
          ]);
          
          // Validate streamer data immediately
          if (streamersData) {
            if (streamersData.error) {
              console.error('API returned error:', streamersData.message);
              throw new Error(streamersData.message || 'API error');
            }
            
            if (!Array.isArray(streamersData)) {
              console.error('API returned non-array response:', streamersData);
              streamersData = { error: true, message: 'Invalid API response format' };
            } else {
              // Normalize streamer data
              streamersData = streamersData.map(streamer => {
                if (!streamer) return null;
                return {
                  ...streamer,
                  user_name: streamer.user_name || streamer.display_name || streamer.username || 'Unknown',
                  user_login: streamer.user_login || streamer.username || streamer.login || streamer.user_name || 'unknown',
                  type: streamer.type || 'offline',
                  title: streamer.title || 'No title'
                };
              }).filter(Boolean); // Remove null entries
            }
          }
        } catch (error) {
          if (didTimeout) {
            console.error('Streamer API request timed out');
            streamersData = { error: true, message: 'API request timed out. Please try again later.' };
          } else {
            console.error('Error fetching streamers:', error);
            streamersData = { error: true, message: error.message || 'Unknown error occurred' };
          }
        }
        
        console.log('Loaded streamers from API:', streamersData);
        
        // Check if the result is an error object
        if (streamersData && streamersData.error) {
          console.error('Error loading streamers:', streamersData.message);
          setLoadError(streamersData.message || 'Failed to load live streamer data. Please try refreshing the page.');
          
          // Check if we have any streamer data from the database at all
          const { data: backupStreamers, error: backupError } = await supabase
            .from('streamers')
            .select('*')
            .order('username');
            
          if (!backupError && backupStreamers && backupStreamers.length > 0) {
            console.log('Using backup streamer data from database');
            setStreamers(backupStreamers.map(s => ({
              ...s,
              user_name: s.username || s.name || 'Unknown',
              user_login: s.username || s.login || s.name || 'unknown',
              type: 'offline',
              title: 'No title',
              thumbnail_url: null
            })));
          } else {
            setStreamers([]);
          }
        } else {
          let allStreamers = [];
          
          if (streamersData && Array.isArray(streamersData) && streamersData.length > 0) {
            console.log('Successfully fetched live data from API:', streamersData.length, 'streamers');
            allStreamers = [...streamersData];
          }
          
          // If we have voted streamers from Dig Deeper, add them to the list if not already present
          if (votedStreamers && votedStreamers.length > 0) {
            console.log('Found voted streamers from Dig Deeper:', votedStreamers.length);
            
            // Fetch Twitch data for these streamers if they have enough votes
            try {
              const usernames = votedStreamers.map(v => v.streamer);
              
              // Check if usernames exist in current streamers list
              const existingUsernames = new Set(allStreamers.map(s => s.user_login?.toLowerCase()));
              const missingUsernames = usernames.filter(username => 
                username && !existingUsernames.has(username.toLowerCase())
              );
              
              if (missingUsernames.length > 0) {
                // Get Twitch API credentials
                const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
                const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
                
                if (clientId && clientSecret) {
                  try {
                    // Get token with timeout
                    const tokenResponse = await Promise.race([
                      fetch('https://id.twitch.tv/oauth2/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
                      }),
                      new Promise((_, reject) => setTimeout(() => reject(new Error('Token request timed out')), 5000))
                    ]);
                    
                    if (tokenResponse.ok) {
                      const tokenData = await tokenResponse.json();
                      const accessToken = tokenData.access_token;
                      
                      if (accessToken) {
                        // Query Twitch API for users
                        const queryParams = missingUsernames.map(name => `login=${name}`).join('&');
                        const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${queryParams}`, {
                          headers: {
                            'Client-ID': clientId,
                            'Authorization': `Bearer ${accessToken}`
                          }
                        });
                        
                        if (usersResponse.ok) {
                          const userData = await usersResponse.json();
                          
                          if (userData.data && userData.data.length > 0) {
                            // Query stream status
                            const userIds = userData.data.map(user => user.id);
                            const streamsQueryParams = userIds.map(id => `user_id=${id}`).join('&');
                            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${streamsQueryParams}`, {
                              headers: {
                                'Client-ID': clientId,
                                'Authorization': `Bearer ${accessToken}`
                              }
                            });
                            
                            let liveStreams = {};
                            if (streamsResponse.ok) {
                              const streamsData = await streamsResponse.json();
                              streamsData.data.forEach(stream => {
                                liveStreams[stream.user_id] = stream;
                              });
                            }
                            
                            // Create streamer objects
                            const digDeeperStreamers = userData.data.map(user => {
                              const isLive = !!liveStreams[user.id];
                              const stream = liveStreams[user.id];
                              const voteData = votedStreamers.find(v => 
                                v.streamer.toLowerCase() === user.login.toLowerCase()
                              );
                              
                              return {
                                id: user.id,
                                user_id: user.id,
                                user_name: user.display_name,
                                user_login: user.login,
                                profile_image_url: user.profile_image_url,
                                description: user.description,
                                type: isLive ? "live" : "offline",
                                viewer_count: isLive ? stream.viewer_count : 0,
                                game_name: isLive ? stream.game_name : "Not Live",
                                title: isLive ? stream.title : "",
                                started_at: isLive ? stream.started_at : null,
                                thumbnail_url: isLive ? stream.thumbnail_url : null,
                                tag_ids: isLive ? stream.tag_ids : [],
                                is_dig_deeper: true, // Flag to identify streamers from Dig Deeper
                                vote_count: voteData ? voteData.count : 0
                              };
                            });
                            
                            // Add new streamers to the list
                            console.log(`Adding ${digDeeperStreamers.length} voted streamers from Dig Deeper`);
                            allStreamers = [...allStreamers, ...digDeeperStreamers];
                          }
                        }
                      }
                    }
                  } catch (tokenError) {
                    console.error('Error getting Twitch token:', tokenError);
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching Twitch data for voted streamers:', error);
            }
          }
          
          // Deduplicate streamers by user_id
          const uniqueStreamers = [];
          const seenIds = new Set();
          
          for (const streamer of allStreamers) {
            // Skip null/undefined streamers
            if (!streamer) continue;
            
            // Use user_id or fallback to other identifiers
            const streamerId = streamer.user_id || streamer.id || `${streamer.user_login || streamer.username}`;
            
            if (streamerId && !seenIds.has(streamerId)) {
              seenIds.add(streamerId);
              
              // Ensure required fields exist
              const normalizedStreamer = {
                ...streamer,
                user_name: streamer.user_name || streamer.display_name || streamer.username || 'Unknown',
                user_login: streamer.user_login || streamer.username || streamer.login || 'unknown',
                type: streamer.type || 'offline',
                title: streamer.title || 'No title'
              };
              
              uniqueStreamers.push(normalizedStreamer);
            }
          }
          
          setStreamers(uniqueStreamers);
          setLoadError(null);
        }
      } catch (error) {
        console.error('Error in loadStreamers function:', error);
        setLoadError('Failed to load live streamer data. Please try refreshing the page.');
        
        // Try to load basic streamer info from database as a fallback
        try {
          const { data: basicStreamers } = await supabase
            .from('streamers')
            .select('*')
            .limit(20);
          
          if (basicStreamers && basicStreamers.length > 0) {
            setStreamers(basicStreamers.map(s => ({
              id: s.id,
              user_id: s.id,
              user_name: s.username || 'Unknown',
              user_login: s.username || 'unknown',
              type: 'offline',
              title: 'No title available',
              profile_image_url: null,
              thumbnail_url: null
            })));
          } else {
            setStreamers([]);
          }
        } catch (dbError) {
          console.error('Could not load backup data from database:', dbError);
          setStreamers([]);
        }
      }
    } catch (error) {
      console.error('Error in loadStreamers function:', error);
      setLoadError('Failed to load live streamer data. Please try refreshing the page.');
      
      // Try to load basic streamer info from database as a fallback
      try {
        const { data: basicStreamers } = await supabase
          .from('streamers')
          .select('*')
          .limit(20);
          
        if (basicStreamers && basicStreamers.length > 0) {
          setStreamers(basicStreamers.map(s => ({
            id: s.id,
            user_id: s.id,
            user_name: s.username || 'Unknown',
            user_login: s.username || 'unknown',
            type: 'offline',
            title: 'No title available',
            profile_image_url: null,
            thumbnail_url: null
          })));
        } else {
          setStreamers([]);
        }
      } catch (dbError) {
        console.error('Could not load backup data from database:', dbError);
        setStreamers([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTotalDonations = async () => {
    try {
      console.log('Fetching total donations...');
      const { data, error } = await supabase
        .rpc('calculate_weekly_donation_bomb');

      if (error) {
        console.error('Error calculating donation bomb:', error);
        throw error;
      }
      
      console.log('New donation bomb amount:', data);
      setTotalDonations(data || 0);
    } catch (error) {
      console.error('Error fetching total donations:', error);
      setTotalDonations(0);
    }
  };

  const updateTimeUntilReset = () => {
    const now = new Date();
    const nextSunday = new Date();
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    const diff = nextSunday - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    // Check user authentication state
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error checking auth:', error);
        } else if (currentUser) {
          console.log('User is authenticated:', currentUser.id);
          setUser(currentUser);
        } else {
          console.log('No authenticated user');
          setUser(null);
        }
      } catch (error) {
        console.error('Unexpected error checking auth:', error);
      }
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    loadStreamers();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUntilPayout(updateTimeUntilReset());
    }, 1000); // Update every second instead of every minute

    setTimeUntilPayout(updateTimeUntilReset());

    return () => clearInterval(timer);
  }, []);

  const fetchVotes = async () => {
    try {
      // Use a simpler query without grouping
      const { data: voteCounts, error: voteCountError } = await supabase
        .from("votes")
        .select("streamer, count")
        .eq('active', true);

      if (voteCountError) {
        console.error("Error fetching vote counts:", voteCountError);
        
        // Alternative approach if above query fails
        const { data: votes, error } = await supabase
          .from("votes")
          .select("streamer, amount")
          .eq('active', true);

        if (error) throw error;

        // Convert votes to a map of streamer -> total votes
        const votesMap = votes.reduce((acc, vote) => {
          acc[vote.streamer] = (acc[vote.streamer] || 0) + vote.amount;
          return acc;
        }, {});
        
        setStreamerVotes(votesMap);
        return votesMap;
      }
      
      // Convert vote counts to a map
      const votesMap = voteCounts.reduce((acc, item) => {
        acc[item.streamer] = item.count || 0;
        return acc;
      }, {});
      
      setStreamerVotes(votesMap);
      return votesMap;
    } catch (error) {
      console.error("Error fetching votes:", error);
      return {};
    }
  };

  // Load streamers on initial mount
  useEffect(() => {
    loadStreamers();
  }, []);
  
  // Listen for votes table changes to update votes
  useEffect(() => {
    const votesSubscription = supabase
      .channel('votes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes'
        },
        (payload) => {
          console.log('Votes update received:', payload);
          fetchVotes();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(votesSubscription);
    };
  }, []);

  const handleCardClick = (username) => {
    navigate(`/stream/${username.toLowerCase()}`);
  };

  // Filter and sort streamers
  const getSortedStreamers = () => {
    let filtered = [...streamers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(streamer => 
        streamer.user_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (streamersFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamersFilter === 'online' ? 
          streamer.type === "live" : 
          streamer.type !== "live"
      );
    }

    // Apply sorting
    switch (sortOption) {
      case "viewers-high":
        return filtered.sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
      case "viewers-low":
        return filtered.sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0));
      case "alphabetical":
        return filtered.sort((a, b) => a.user_name.localeCompare(b.user_name));
      case "popular":
        return filtered.sort((a, b) => {
          const votesA = streamerVotes[a.user_login] || 0;
          const votesB = streamerVotes[b.user_login] || 0;
          return votesB - votesA;
        });
      default:
        return filtered;
    }
  };

  const sortedStreamers = getSortedStreamers();

  const updateSortOption = (value) => {
    setSortOption(value);
  };

  const updateOnlineFilter = (checked) => {
    setStreamersFilter(checked ? 'online' : 'all');
  };

  const handleNomination = async (e) => {
    e.preventDefault();
    
    try {
      // Check if user is authenticated
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
        setShowAuthModal(true);
        return;
      }

      // Basic URL validation
      if (!nominationUrl.includes('twitch.tv/')) {
        setNominationStatus('Please enter a valid Twitch URL');
        return;
      }

      // Extract streamer name from URL
      const streamerName = nominationUrl.split('twitch.tv/').pop().split('/')[0];
      
      const { data, error } = await supabase
        .from('nominations')
        .insert([
          {
            streamer_url: nominationUrl,
            streamer_name: streamerName,
            nominated_by: currentUser.id
          }
        ]);

      if (error) throw error;

      setNominationUrl('');
      setNominationStatus('Streamer successfully nominated!');
      setTimeout(() => setNominationStatus(''), 3000);

    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        setNominationStatus('This streamer has already been nominated');
      } else {
        setNominationStatus('Error submitting nomination');
        console.error('Nomination error:', error);
      }
    }
  };

  // Add subscription listener in useEffect
  useEffect(() => {
    fetchTotalDonations();
    
    // Listen for prize pool and subscription changes
    const prizePoolSubscription = supabase
      .channel('prize-pool-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_pool'
        },
        (payload) => {
          console.log('Prize pool update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    const subscriptionSubscription = supabase
      .channel('subscriptions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_revenue'
        },
        (payload) => {
          console.log('Subscription update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(prizePoolSubscription);
      supabase.removeChannel(subscriptionSubscription);
    };
  }, []);

  const scrollToNomination = () => {
    nominationSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAuthPrompt = () => {
    navigate('/signup');
  };

  const handleLiveNowClick = () => {
    setStreamersFilter('online');
    streamersGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTotalStreamersClick = () => {
    setStreamersFilter('all');
    streamersGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Modify renderStreamerCard to handle streamers
  const renderStreamerCard = (streamer, index) => {
    // Early return if streamer data is invalid
    if (!streamer) {
      console.error('Invalid streamer data:', streamer);
      return null;
    }
    
    // Handle different data structures between streamers
    const userName = streamer.user_name || streamer.display_name || streamer.username || streamer.name;
    const userLogin = streamer.user_login || streamer.username || streamer.login || '';
    const userId = streamer.user_id || streamer.id || `streamer-${index}`;
    
    // Skip rendering if we don't have at least a name
    if (!userName) {
      console.error('Invalid streamer data (missing name):', streamer);
      return null;
    }
    
    // Only lock cards if user is not logged in AND index is beyond the free limit
    const isLocked = !user && index >= FREE_STREAMER_LIMIT;
    const voteCount = streamerVotes[userLogin] || streamer.vote_count || 0;

    // Use a standard placeholder image for missing profile images
    const getProfileImagePlaceholder = () => {
      // Use Twitch's default profile image or a placeholder that clearly indicates it's not real data
      return DEFAULT_PROFILE_IMAGE || "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";
    };
    
    // Get appropriate thumbnail - always use real thumbnails from Twitch
    const getThumbnail = () => {
      if (streamer.type === "live" && streamer.thumbnail_url) {
        return streamer.thumbnail_url.replace('{width}', '320').replace('{height}', '180');
      }
      return streamer.offline_image_url || OFFLINE_THUMBNAIL;
    };

    // Get proper profile image - check multiple properties
    const getProfileImage = () => {
      if (streamer.profile_image_url) {
        return streamer.profile_image_url;
      }
      
      // Check for profile_image property from Twitch API
      if (streamer.profile_image) {
        return streamer.profile_image;
      }
      
      return getProfileImagePlaceholder();
    };

    // Check if streamer is from Dig Deeper with enough votes
    const isFromDigDeeper = streamer.is_dig_deeper === true;

    return (
      <div 
        key={userId}
        className={`${styles.streamerCard} ${isLocked ? styles.lockedCard : ''} ${isFromDigDeeper ? styles.digDeeperCard : ''}`}
        onClick={() => isLocked ? handleAuthPrompt() : handleCardClick(userLogin || userName)}
      >
        <div className={styles.thumbnailWrapper}>
          <img
            className={styles.streamerThumbnail}
            src={getThumbnail()}
            alt={`${userName}'s stream`}
            onError={(e) => {
              console.log(`Failed to load thumbnail for ${userName}, using fallback`);
              e.target.src = "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=Stream+Unavailable";
            }}
          />
          {streamer.type === "live" && <span className={styles.liveBadge}>LIVE</span>}
        </div>
        <div className={styles.streamerCardContent}>
          <img
            className={styles.streamerProfileImage}
            src={getProfileImage()}
            alt={`${userName}'s profile`}
            onError={(e) => {
              console.log(`Failed to load profile image for ${userName}, using fallback`);
              e.target.src = getProfileImagePlaceholder();
            }}
          />
          <div className={styles.streamerInfo}>
            <h3 className={styles.streamerName}>{userName}</h3>
            {streamer.type === "live" && (
              <span className={styles.viewerCount}>{streamer.viewer_count || 0} viewers</span>
            )}
            <span className={styles.gameName}>{streamer.game_name || 'N/A'}</span>
            {voteCount > 0 && <span className={styles.votesBadge}>{voteCount} votes this week</span>}
          </div>
        </div>
        {isLocked && (
          <div className={styles.lockOverlay} onClick={handleAuthPrompt}>
            <FaLock className={styles.lockIcon} />
            <p className={styles.lockMessage}>Create an account to view more streamers</p>
          </div>
        )}
      </div>
    );
  };

  // Add glow effect
  useEffect(() => {
    const container = document.querySelector(`.${styles.discoverContainer}`);
    const handleMouseMove = (e) => {
      if (container) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        container.style.setProperty('--mouse-x', `${x}px`);
        container.style.setProperty('--mouse-y', `${y}px`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Handle retry for connection issues
  const handleRetry = () => {
    console.log('Retrying connection...');
    loadStreamers().catch(err => {
      console.error('Error retrying connection:', err);
    });
  };

  return (
    <div className={styles.discoverContainer}>
      <>
        <div className="glow-effect"></div>
        <div className={styles.discoverHeader}>
          <h1 className={styles.discoverTitle}>
            Discover Streamers
          </h1>
          <p className={styles.discoverSubtitle}>
            Find Hidden Gems, One Stream at a Time.
          </p>

          <div className={styles.statsContainer}>
            <div className={styles.statsGrid}>
              <div 
                className={`${styles.statItem} ${styles.clickable}`}
                onClick={handleLiveNowClick}
                role="button"
                tabIndex={0}
              >
                <span className={styles.statNumber}>
                  {streamers.filter(s => s.type === "live").length}
                </span>
                <span className={styles.statLabel}>LIVE NOW</span>
              </div>
              <div 
                className={`${styles.statItem} ${styles.clickable}`}
                onClick={handleTotalStreamersClick}
                role="button"
                tabIndex={0}
              >
                <span className={styles.statNumber}>
                  {streamers.length}
                </span>
                <span className={styles.statLabel}>TOTAL STREAMERS</span>
              </div>
              <div className={`${styles.statItem} ${styles.prizePool}`}>
                <span className={styles.statNumber}>
                  <span className={styles.currency}>$</span>
                  {totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={styles.statLabel}>PRIZE POOL</span>
                <div className={styles.prizePoolTimer} aria-label="Time until payout">
                  {timeUntilPayout}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.searchControls}>
            <div className={styles.searchWrapper}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search streamers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search streamers"
              />
              <div className={styles.filterControls}>
                <select
                  className={styles.sortSelect}
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  aria-label="Sort streamers"
                >
                  <option value="viewers-high">Viewers (High)</option>
                  <option value="viewers-low">Viewers (Low)</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="popular">Most Popular</option>
                </select>
                
                <div 
                  className={`${styles.toggleSwitch} ${streamersFilter === 'online' ? styles.online : styles.all}`}
                  onClick={() => setStreamersFilter(streamersFilter === 'online' ? 'all' : 'online')}
                  role="button"
                  tabIndex={0}
                  aria-label="Toggle online streamers"
                >
                  <div className={styles.toggleSwitchInner}>
                    <span className={`${styles.toggleOption} ${streamersFilter === 'online' ? styles.active : ''}`}>
                      Online
                    </span>
                    <span className={`${styles.toggleOption} ${streamersFilter === 'all' ? styles.active : ''}`}>
                      All
                    </span>
                    <div className={styles.toggleSlider} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.actionButtonsContainer}>
            <a 
              href="/dig-deeper"
              className={styles.digDeeperButtonLink}
              aria-label="Go to Dig Deeper page to find small streamers"
            >
              <span className={styles.buttonText}>Dig Deeper</span>
            </a>
            
            <button 
              onClick={scrollToNomination}
              className={styles.nominateButton}
              aria-label="Go to nominate streamer section"
            >
              Nominate a Streamer
            </button>
          </div>
          
          <div className={styles.digDeeperDescription}>
            <p>
              Dig Deeper - Swipe right to favorite streamers, 
              swipe left to skip.
            </p>
          </div>
        </div>

        <div className={styles.streamersSection}>
          <h2 className={styles.streamersTitle}>
            Featured Streamers
          </h2>
          <p className={styles.streamersSubtitle}>
          Find streamers, join the conversation, and vote for your favorites!
          </p>
          {!user && (
            <div className={styles.gatedContentMessage}>
              <h3>Want to see more amazing streamers?</h3>
              <p>Create a free account to unlock our full catalog of talented streamers and join our community!</p>
              <button className={styles.signUpButton} onClick={handleAuthPrompt}>
                Sign Up Now
              </button>
            </div>
          )}
        </div>

        <div className={styles.streamerGrid} ref={streamersGridRef}>
          {isLoading ? (
            <div className={styles.messageContainer}>
              <p>Loading streamers...</p>
            </div>
          ) : loadError ? (
            <div className={styles.messageContainer}>
              <div className={styles.errorMessage}>
                <h3>Oops! We couldn't load the streamers</h3>
                <p>{loadError}</p>
                <p>We're working on fixing this. Please try using a different browser or device.</p>
                <div className={styles.errorDetails}>
                  <p><strong>Troubleshooting Tips:</strong></p>
                  <ul>
                    <li>Make sure your internet connection is stable</li>
                    <li>Check if you're using a VPN or proxy that might block access</li>
                    <li>Try clearing your browser cache</li>
                    <li>If you're using an ad blocker, try disabling it temporarily</li>
                  </ul>
                </div>
                <div className={styles.buttonGroup}>
                  <button 
                    onClick={handleRetry} 
                    className={styles.retryButton}
                  >
                    Retry
                  </button>
                </div>
                <p className={styles.fallbackNote}>
                  <small>We only display real data from Twitch. No data is shown if we can't connect.</small>
                </p>
              </div>
            </div>
          ) : sortedStreamers.length === 0 ? (
            <div className={styles.messageContainer}>
              <div className={styles.errorMessage}>
                <h3>No streamers found</h3>
                <p>We couldn't find any streamers matching your filters.</p>
                <p>Try clearing your search or filters, or try again later.</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStreamersFilter('all');
                    setSortOption('viewers-high');
                    handleRetry();
                  }}
                  className={styles.retryButton}
                >
                  Reset Filters
                </button>
              </div>
            </div>
          ) : (
            sortedStreamers.map((streamer, index) => renderStreamerCard(streamer, index))
          )}
        </div>

        <div className={styles.sectionDivider} />

        <div className={styles.nominationSection} ref={nominationSectionRef}>
          <h2 className={styles.nominationTitle}>
            Nominate a Streamer
          </h2>
          <p className={styles.nominationSubtitle}>
            Know an amazing streamer who should be part of our community? 
            Nominate them by submitting their Twitch channel URL below.
          </p>
          <form onSubmit={handleNomination} className={styles.nominationForm}>
            <input
              type="text"
              value={nominationUrl}
              onChange={(e) => setNominationUrl(e.target.value)}
              placeholder="Enter Twitch channel URL (e.g., https://twitch.tv/username)"
              className={styles.nominationInput}
              aria-label="Streamer URL"
            />
            <button
              type="submit"
              className={styles.nominationSubmit}
              aria-label={user ? "Submit nomination" : "Login to nominate"}
              onClick={(e) => {
                if (!user) {
                  e.preventDefault();
                  navigate('/signup');
                }
              }}
            >
              {user ? "Submit Nomination" : "Login or Signup to Nominate a Streamer"}
            </button>
            {nominationStatus && (
              <div 
                className={`${styles.nominationStatus} ${
                  nominationStatus.includes('Error') || nominationStatus.includes('already') 
                    ? styles.error 
                    : styles.success
                }`}
                role="alert"
              >
                {nominationStatus}
              </div>
            )}
          </form>
        </div>
      </>
    </div>
  );
};

export default Discover;