import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import InsufficientGemsModal from '../components/InsufficientGemsModal';
import WatchAdButton from '../components/WatchAdButton';
import GemBalanceDisplay from '../components/GemBalanceDisplay';
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
      
      embedContainer.appendChild(iframe);
    } catch (error) {
      console.error("Error in setupTwitchEmbed:", error);
    }
  };

  // Update setupTwitchChatEmbed to ensure it works with our new layout
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
      
      chatContainer.appendChild(chatIframe);
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
            
            {/* Chat section with header */}
            <div className="mobile-chat-header">
              <span>STREAM CHAT</span>
              <span className="chat-user-count">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4C10.4178 4 8.87103 4.46919 7.55544 5.34824C6.23985 6.22729 5.21447 7.47672 4.60897 8.93853C4.00347 10.4003 3.84504 12.0089 4.15372 13.5607C4.4624 15.1126 5.22433 16.538 6.34315 17.6569C7.46197 18.7757 8.88743 19.5376 10.4393 19.8463C11.9911 20.155 13.5997 19.9965 15.0615 19.391C16.5233 18.7855 17.7727 17.7602 18.6518 16.4446C19.5308 15.129 20 13.5823 20 12C20 9.87827 19.1571 7.84344 17.6569 6.34315C16.1566 4.84285 14.1217 4 12 4Z" fill="white"/>
                </svg>
              </span>
            </div>
            
            {/* Top supporters section */}
            <div className="mobile-supporters">
              <div className="mobile-supporters-scroll">
                <button className="mobile-scroll-button left">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 18L9 12L15 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                
                <div className="mobile-supporters-list">
                  {topSupporters.slice(0, 3).map((supporter, index) => (
                    <div key={index} className="mobile-supporter">
                      <div className="supporter-icon">
                        {index === 0 && <span className="supporter-rank">1</span>}
                        {index === 0 ? 
                          <span className="gift-icon">🎁</span> : 
                          <span className="gift-icon">{index === 1 ? "🎁" : "🎁"}</span>
                        }
                      </div>
                      <div className="supporter-name">{supporter.username}</div>
                      <div className="supporter-gems">
                        <span className="gem-icon">💎</span> {index === 0 ? "5" : (index === 1 ? "2" : "1")}
                      </div>
                    </div>
                  ))}
                </div>
                
                <button className="mobile-scroll-button right">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 6L15 12L9 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Real Twitch chat with full height */}
            <div className="mobile-chat-container">
              <div className="mobile-chat-messages" id="mobile-twitch-chat">
                {/* Twitch chat will be embedded here */}
              </div>
            </div>
            
            {/* Fixed bottom elements */}
            <div className="mobile-stats-row">
              <div className="mobile-time-display">
                <span className="mobile-time-label">Time Remaining</span>
                <span className="mobile-time-value">{timeRemaining || '0d 0h 0m 0s'}</span>
              </div>
              <div className="mobile-prize-display">
                <span className="mobile-prize-label">Prize Pool</span>
                <span className="mobile-prize-value">${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
            
            {/* Vote button */}
            <button 
              className="vote-button"
              onClick={() => setShowVoteModal(true)}
            >
              VOTE
            </button>
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