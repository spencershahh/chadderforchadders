import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import InsufficientGemsModal from '../components/InsufficientGemsModal';
import WatchAdButton from '../components/WatchAdButton';
import GemBalanceDisplay from '../components/GemBalanceDisplay';
import { useActivityTracker } from '../hooks/useActivityTracker';
import './StreamPage.css';
import './MobileStreamPage.css';


const StreamPage = () => {
  const { username } = useParams();
  console.log("StreamPage initializing with username:", username);
  
  const normalizedUsername = username ? username.toLowerCase() : '';
  console.log("Normalized username:", normalizedUsername);
  const [voteStats, setVoteStats] = useState({ today: 0, week: 0, allTime: 0 });
  const [gemBalance, setGemBalance] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [userIp, setUserIp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [showGemsModal, setShowGemsModal] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState({
    endTime: null,
    prizePool: 0
  });
  const [timeRemaining, setTimeRemaining] = useState('');
  const navigate = useNavigate();
  const STREAMER_PAYOUT_PERCENTAGE = 0.55; // Match the percentage from Leaderboard
  const [totalDonations, setTotalDonations] = useState(0);
  const [customAmount, setCustomAmount] = useState('');
  const [streamerInfo, setStreamerInfo] = useState({ bio: '', profileImageUrl: '' });
  const [topSupporters, setTopSupporters] = useState([]);
  const [isVotePaneCollapsed, setIsVotePaneCollapsed] = useState(true);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileVotePanel, setShowMobileVotePanel] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [isAuthError, setIsAuthError] = useState(false);
  const [isStatsRowCollapsed, setIsStatsRowCollapsed] = useState(false);

  // Activity tracking
  const { trackStreamWatch, trackChatMessage, trackVote } = useActivityTracker();
  const [hasTrackedView, setHasTrackedView] = useState(false);

  // Simplified debug logging
  useEffect(() => {
    console.log("Current component state:", {
      username,
      normalizedUsername,
      loading,
      gemBalance
    });
  }, [username, normalizedUsername, loading, gemBalance]);

  // Simplified logging
  useEffect(() => {
    console.log("StreamPage mounting", { username });
    
    // Add error boundary
    const originalError = console.error;
    console.error = function(message, ...args) {
      console.log("ERROR DETECTED:", message);
      originalError.apply(console, [message, ...args]);
    };
    
    return () => {
      console.log("StreamPage unmounting");
      console.error = originalError;
    };
  }, [username]);

  useEffect(() => {
    let mounted = true;
    let subscriptionSubscription = null;
    let votesSubscription = null;
    let cleanupTwitchEmbed = null;

    const initializePage = async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        // Force scroll to top before loading content
        window.scrollTo(0, 0);
        
        // Fetch essential data
        await Promise.all([
          fetchUserCredits(),
          fetchVoteStats(),
          getUserIP(),
          fetchLeaderboardData(),
          fetchTotalDonations(),
          fetchStreamerInfo(),
          fetchTopSupporters()
        ]);
        
        if (mounted) {
          // Store cleanup function from setupTwitchEmbed
          cleanupTwitchEmbed = setupTwitchEmbed();
          setupTwitchChatEmbed();
          setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing page:', error);
        if (mounted) {
          setLoading(false);
          setErrorMessage('Failed to load stream data. Please refresh the page.');
        }
      }
    };

    // Set up real-time subscriptions
    subscriptionSubscription = supabase
      .channel('subscriptions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_revenue'
        },
        () => {
          if (mounted) {
            fetchTotalDonations();
          }
        }
      )
      .subscribe();

    // Add real-time subscription for votes
    votesSubscription = supabase
      .channel('votes-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes',
          filter: `streamer=eq.${normalizedUsername}`
        },
        () => {
          if (mounted) {
            fetchTopSupporters();
            fetchVoteStats();
          }
        }
      )
      .subscribe();

    initializePage();

    // Cleanup subscriptions and state on unmount
    return () => {
      mounted = false;
      if (subscriptionSubscription) {
        supabase.removeChannel(subscriptionSubscription);
      }
      if (votesSubscription) {
        supabase.removeChannel(votesSubscription);
      }
      // Run cleanup function if available
      if (typeof cleanupTwitchEmbed === 'function') {
        cleanupTwitchEmbed();
      }
      // Clean up Twitch embed
      const embedContainer = document.getElementById("twitch-embed");
      if (embedContainer) {
        embedContainer.innerHTML = "";
      }
      // Clean up Twitch chat
      const chatContainer = document.getElementById("twitch-chat");
      if (chatContainer) {
        chatContainer.innerHTML = "";
      }
    };
  }, [normalizedUsername]);

  // Add scroll management effect
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    // Prevent default scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    return () => {
      // Reset scroll restoration behavior
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto';
      }
    };
  }, []);

  // Desktop vote container visibility effect
  useEffect(() => {
    // Update vote container position on window resize
    const handleResize = () => {
      const voteContainer = document.querySelector('.floating-vote-container');
      if (voteContainer) {
        // Ensure it's always in viewport by adjusting position if needed
        const viewportHeight = window.innerHeight;
        const containerHeight = voteContainer.offsetHeight;
        
        if (containerHeight > viewportHeight * 0.8) {
          // If container is too tall, ensure it has scrolling
          voteContainer.style.maxHeight = `${viewportHeight * 0.8}px`;
          voteContainer.style.overflowY = 'auto';
        }
      }
    };
    
    // Run once on mount and add listener for future resizes
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Add this effect to detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
    };
    
    // Check on mount
    checkMobile();
    
    // Add resize listener
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Add this effect to initialize the Twitch embeds after the DOM elements exist
  useEffect(() => {
    if (!loading && username) {
      // Small delay to ensure DOM elements are rendered
      const timer = setTimeout(() => {
        setupTwitchEmbed();
        setupTwitchChatEmbed();
        
        console.log("Initialized Twitch embeds");
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [loading, username, isMobile]);

  // Update the useEffect to call our removeTwitchChatInput function
  useEffect(() => {
    if (isMobile) {
      // Function to clean up duplicate inputs
      const cleanupInputs = () => {
        console.log("Cleaning up duplicate inputs");
        
        // Find any inputs that aren't our mobile-chat-input
        const extraInputs = document.querySelectorAll('input:not(.mobile-chat-input)');
        extraInputs.forEach(input => {
          if (input.getAttribute('placeholder')?.toLowerCase()?.includes('message') || 
              input.getAttribute('placeholder')?.toLowerCase()?.includes('chat')) {
            console.log("Found non-mobile chat input, hiding:", input);
            input.style.display = 'none';
            
            // Also hide parent elements that might contain the input
            let parent = input.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
              if (parent.classList.contains('chat-input') || 
                  parent.classList.contains('chat-input-container')) {
                parent.style.display = 'none';
              }
              parent = parent.parentElement;
            }
          }
        });
      };
      
      // Run cleanup multiple times to catch any delayed renders
      const timer1 = setTimeout(cleanupInputs, 1000);
      const timer2 = setTimeout(cleanupInputs, 2000);
      const timer3 = setTimeout(cleanupInputs, 5000);
      const timer4 = setTimeout(cleanupInputs, 10000);
      
      // Also run on window resize as this can trigger re-renders
      window.addEventListener('resize', cleanupInputs);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
        window.removeEventListener('resize', cleanupInputs);
      };
    }
  }, [isMobile]);

  // Track stream view
  useEffect(() => {
    if (normalizedUsername && !hasTrackedView) {
      // Don't track view until the stream is actually loaded and visible
      const timer = setTimeout(() => {
        trackStreamWatch(normalizedUsername, normalizedUsername);
        setHasTrackedView(true);
      }, 10000); // Track after 10 seconds to ensure actual engagement
      
      return () => clearTimeout(timer);
    }
  }, [normalizedUsername, hasTrackedView, trackStreamWatch]);

  const calculateDonationBomb = (votes) => {
    const WACP = 0.0725; // Fixed WACP value
    const totalCredits = votes.reduce((sum, vote) => sum + vote.vote_amount, 0);
    const voteDonations = totalCredits * WACP;
    return (voteDonations * 0.55).toFixed(2); // 55% of all revenue goes to prize pool
  };

  const fetchTotalDonations = async () => {
    try {
      const { data, error } = await supabase
        .rpc('calculate_weekly_donation_bomb');

      if (error) throw error;
      
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
    
    setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
  };

  // Add timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      updateTimeUntilReset();
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update setupTwitchEmbed to ensure controls are accessible
  const setupTwitchEmbed = () => {
    try {
      // Find appropriate container based on device
      const desktopEmbedContainer = document.querySelector("#twitch-embed");
      const mobileEmbedContainer = document.querySelector("#mobile-twitch-embed");
      
      // Use the appropriate container based on device
      const embedContainer = isMobile ? mobileEmbedContainer : desktopEmbedContainer;
      
      if (!embedContainer) {
        console.error("Embed container not found for device:", isMobile ? "mobile" : "desktop");
        return;
      }
      
      console.log("Setting up Twitch embed in container:", embedContainer);
      embedContainer.innerHTML = "";
      
      // Create Twitch embed iframe
      const iframe = document.createElement("iframe");
      iframe.src = `https://player.twitch.tv/?channel=${normalizedUsername}&parent=${window.location.hostname}`;
      iframe.width = "100%";
      iframe.height = "100%";
      iframe.allowFullscreen = true;
      iframe.style.display = "block";
      
      // Add specific mobile styling if on mobile
      if (isMobile) {
        iframe.style.height = '100%';
        iframe.style.width = '100%';
        iframe.style.minHeight = '200px';
        iframe.style.border = 'none';
        iframe.style.position = 'relative';
        iframe.style.zIndex = '5'; // Make sure controls are accessible
      }
      
      embedContainer.appendChild(iframe);
      
      // Return a cleanup function
      return () => {
        if (embedContainer) {
          embedContainer.innerHTML = "";
        }
      };
    } catch (error) {
      console.error("Error in setupTwitchEmbed:", error);
    }
  };

  // Update setupTwitchChatEmbed to ensure chat input is visible
  const setupTwitchChatEmbed = () => {
    try {
      // Clear any existing chat embed
      const desktopChatContainer = document.getElementById("twitch-chat");
      const mobileChatContainer = document.getElementById("mobile-twitch-chat");
      
      // Target the appropriate container based on device
      const chatContainer = isMobile ? mobileChatContainer : desktopChatContainer;
      
      if (!chatContainer) {
        console.error("Chat container not found for device:", isMobile ? "mobile" : "desktop");
        return;
      }
      
      console.log("Setting up Twitch chat in container:", chatContainer);
      chatContainer.innerHTML = "";
      
      // Create chat iframe - don't hide the input form
      const chatIframe = document.createElement("iframe");
      
      // Keep the Twitch chat input by NOT using the hideform parameter
      let iframeSrc = `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&parent=${window.location.hostname}`;
      
      chatIframe.src = iframeSrc;
      chatIframe.width = "100%";
      chatIframe.height = "100%"; 
      chatIframe.style.border = "none";
      chatIframe.allow = "fullscreen";
      
      // Add a class to target with CSS
      chatIframe.classList.add("chat-iframe");
      
      // Add specific mobile styling if on mobile
      if (isMobile) {
        chatIframe.style.height = '100%';
        chatIframe.style.width = '100%';
        chatIframe.style.border = 'none';
        chatIframe.style.overflow = 'visible';
        chatIframe.style.minHeight = '300px';
        chatIframe.style.padding = '0';
        chatIframe.style.margin = '0';
        chatIframe.style.zIndex = '10';
      }
      
      chatContainer.appendChild(chatIframe);

      // Add event listener to track chat messages
      // Note: This is a simple implementation. A more robust approach would require
      // integrating with Twitch API to track actual chat messages
      const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
          // If the user is actually typing in the chat
          if (document.activeElement && 
              document.activeElement.tagName === 'TEXTAREA' && 
              chatContainer.contains(document.activeElement)) {
            // Track chat message when the user sends one
            // We would ideally track this more accurately with Twitch API
            chatContainer.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                trackChatMessage(normalizedUsername);
              }
            });
          }
        }
      });
      
      observer.observe(chatContainer, { childList: true, subtree: true });
      
      return () => observer.disconnect();
    } catch (error) {
      console.error("Error in setupTwitchChatEmbed:", error);
    }
  };

  const fetchUserCredits = async () => {
    console.log("Fetching user credits");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.log("Auth error or no user:", authError);
        throw new Error("Please log in to continue.");
      }

      console.log("User authenticated, getting gem balance");
      const { data: userData, error: checkError } = await supabase
        .from("users")
        .select("gem_balance, subscription_tier, subscription_status")
        .eq("id", user.id)
        .single();

      if (checkError) {
        console.error("Error fetching user data:", checkError);
        throw checkError;
      }

      console.log("Setting gem balance:", userData.gem_balance || 0);
      setGemBalance(userData.gem_balance || 0);
    } catch (err) {
      console.error("Error in fetchUserCredits:", err.message);
      setErrorMessage(err.message);
    }
  };

  const fetchVoteStats = async () => {
    try {
      const { data, error } = await supabase
        .from("votes")
        .select("amount, created_at")
        .eq("streamer", normalizedUsername);

      if (error) throw error;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());

      let todayVotes = 0, weekVotes = 0, allTimeVotes = 0;

      data.forEach((vote) => {
        const voteDate = new Date(vote.created_at);
        allTimeVotes += vote.amount;
        if (voteDate >= startOfToday) todayVotes += vote.amount;
        if (voteDate >= startOfWeek) weekVotes += vote.amount;
      });

      setVoteStats({ today: todayVotes, week: weekVotes, allTime: allTimeVotes });
    } catch (err) {
      console.error("Error fetching vote stats:", err.message);
    }
  };

  const getUserIP = async () => {
    try {
      const res = await fetch("https://api64.ipify.org?format=json");
      const data = await res.json();
      setUserIp(data.ip);
    } catch (error) {
      console.error("Error fetching IP address:", error);
    }
  };

  const fetchLeaderboardData = async () => {
    try {
      const { data, error } = await supabase
        .from('leaderboard_settings')
        .select('*')
        .single();

      if (error) throw error;

      setLeaderboardData({
        endTime: data.end_time,
        prizePool: data.prize_pool
      });
    } catch (err) {
      console.error("Error fetching leaderboard data:", err.message);
    }
  };

  const fetchStreamerInfo = async () => {
    try {
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      // Use your backend API instead of direct Twitch calls
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/twitch/user?login=${normalizedUsername}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${localStorage.getItem('twitch_access_token')}`
        }
      });
      
      const data = await response.json();
      if (data.data && data.data[0]) {
        setStreamerInfo({
          bio: data.data[0].description,
          profileImageUrl: data.data[0].profile_image_url
        });
      }
    } catch (error) {
      console.error('Error fetching streamer info:', error);
    }
  };

  const fetchTopSupporters = async () => {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select(`
          amount,
          username
        `)
        .eq('streamer', normalizedUsername)
        .order('amount', { ascending: false });

      if (error) throw error;

      // Group votes by username and sum amounts
      const aggregatedVotes = data.reduce((acc, vote) => {
        const displayName = vote.username || 'Anonymous';
        acc[displayName] = (acc[displayName] || 0) + vote.amount;
        return acc;
      }, {});

      // Convert to array and sort
      const sortedSupporters = Object.entries(aggregatedVotes)
        .map(([username, amount]) => ({ username, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      setTopSupporters(sortedSupporters);
    } catch (err) {
      console.error("Error fetching top supporters:", err.message);
    }
  };

  const handleVote = async () => {
    setIsVoting(true);
    setIsAuthError(false);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setIsAuthError(true);
        setIsVoting(false);
        throw new Error("Please log in to continue.");
      }

      // Check if user has enough gems
      if (gemBalance < selectedAmount) {
        setShowGemsModal(true);
        setIsVoting(false);
        throw new Error("Insufficient gems");
      }

      // Get user's display name
      const { data: userData } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const displayName = userData?.display_name || 'Anonymous';

      // Create the vote
      const { error: voteError } = await supabase
        .from("votes")
        .insert([
          {
            user_id: user.id,
            streamer: normalizedUsername,
            amount: selectedAmount,
            vote_type: 'regular',
            vote_status: 'success',
            vote_ip: userIp,
            username: displayName,
            created_at: new Date().toISOString()
          },
        ]);

      if (voteError) throw voteError;

      // Update user's gems
      const { error: updateError } = await supabase
        .from("users")
        .update({
          gem_balance: gemBalance - selectedAmount
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Update local state
      setGemBalance(gemBalance - selectedAmount);
      
      await fetchVoteStats();
      setErrorMessage("");

      // After successful vote
      setVoteSuccess(true);
      
      // Reset custom amount
      setCustomAmount('');
      
      // Reset vote success message after a delay
      setTimeout(() => setVoteSuccess(false), 2000);
      
      // On successful vote, track the activity
      trackVote(normalizedUsername, selectedAmount);
      
      return true; // Return successful result
    } catch (err) {
      setErrorMessage(err.message);
      console.error("Vote error:", err);
      throw err; // Re-throw the error for the calling function to handle
    } finally {
      setIsVoting(false);
    }
  };

  const handlePurchaseGems = () => {
    setShowGemsModal(false);
    navigate('/credits');
  };

  const handleCustomAmountChange = (e) => {
    const value = e.target.value;
    // Only allow positive integers
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) > 0)) {
      setCustomAmount(value);
      if (value !== '') {
        setSelectedAmount(parseInt(value));
      }
    }
  };

  // Function to refresh user credits after watching an ad
  const refreshUserCredits = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please log in to continue.");

      const { data: userData, error: checkError } = await supabase
        .from("users")
        .select("gem_balance, subscription_tier, subscription_status")
        .eq("id", user.id)
        .single();

      if (checkError) throw checkError;

      setGemBalance(userData.gem_balance || 0);
    } catch (err) {
      console.error("Error refreshing gem balance:", err.message);
    }
  };

  // Toggle mobile vote panel
  const toggleMobileVotePanel = () => {
    setShowMobileVotePanel(!showMobileVotePanel);
  };

  // Desktop vote function
  const handleSendVote = (e) => {
    if (e) e.preventDefault();
    
    const amount = parseInt(customAmount) || selectedAmount;
    if (!amount) {
      setErrorMessage("Please select an amount");
      return;
    }
    
    // Process the vote
    handleVote()
      .then(() => {
        // Show success state
        setCustomAmount('');
      })
      .catch(error => {
        console.error("Error sending vote:", error);
        setErrorMessage(error.message || "Failed to send vote");
      });
  };

  // Desktop vote panel toggle
  const toggleDesktopVotePanel = (e) => {
    e.stopPropagation();
    setIsVotePaneCollapsed(!isVotePaneCollapsed);
  };

  // Simplified initialization
  useEffect(() => {
    // Debug logging
    console.log("StreamPage mounted");
    console.log("Username:", username);
    
    // Initialize
    try {
      // Set loading state
      setLoading(false);
    } catch (error) {
      console.error("Error initializing StreamPage:", error);
      setError("Failed to initialize stream page");
      setLoading(false);
    }
  }, [username]);

  const handleSignIn = () => {
    // Save current page to redirect back after login
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
    navigate('/login');
  };

  const toggleStatsRow = () => {
    setIsStatsRowCollapsed(!isStatsRowCollapsed);
  };

  // Render component
  try {
    // Show loading state
    if (loading) {
      return (
        <div className="stream-page loading-container">
          <div className="loading-message">Loading stream...</div>
        </div>
      );
    }
    
    // Show error state
    if (error || !username) {
      return (
        <div className="stream-page error-container">
          <div className="error-message">
            {error || "Unable to load stream. Username is required."}
          </div>
          <button 
            className="retry-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      );
    }
    
    // Main render
    return (
      <div className={`stream-page ${isMobile ? 'mobile-mode' : ''}`}>
        {isMobile ? (
          <div className="mobile-stream-layout">
            {/* Video section at top */}
            <div className="mobile-video-container" id="mobile-twitch-embed"></div>
            
            {/* Button container */}
            <div className="mobile-buttons-container">
              <button 
                className="mobile-chat-button" 
                onClick={() => {
                  setShowMobileVotePanel(false);
                  document.querySelector('.mobile-panel-container.chat-panel')?.classList.toggle('visible');
                  document.querySelector('.mobile-panel-container.stats-panel')?.classList.remove('visible');
                }}
              >
                <span className="mobile-button-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
                  </svg>
                </span>
                Chat
              </button>
              <button 
                className="mobile-stats-button"
                onClick={() => {
                  setShowMobileVotePanel(false);
                  document.querySelector('.mobile-panel-container.stats-panel')?.classList.toggle('visible');
                  document.querySelector('.mobile-panel-container.chat-panel')?.classList.remove('visible');
                }}
              >
                <span className="mobile-button-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM9 17H7V10H9V17ZM13 17H11V7H13V17ZM17 17H15V13H17V17Z" fill="white"/>
                  </svg>
                </span>
                Stats
              </button>
            </div>
            
            {/* Chat Panel */}
            <div className="mobile-panel-container chat-panel">
              <div className="mobile-panel-close-container">
                <button 
                  className="mobile-panel-close"
                  onClick={() => document.querySelector('.mobile-panel-container.chat-panel')?.classList.remove('visible')}
                >
                  ✕
                </button>
              </div>
              <div className="mobile-chat-panel" id="mobile-twitch-chat">
                {/* Twitch chat will be embedded here */}
              </div>
            </div>
            
            {/* Stats Panel */}
            <div className="mobile-panel-container stats-panel">
              <div className="mobile-panel-header">
                <h3 className="mobile-panel-title">STREAM STATS</h3>
                <button 
                  className="mobile-panel-close"
                  onClick={() => document.querySelector('.mobile-panel-container.stats-panel')?.classList.remove('visible')}
                >
                  ✕
                </button>
              </div>
              <div className="mobile-stats-panel">
                {/* Time Remaining */}
                <div className="mobile-stats-item">
                  <div className="mobile-stats-label">Time Remaining</div>
                  <div className="mobile-stats-value time">{timeRemaining || '0d 0h 0m 0s'}</div>
                </div>
                
                {/* Prize Pool */}
                <div className="mobile-stats-item">
                  <div className="mobile-stats-label">Prize Pool</div>
                  <div className="mobile-stats-value prize">${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                
                {/* Vote Stats */}
                <div className="mobile-stats-item">
                  <div className="mobile-stats-label">Weekly Votes</div>
                  <div className="mobile-stats-value">{voteStats.week}</div>
                </div>
                
                {/* Top Supporters */}
                {topSupporters.length > 0 && (
                  <div className="mobile-stats-item">
                    <div className="mobile-stats-label">Top Supporters</div>
                    <div className="mobile-supporters-list">
                      {topSupporters.slice(0, 3).map((supporter, index) => (
                        <div 
                          key={`${supporter.username}-${supporter.amount}-${index}`} 
                          className="mobile-supporter-item"
                        >
                          <span className="mobile-supporter-rank">#{index + 1}</span>
                          <span className="mobile-supporter-name">{supporter.username}</span>
                          <span className="mobile-supporter-amount">{supporter.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Vote Button */}
                <button 
                  className="mobile-vote-button"
                  onClick={() => setShowVoteModal(true)}
                >
                  VOTE NOW
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Desktop layout
          <>
            <h2 className="stream-title">Watching {username}'s Stream</h2>
            
            <div className="stream-layout">
              <div className="stream-video-container">
                <div id="twitch-embed"></div>
              </div>

              <div className="stream-right-container">
                <div className="stream-chat-container" id="twitch-chat">
                  {/* Chat iframe will be injected here */}
                </div>
              </div>
            </div>
            
            {/* Central Vote Button */}
            <div className="central-vote-button">
              <button onClick={() => setShowVoteModal(true)}>
                VOTE
              </button>
            </div>

            {/* Dashboard Layout - will only render on page load if there's data */}
            {!loading && (
              <div className="dashboard-layout">
                {/* Bio Card */}
                <div className="dashboard-card bio-card">
                  <h3>About {username}</h3>
                  {streamerInfo.profileImageUrl && (
                    <div className="bio-header">
                      <img 
                        src={streamerInfo.profileImageUrl} 
                        alt={`${username}'s profile`} 
                        className="bio-profile-image"
                      />
                    </div>
                  )}
                  <p className="bio-text">
                    {streamerInfo.bio || "This streamer hasn't added a bio yet."}
                  </p>
                </div>

                {/* Top Supporters Card */}
                <div className="dashboard-card supporters-card">
                  <h3>Top Supporters</h3>
                  <div className="supporters-list">
                    {topSupporters.length > 0 ? (
                      topSupporters.map((supporter, index) => (
                        <div 
                          key={`${supporter.username}-${supporter.amount}-${index}`} 
                          className="supporter-item"
                        >
                          <span className="rank">#{index + 1}</span>
                          <span className="username">{supporter.username}</span>
                          <span className="amount">{supporter.amount}</span>
                        </div>
                      ))
                    ) : (
                      <div className="supporter-item empty-state">
                        <span className="empty-message">Be the first to support!</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vote Stats Container */}
                <div className="stats-container">
                  <div className="stat-box">
                    <p>Votes Today</p>
                    <h4>{voteStats.today}</h4>
                  </div>
                  <div className="stat-box">
                    <p>Votes This Week</p>
                    <h4>{voteStats.week}</h4>
                  </div>
                  <div className="stat-box">
                    <p>All Time Votes</p>
                    <h4>{voteStats.allTime}</h4>
                  </div>
                </div>

                {/* Competition Information Card */}
                <div className="dashboard-card competition-card">
                  <h3>Current Competition</h3>
                  <div className="competition-stats">
                    <div className="competition-stat-item">
                      <p>Time Remaining</p>
                      <h4>{timeRemaining || 'Loading...'}</h4>
                    </div>
                    <div className="competition-stat-item">
                      <p>Prize Pool</p>
                      <h4>${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
            
        {/* Vote Modal - shared between mobile and desktop */}
        {showVoteModal && (
          <div className="vote-modal-overlay" onClick={() => setShowVoteModal(false)}>
            <div className="vote-modal" onClick={(e) => e.stopPropagation()}>
              <div className="vote-modal-header">
                <h3 className="vote-modal-title">Vote for {username}</h3>
                <button 
                  className="vote-modal-close"
                  onClick={() => setShowVoteModal(false)}
                  aria-label="Close vote modal"
                >
                  ✕
                </button>
              </div>
              
              <div className="vote-modal-body">
                {isAuthError ? (
                  <div className="auth-error-container">
                    <p className="auth-error-message">Please sign in to vote</p>
                    <button 
                      className="sign-in-btn"
                      onClick={handleSignIn}
                    >
                      Sign In
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="vote-amount-grid">
                      {[5, 10, 25, 50, 100].map((amount) => (
                        <button
                          key={amount}
                          className={`vote-amount-btn ${selectedAmount === amount ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedAmount(amount);
                            setCustomAmount('');
                          }}
                        >
                          {amount} 💎
                        </button>
                      ))}
                    </div>
                    
                    <div className="custom-amount-input-wrapper">
                      <input
                        type="text"
                        value={customAmount}
                        onChange={handleCustomAmountChange}
                        placeholder="Custom amount"
                        className="custom-amount-input"
                      />
                      <span className="custom-amount-input-icon">💎</span>
                    </div>
                    
                    {errorMessage && errorMessage !== "Please log in to continue." && (
                      <div className="error-message">{errorMessage}</div>
                    )}
                    
                    <button 
                      className={`vote-submit-btn ${voteSuccess ? 'success' : ''}`}
                      onClick={handleSendVote} 
                      disabled={isVoting || !selectedAmount}
                    >
                      {isVoting ? 'Processing...' : voteSuccess ? 'Vote Successful!' : `Vote with ${selectedAmount || 0} 💎`}
                    </button>
                  </>
                )}
              </div>
              
              <div className="vote-modal-footer">
                <div className="credit-display">
                  Available Gems: {gemBalance} 💎
                </div>
                <WatchAdButton onGemsEarned={refreshUserCredits} />
              </div>
            </div>
          </div>
        )}

        <InsufficientGemsModal
          isOpen={showGemsModal}
          onClose={() => setShowGemsModal(false)}
          requiredAmount={selectedAmount}
          currentCredits={gemBalance}
          onPurchase={handlePurchaseGems}
        />
      </div>
    );
  } catch (renderError) {
    console.error("Error rendering StreamPage:", renderError);
    return (
      <div className="stream-page error-container">
        <div className="error-message">
          An unexpected error occurred while rendering the page. Please try again.
          {renderError && renderError.message ? 
            <div className="error-details">
              Error: {renderError.message}
            </div> : null
          }
        </div>
        <button 
          className="retry-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }
};

export default StreamPage;