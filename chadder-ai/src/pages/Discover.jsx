import { useEffect, useState, useRef } from "react";
import { fetchStreamers, createErrorState } from "../api/twitch";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import styles from './Discover.module.css';
import { FaLock } from 'react-icons/fa';

// Debug component - only shows in development
const DebugInfo = ({ isLoading, loadError, streamers, onRetry }) => {
  const isDev = import.meta.env.MODE === 'development';
  const [expanded, setExpanded] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);
  
  // Function to test various endpoints to diagnose issues
  const testConnections = async () => {
    setTesting(true);
    const results = {
      tests: [],
      summary: ''
    };
    
    try {
      // Helper to run a test
      const runTest = async (name, url, options = {}) => {
        const startTime = Date.now();
        try {
          const response = await fetch(url, {
            method: options.method || 'GET',
            mode: options.mode || 'cors',
            headers: options.headers || {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            ...options
          });
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          let responseData;
          try {
            responseData = await response.json();
          } catch (e) {
            responseData = 'Could not parse JSON response';
          }
          
          return {
            name,
            url,
            success: response.ok,
            status: response.status,
            duration: `${duration}ms`,
            data: typeof responseData === 'object' ? 'Valid JSON response' : responseData
          };
        } catch (error) {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          return {
            name,
            url,
            success: false,
            error: error.message,
            duration: `${duration}ms`
          };
        }
      };
      
      // Test 1: Browser CORS test - should always work
      results.tests.push(await runTest(
        'CORS Test',
        'https://cors-test.codehappy.dev/cors.json'
      ));
      
      // Test 2: Supabase API
      const supabaseUrl = 'https://xskplljphfqqvhdwluzm.supabase.co/rest/v1/streamers?select=username&limit=1';
      results.tests.push(await runTest(
        'Supabase API',
        supabaseUrl,
        { 
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhza3BsbGpwaGZxcXZoZHdsdXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDU4MTI0MTAsImV4cCI6MjAyMTM4ODQxMH0.bZvTe7JB3UFDCyV8VeEpdnTYD0RBbJn2mOp10j2nMBU',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhza3BsbGpwaGZxcXZoZHdsdXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDU4MTI0MTAsImV4cCI6MjAyMTM4ODQxMH0.bZvTe7JB3UFDCyV8VeEpdnTYD0RBbJn2mOp10j2nMBU'
          }
        }
      ));
      
      // Test 3: API URL if configured
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        results.tests.push(await runTest(
          'API Health Check',
          `${apiUrl}/api/health`
        ));
        
        // Test 4: Twitch API via our backend
        results.tests.push(await runTest(
          'Twitch API via Backend',
          `${apiUrl}/api/twitch/streamers?logins=fuslie,ludwig,pokimane`
        ));
      } else {
        results.tests.push({
          name: 'API Health Check',
          success: false,
          error: 'API URL not configured',
        });
        
        results.tests.push({
          name: 'Twitch API via Backend',
          success: false,
          error: 'API URL not configured',
        });
      }
      
      // Analyze results
      const successCount = results.tests.filter(t => t.success).length;
      const totalTests = results.tests.length;
      results.summary = `${successCount}/${totalTests} tests passed`;
      
      if (successCount === totalTests) {
        results.health = 'good';
      } else if (successCount >= totalTests / 2) {
        results.health = 'partial';
      } else {
        results.health = 'bad';
      }
      
      setTestResults(results);
    } catch (error) {
      console.error('Error running connection tests:', error);
      setTestResults({
        tests: [],
        summary: 'Error running tests',
        health: 'unknown',
        error: error.message
      });
    } finally {
      setTesting(false);
    }
  };
  
  if (!isDev) return null;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: '#222',
      border: '1px solid #666',
      padding: '8px',
      borderRadius: '4px',
      zIndex: 1000,
      maxWidth: '400px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>Debug Info</strong>
        <button 
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {expanded && (
        <div>
          <div>Mode: {import.meta.env.MODE}</div>
          <div>API URL: {import.meta.env.VITE_API_URL || 'Not set'}</div>
          <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
          <div>Error: {loadError || 'None'}</div>
          <div>Streamers: {streamers.length}</div>
          <div>UA: {navigator.userAgent.substring(0, 50)}...</div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button 
              onClick={onRetry}
              style={{ 
                background: '#8a6aff', 
                color: 'white', 
                border: 'none', 
                padding: '4px 8px', 
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                flex: 1
              }}
            >
              Retry Connection
            </button>
            
            <button 
              onClick={testConnections}
              disabled={testing}
              style={{ 
                background: '#4caf50', 
                color: 'white', 
                border: 'none', 
                padding: '4px 8px', 
                borderRadius: '4px',
                cursor: testing ? 'default' : 'pointer',
                opacity: testing ? 0.7 : 1,
                fontSize: '11px',
                flex: 1
              }}
            >
              {testing ? 'Testing...' : 'Test Network'}
            </button>
          </div>
          
          {testResults && (
            <div style={{ 
              marginTop: '12px', 
              border: '1px solid #444', 
              padding: '8px',
              borderRadius: '4px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              <div style={{ 
                color: 
                  testResults.health === 'good' ? '#4caf50' : 
                  testResults.health === 'partial' ? '#ff9800' : 
                  testResults.health === 'bad' ? '#f44336' : '#aaa',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}>
                {testResults.summary}
              </div>
              
              {testResults.tests.map((test, index) => (
                <div key={index} style={{ 
                  marginBottom: '8px',
                  padding: '6px',
                  background: '#333',
                  borderRadius: '4px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}>
                    <span>{test.name}</span>
                    <span style={{ 
                      color: test.success ? '#4caf50' : '#f44336',
                      fontWeight: 'bold'
                    }}>
                      {test.success ? '✓ Success' : '✗ Failed'}
                    </span>
                  </div>
                  
                  {test.url && (
                    <div style={{ fontSize: '10px', wordBreak: 'break-all' }}>
                      URL: {test.url}
                    </div>
                  )}
                  
                  {test.status && (
                    <div style={{ fontSize: '10px' }}>
                      Status: {test.status}
                    </div>
                  )}
                  
                  {test.duration && (
                    <div style={{ fontSize: '10px' }}>
                      Time: {test.duration}
                    </div>
                  )}
                  
                  {test.error && (
                    <div style={{ 
                      fontSize: '10px', 
                      color: '#f44336', 
                      marginTop: '4px'
                    }}>
                      Error: {test.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Discover = () => {
  const [user, setUser] = useState(null);
  const [streamers, setStreamers] = useState([]);
  const [streamerVotes, setStreamerVotes] = useState({});
  const [userBalance, setUserBalance] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [totalDonations, setTotalDonations] = useState(0);
  const [timeUntilPayout, setTimeUntilPayout] = useState('');
  const [nominationUrl, setNominationUrl] = useState('');
  const [nominationStatus, setNominationStatus] = useState('');
  const [trendingStreamers, setTrendingStreamers] = useState([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(null);
  const navigate = useNavigate();
  const nominationSectionRef = useRef(null);
  const streamersGridRef = useRef(null);
  const trendingRefreshInterval = useRef(null);

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

  const [sortOption, setSortOption] = useState(getUserPreferences().sortOption);
  const [streamersFilter, setStreamersFilter] = useState(getUserPreferences().streamersFilter);

  const OFFLINE_THUMBNAIL = "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg";
  const DEFAULT_PROFILE_IMAGE = "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";

  // Add loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadStreamers = async () => {
    try {
      console.log('Starting to load streamers...');
      setIsLoading(true);
      setLoadError(null);
      
      // Check if the API server is reachable before making the full request
      if (import.meta.env.VITE_API_URL) {
        try {
          console.log('Testing API connectivity...');
          const testResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/health`, { 
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
              'Content-Type': 'application/json',
            }
          }).catch(e => {
            console.error('API connectivity test failed:', e);
            return { ok: false, status: 0 };
          });
          
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
      
      const streamersData = await fetchStreamers();
      console.log('Loaded streamers from API:', streamersData);
      
      // Check if the result is an error object
      if (streamersData && streamersData.error) {
        console.error('Error loading streamers:', streamersData.message);
        setLoadError(streamersData.message || 'Failed to load live streamer data. Please try refreshing the page.');
        setStreamers([]);
      } else if (streamersData && streamersData.length > 0) {
        console.log('Successfully fetched live data from API:', streamersData.length, 'streamers');
        setStreamers(streamersData);
        setLoadError(null);
      } else {
        console.warn('No streamers returned from API');
        setLoadError('No streamers found. Please try refreshing the page.');
        setStreamers([]);
      }
    } catch (error) {
      console.error('Error in loadStreamers function:', error);
      setLoadError('Failed to load live streamer data. Please try refreshing the page.');
      setStreamers([]);
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

  // Add tawk.to chat widget
  useEffect(() => {
    // Add tawk.to chat widget
    var Tawk_API = window.Tawk_API || {};
    var Tawk_LoadStart = new Date();
    
    const addTawkToScript = () => {
      const s1 = document.createElement("script");
      const s0 = document.getElementsByTagName("script")[0];
      s1.async = true;
      s1.src = 'https://embed.tawk.to/67eb74ded67fa61906209197/1inns11js';
      s1.charset = 'UTF-8';
      s1.setAttribute('crossorigin', '*');
      s0.parentNode.insertBefore(s1, s0);
      
      return s1; // Return the script element for cleanup
    };
    
    const tawkScript = addTawkToScript();
    
    // Clean up the script when component unmounts
    return () => {
      if (tawkScript && tawkScript.parentNode) {
        tawkScript.parentNode.removeChild(tawkScript);
      }
      // Try to clean up any tawk.to related elements
      const tawkElements = document.querySelectorAll('[id^="tawk-"]');
      tawkElements.forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    };
  }, []);

  const fetchVotes = async () => {
    try {
      // Get the start of the current week (Sunday)
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Go back to the most recent Sunday
      startOfWeek.setHours(0, 0, 0, 0); // Set to beginning of day
      
      // Query votes with filter for current week only
      const { data: votes, error } = await supabase
        .from("votes")
        .select("streamer, amount, created_at")
        .gte('created_at', startOfWeek.toISOString());

      if (error) throw error;

      // Convert votes to a map of streamer -> total votes for current week
      const votesMap = votes.reduce((acc, vote) => {
        acc[vote.streamer] = (acc[vote.streamer] || 0) + vote.amount;
        return acc;
      }, {});
      
      console.log('Weekly votes from:', startOfWeek.toISOString(), 'Map:', votesMap);
      setStreamerVotes(votesMap);
      return votesMap;
    } catch (error) {
      console.error("Error fetching votes:", error);
      return {};
    }
  };

  // New function to fetch trending streamers based on votes
  const fetchTrendingStreamers = async () => {
    try {
      setIsTrendingLoading(true);
      setTrendingError(null);
      
      // Fetch votes to get the top voted streamers for the current week
      // This ensures the "Community Favorites" section matches the leaderboard's "This Week" column
      // IMPORTANT: The top streamer is determined solely by weekly vote count to ensure
      // consistency across all parts of the app (leaderboard, featured sections, etc.)
      const votesMap = await fetchVotes();
      
      // Convert votes map to an array and sort by vote count
      const sortedStreamers = Object.entries(votesMap)
        .map(([streamer, votes]) => ({ streamer, votes }))
        .filter(item => item.votes > 0) // Only include streamers with votes
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 10); // Get top 10
      
      console.log('Top weekly streamers by votes (sorted):', JSON.stringify(sortedStreamers, null, 2));
      
      if (sortedStreamers.length === 0) {
        console.log('No trending streamers found');
        setTrendingStreamers([]);
        setIsTrendingLoading(false);
        return;
      }
      
      // Get the streamer usernames
      const streamerUsernames = sortedStreamers.map(s => s.streamer);
      
      // Fetch the streamer details
      const { data: streamerDetails, error } = await supabase
        .from('streamers')
        .select('*')
        .in('username', streamerUsernames);
      
      if (error) {
        console.error('Error fetching trending streamer details:', error);
        setTrendingError('Failed to load trending streamers');
        setIsTrendingLoading(false);
        return;
      }
      
      if (!streamerDetails || streamerDetails.length === 0) {
        console.log('No trending streamer details found');
        setTrendingStreamers([]);
        setIsTrendingLoading(false);
        return;
      }

      // Find the top voted streamer
      const topVotedStreamerUsername = sortedStreamers[0]?.streamer;
      
      // Try to enrich the streamer data with Twitch API data
      try {
        // Fetch enriched data from API if available
        const enrichedStreamerData = await fetchStreamers(streamerUsernames.join(','));
        console.log('Enriched streamer data from API:', enrichedStreamerData);
        
        // Create a map of username to enriched data for easy lookup
        const enrichedDataMap = {};
        if (Array.isArray(enrichedStreamerData)) {
          enrichedStreamerData.forEach(streamer => {
            const username = streamer.user_login?.toLowerCase();
            if (username) {
              enrichedDataMap[username] = streamer;
            }
          });
        }
        
        // Map votes to streamer details and normalize the data
        const trendingStreamersWithVotes = streamerDetails.map(streamer => {
          const votes = votesMap[streamer.username] || 0;
          const username = streamer.username?.toLowerCase();
          const enrichedData = username ? enrichedDataMap[username] : null;
          
          // Use enriched data if available, otherwise fallback to database data
          const profileImageUrl = enrichedData?.profile_image_url || streamer.profile_image_url;
          
          // Normalize data structure to match what renderStreamerCard expects
          return {
            ...streamer,
            ...enrichedData, // Merge in any enriched data available
            votes,
            user_name: streamer.display_name || streamer.username,
            user_login: streamer.username,
            display_name: streamer.display_name || streamer.username,
            profile_image_url: profileImageUrl
          };
        }).sort((a, b) => b.votes - a.votes); // Sort by votes so highest votes is first
        
        console.log('Trending streamers with votes (sorted):', 
          trendingStreamersWithVotes.map(s => ({ 
            username: s.username, 
            votes: s.votes 
          }))
        );
        
        setTrendingStreamers(trendingStreamersWithVotes);
      } catch (enrichError) {
        console.error('Error enriching streamer data:', enrichError);
        
        // Fallback to just using the database data without enrichment
        const trendingStreamersWithVotes = streamerDetails.map(streamer => {
          const votes = votesMap[streamer.username] || 0;
          return {
            ...streamer,
            votes,
            user_name: streamer.display_name || streamer.username,
            user_login: streamer.username,
            display_name: streamer.display_name || streamer.username
          };
        }).sort((a, b) => b.votes - a.votes);
        
        setTrendingStreamers(trendingStreamersWithVotes);
      }
      
      setIsTrendingLoading(false);
    } catch (error) {
      console.error('Error fetching trending streamers:', error);
      setTrendingError('Failed to load trending streamers');
      setIsTrendingLoading(false);
    }
  };

  // Load streamers and trending streamers on initial mount
  useEffect(() => {
    loadStreamers();
    // Force an immediate refresh of trending streamers to ensure we have the latest data
    console.log('Initial trending streamers fetch');
    fetchTrendingStreamers();
    
    // Set up a refresh interval for trending streamers (every 30 seconds instead of 2 minutes)
    trendingRefreshInterval.current = setInterval(() => {
      console.log('Interval-based trending streamers refresh');
      fetchTrendingStreamers();
    }, 30 * 1000); // Reduced from 2 minutes to 30 seconds for more frequent updates
    
    return () => {
      if (trendingRefreshInterval.current) {
        clearInterval(trendingRefreshInterval.current);
      }
    };
  }, []);
  
  // Listen for votes table changes to update trending
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
          fetchTrendingStreamers();
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
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamer.game_name?.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    // Apply online/offline filter
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

  // New component to render trending streamers section
  const renderTrendingStreamers = () => {
    if (isTrendingLoading && trendingStreamers.length === 0) {
      return (
        <div className={styles.trendingSection}>
          <h2 className={styles.trendingSectionTitle}>Community Favorites</h2>
          <p className={styles.trendingSectionSubtitle}>Loading top voted streamers...</p>
          <div className={styles.trendingLoading}>
            <div className={styles.spinner}></div>
          </div>
        </div>
      );
    }
    
    if (trendingError) {
      return (
        <div className={styles.trendingSection}>
          <h2 className={styles.trendingSectionTitle}>Community Favorites</h2>
          <p className={styles.trendingSectionSubtitle}>
            There was an error loading trending streamers
          </p>
          <button 
            className={styles.retryButton}
            onClick={fetchTrendingStreamers}
          >
            Try Again
          </button>
        </div>
      );
    }
    
    if (trendingStreamers.length === 0) {
      return (
        <div className={styles.trendingSection}>
          <h2 className={styles.trendingSectionTitle}>Community Favorites</h2>
          <p className={styles.trendingSectionSubtitle}>
            No trending streamers yet. Check out our Dig Deeper page to discover and vote for small streamers!
          </p>
          <div className={styles.trendingEmpty}>
            <a href="/dig-deeper" className={styles.digDeeperLink}>
              Try Dig Deeper
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.trendingSection}>
        <h2 className={styles.trendingSectionTitle}>Community Favorites</h2>
        <p className={styles.trendingSectionSubtitle}>Top voted streamers from our community this week</p>
        <div className={styles.trendingStreamerGrid}>
          {trendingStreamers.map((streamer, index) => renderStreamerCard(streamer, index, true))}
        </div>
      </div>
    );
  };

  // Modify renderStreamerCard to handle trending streamers
  const renderStreamerCard = (streamer, index, isTrending = false) => {
    // Early return if streamer data is invalid
    if (!streamer) {
      console.error('Invalid streamer data:', streamer);
      return null;
    }
    
    // Handle different data structures between trending and regular streamers
    const userName = streamer.user_name || streamer.display_name || streamer.username || streamer.name;
    const userLogin = streamer.user_login || streamer.username || streamer.login || '';
    const userId = streamer.user_id || streamer.id || `streamer-${index}`;
    
    // Skip rendering if we don't have at least a name
    if (!userName) {
      console.error('Invalid streamer data (missing name):', streamer);
      return null;
    }
    
    // Only lock cards if user is not logged in AND index is beyond the free limit AND it's not a trending card
    const isLocked = !user && index >= FREE_STREAMER_LIMIT && !isTrending;
    const votes = isTrending ? streamer.votes : (streamerVotes[userLogin] || 0);

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

    return (
      <div 
        key={userId}
        className={`${styles.streamerCard} ${isLocked ? styles.lockedCard : ''} ${isTrending ? styles.trendingCard : ''}`}
        onClick={() => isLocked ? handleAuthPrompt() : handleCardClick(userLogin || userName)}
      >
        <div className={styles.thumbnailWrapper}>
          <img
            className={styles.streamerThumbnail}
            src={getThumbnail()}
            alt={`${userName}'s stream`}
            onError={(e) => {
              console.log(`