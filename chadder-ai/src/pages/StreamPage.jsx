import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import InsufficientGemsModal from '../components/InsufficientGemsModal';
import WatchAdButton from '../components/WatchAdButton';
import GemBalanceDisplay from '../components/GemBalanceDisplay';
import './StreamPage.css';


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
  const [mobileMessage, setMobileMessage] = useState('');

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

  // Add this effect after other useEffects to detect mobile devices
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
      const embedContainer = document.getElementById("twitch-embed");
      if (!embedContainer) return;
      
      embedContainer.innerHTML = "";
      
      // Create Twitch embed iframe
      const iframe = document.createElement("iframe");
      iframe.src = `https://player.twitch.tv/?channel=${normalizedUsername}&parent=${window.location.hostname}`;
      iframe.width = "100%";
      iframe.height = "100%";
      iframe.allowFullscreen = true;
      iframe.style.display = "block"; // Ensure block display
      iframe.style.minHeight = isMobile ? "200px" : "500px"; // Min height based on device
      
      embedContainer.appendChild(iframe);
      
      // Ensure container is properly sized
      embedContainer.style.width = "100%";
      embedContainer.style.height = isMobile ? "auto" : "100%";
      embedContainer.style.minHeight = isMobile ? "200px" : "500px";
      
      // Force iframe to maintain aspect ratio with CSS
      const forceAspectRatio = () => {
        if (!isMobile && embedContainer.offsetWidth > 0) {
          // Calculate 16:9 aspect ratio height
          const aspectHeight = Math.floor(embedContainer.offsetWidth * (9/16));
          // Use the larger of calculated height or min height
          const targetHeight = Math.max(aspectHeight, 500);
          embedContainer.style.height = `${targetHeight}px`;
        }
      };
      
      // Set initial size
      forceAspectRatio();
      
      // Add resize listener to maintain aspect ratio
      window.addEventListener('resize', forceAspectRatio);
      
      // Clean up on component unmount
      return () => {
        window.removeEventListener('resize', forceAspectRatio);
      };
    } catch (error) {
      console.error("Error in setupTwitchEmbed:", error);
    }
  };

  const setupTwitchChatEmbed = () => {
    try {
      const chatContainer = document.getElementById("twitch-chat");
      if (!chatContainer) return;
      
      chatContainer.innerHTML = "";
      
      // Create chat iframe
      const chatIframe = document.createElement("iframe");
      chatIframe.src = `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&parent=${window.location.hostname}`;
      chatIframe.width = "100%";
      chatIframe.height = "100%";
      chatIframe.style.border = "none";
      
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
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please log in to continue.");

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

  // Update sendChatMessage to handle mobile chat input
  const sendChatMessage = (message) => {
    const chatIframe = document.querySelector("#twitch-chat iframe");
    if (chatIframe && message.trim()) {
      try {
        chatIframe.contentWindow.postMessage(
          { type: 'chat-message', message }, 
          'https://www.twitch.tv'
        );
        
        // Clear mobile chat input after sending
        if (isMobile) {
          setMobileMessage('');
        }
      } catch (error) {
        console.error("Error sending chat message:", error);
      }
    }
  };

  // Handle mobile chat submission
  const handleMobileChatSubmit = (e) => {
    e.preventDefault();
    if (mobileMessage.trim()) {
      sendChatMessage(mobileMessage);
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
      <div className="stream-page">
        {/* Show mobile-optimized layout for smaller screens */}
        {isMobile ? (
          <div className="mobile-stream-layout">
            <h2 className="stream-title">Watching {username}'s Stream</h2>
            
            {/* Video section (top) */}
            <div className="mobile-video-container" id="twitch-embed">
              {/* Twitch video will be embedded here */}
            </div>
            
            {/* Chat section (middle) */}
            <div className="mobile-chat-container" id="twitch-chat">
              {/* Twitch chat will be embedded here */}
            </div>
            
            {/* Chat input (bottom) */}
            <form className="mobile-chat-input-container" onSubmit={handleMobileChatSubmit}>
              <input
                type="text"
                placeholder="Send a message"
                value={mobileMessage}
                onChange={(e) => setMobileMessage(e.target.value)}
                className="mobile-chat-input"
              />
              <button type="submit" className="mobile-chat-send-button">
                <span className="send-icon">→</span>
              </button>
            </form>
            
            {/* Mobile vote button (floating) */}
            <button 
              className={`mobile-vote-button ${showMobileVotePanel ? 'active' : ''}`}
              onClick={toggleMobileVotePanel}
              aria-label="Vote"
            >
              VOTE
            </button>
            
            {/* Mobile vote panel */}
            <div className={`mobile-vote-panel ${showMobileVotePanel ? 'show' : ''}`}>
              <div className="panel-header">
                <h3 className="panel-title">Vote for {username}</h3>
                <button 
                  className="panel-close" 
                  onClick={toggleMobileVotePanel}
                  aria-label="Close voting panel"
                >
                  <span>✕</span>
                </button>
              </div>
              
              <div className="panel-body">
                <div className="panel-balance">
                  <span className="balance-amount">Available Gems: {gemBalance} 💎</span>
                  <WatchAdButton 
                    onGemsEarned={refreshUserCredits} 
                    compact={true}
                  />
                </div>
                
                <div className="panel-amount-grid">
                  {[5, 10, 25, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      className={`panel-amount-button ${selectedAmount === amount ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedAmount(amount);
                        setCustomAmount('');
                      }}
                    >
                      {amount} 💎
                    </button>
                  ))}
                  <div className="panel-amount-button">
                    <input
                      type="text"
                      value={customAmount}
                      onChange={handleCustomAmountChange}
                      placeholder="Custom"
                      className="panel-custom-input"
                    />
                  </div>
                </div>
                
                {errorMessage && (
                  <div className="error-message">{errorMessage}</div>
                )}
                
                <button 
                  className={`panel-submit-button ${voteSuccess ? 'success' : ''}`}
                  onClick={handleSendVote} 
                  disabled={isVoting || !selectedAmount || errorMessage === "Please log in to continue."}
                >
                  {isVoting ? 'Processing...' : voteSuccess ? 'Vote Successful!' : `Vote with ${selectedAmount || 0} 💎`}
                </button>
              </div>
            </div>
            
            {/* Backdrop for mobile vote panel */}
            <div 
              className={`mobile-vote-backdrop ${showMobileVotePanel ? 'show' : ''}`} 
              onClick={toggleMobileVotePanel}
            ></div>
          </div>
        ) : (
          // Desktop layout (unchanged)
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

            {/* Supporting Content Section */}
            <div className="supporting-content">
              <div className="info-row">
                {streamerInfo.bio && (
                  <div className="streamer-bio-card">
                    <div className="bio-header">
                      {streamerInfo.profileImageUrl && (
                        <img 
                          src={streamerInfo.profileImageUrl} 
                          alt={`${username}'s profile`} 
                          className="bio-profile-image"
                        />
                      )}
                      <h3>About {username}</h3>
                    </div>
                    <p className="bio-text">{streamerInfo.bio}</p>
                  </div>
                )}

                <div className="top-supporters-card">
                  <h3>💎 Top Supporters</h3>
                  <div className="supporters-list">
                    {topSupporters.length > 0 ? (
                      topSupporters.map((supporter, index) => (
                        <div 
                          key={`${supporter.username}-${supporter.amount}-${index}`} 
                          className="supporter-item animate-update"
                        >
                          <span className="rank">#{index + 1}</span>
                          <span className="username">{supporter.username}</span>
                          <span className="amount">{supporter.amount} 💎</span>
                        </div>
                      ))
                    ) : (
                      <div className="supporter-item empty-state">
                        <span className="empty-message">Be the first to support!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="vote-stats-container">
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

              <div className="leaderboard-info-card">
                <h3>🏆 Current Competition</h3>
                <div className="leaderboard-stats">
                  <div className="stat-item">
                    <p>Time Remaining</p>
                    <h4>{timeRemaining || 'Loading...'}</h4>
                  </div>
                  <div className="stat-item">
                    <p>Prize Pool</p>
                    <h4>${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                  </div>
                </div>
              </div>

              {/* Desktop Voting Panel */}
              <div 
                className={`floating-vote-container ${isVotePaneCollapsed ? 'collapsed' : ''}`}
                title={isVotePaneCollapsed ? "Click to vote for streamer" : ""}
                onClick={(e) => {
                  if (isVotePaneCollapsed) {
                    e.stopPropagation();
                    setIsVotePaneCollapsed(false);
                  }
                }}
              >
                {isVotePaneCollapsed ? (
                  <div 
                    className="vote-button-collapsed"
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      zIndex: 1030
                    }}
                    onClick={toggleDesktopVotePanel}
                  >
                    VOTE
                  </div>
                ) : (
                  <button 
                    className="collapse-toggle"
                    onClick={(e) => {
                      e.stopPropagation(); // Stop propagation to prevent conflicting toggles
                      setIsVotePaneCollapsed(!isVotePaneCollapsed);
                    }}
                    aria-label="Collapse voting panel"
                  >
                    ↓
                  </button>
                )}

                {!isVotePaneCollapsed && (
                  <div className="vote-options" onClick={(e) => e.stopPropagation()}>
                    <h3 className="vote-title">Vote for {username}</h3>
                    <div className="vote-buttons">
                      {[5, 10, 25, 50, 100].map((amount) => (
                        <button
                          key={amount}
                          className={`vote-amount-button ${selectedAmount === amount ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedAmount(amount);
                            setCustomAmount('');
                          }}
                        >
                          {amount} 💎
                        </button>
                      ))}
                      <div className="custom-amount-wrapper">
                        <input
                          type="text"
                          value={customAmount}
                          onChange={handleCustomAmountChange}
                          placeholder="Custom"
                          className="custom-amount-input"
                        />
                        <span className="custom-amount-icon">💎</span>
                      </div>
                    </div>

                    <button 
                      className={`vote-submit-button ${voteSuccess ? 'success' : ''}`}
                      onClick={handleSendVote} 
                      disabled={isVoting || errorMessage === "Please log in to continue."}
                    >
                      {isVoting ? (
                        `Processing Vote (${selectedAmount} 💎)`
                      ) : voteSuccess ? (
                        `Vote Successful! (${selectedAmount} 💎)`
                      ) : (
                        `👍 Vote with ${selectedAmount} 💎`
                      )}
                    </button>

                    <div className="gems-section">
                      <p className="credit-balance">
                        {isVoting ? (
                          `Processing... Current Balance: ${gemBalance} 💎`
                        ) : errorMessage ? (
                          `Error: ${errorMessage}`
                        ) : (
                          `Available Gems: ${gemBalance} 💎`
                        )}
                      </p>
                      
                      <div className="earn-more-gems">
                        <WatchAdButton onGemsEarned={refreshUserCredits} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
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