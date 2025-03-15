import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import InsufficientCreditsModal from '../components/InsufficientCreditsModal';
import WatchAdButton from '../components/WatchAdButton';
import GemBalanceDisplay from '../components/GemBalanceDisplay';
import './StreamPage.css';
import './MobileStreamPage.css';


const StreamPage = () => {
  const { username } = useParams();
  const normalizedUsername = username.toLowerCase();
  const [voteStats, setVoteStats] = useState({ today: 0, week: 0, allTime: 0 });
  const [credits, setCredits] = useState({
    available: 0
  });
  const [selectedAmount, setSelectedAmount] = useState(5);
  const [userIp, setUserIp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [isIOS, setIsIOS] = useState(false);
  const layoutUpdatedRef = useRef(false);

  useEffect(() => {
    // More robust iOS detection
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
               (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    setIsIOS(iOS);
    
    // If iOS, force mobile view regardless of window width
    if (iOS) {
      setIsMobile(true);
      
      // Add iOS class to html element for CSS targeting
      document.documentElement.classList.add('ios');
      
      // Prevent double-tap zoom on iOS
      document.addEventListener('touchend', function(event) {
        const now = Date.now();
        const DOUBLE_TAP_THRESHOLD = 300;
        if (now - lastTouchEnd <= DOUBLE_TAP_THRESHOLD) {
          event.preventDefault();
        }
        lastTouchEnd = now;
      }, false);
      
      // Prevent pinch zoom on iOS
      document.addEventListener('gesturestart', function(event) {
        event.preventDefault();
      });
    }
    
    // Reset layout updated flag when component mounts
    layoutUpdatedRef.current = false;
    
    // Initialize lastTouchEnd for iOS double-tap prevention
    let lastTouchEnd = 0;
  }, []);

  useEffect(() => {
    let mounted = true;
    let subscriptionSubscription = null;
    let votesSubscription = null;

    const initializePage = async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        // Force scroll to top before loading content
        window.scrollTo(0, 0);
        
        // For mobile devices, add appropriate classes and configure viewport
        if (isMobile) {
          // Apply iOS-specific optimizations
          if (isIOS) {
            document.documentElement.classList.add('ios-device');
            
            // Force viewport settings for iOS
            const viewportMeta = document.querySelector('meta[name="viewport"]');
            if (viewportMeta) {
              viewportMeta.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
            } else {
              const newMeta = document.createElement('meta');
              newMeta.name = 'viewport';
              newMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
              document.head.appendChild(newMeta);
            }
            
            // Add viewport-fit=cover meta tag for iPhone X and newer
            const viewportFitMeta = document.querySelector('meta[name="viewport-fit"]');
            if (!viewportFitMeta) {
              const newViewportFitMeta = document.createElement('meta');
              newViewportFitMeta.name = 'viewport-fit';
              newViewportFitMeta.content = 'cover';
              document.head.appendChild(newViewportFitMeta);
            }
          }
        }
        
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
          setupTwitchEmbed();
          setupTwitchChatEmbed();
          setLoading(false);
          // Ensure we're at the top after everything loads
          window.scrollTo(0, 0);
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
  }, [normalizedUsername, isIOS, isMobile, isPortrait]);

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768 || isIOS;
      const newIsPortrait = window.innerHeight > window.innerWidth;
      
      setIsMobile(newIsMobile);
      setIsPortrait(newIsPortrait);
      
      // Mark that we're updating the layout
      layoutUpdatedRef.current = true;
    };
    
    // More robust orientation change handling
    const handleOrientationChange = () => {
      // Some devices need a timeout to correctly report dimensions after orientation change
      setTimeout(() => {
        const newIsPortrait = window.innerHeight > window.innerWidth;
        setIsPortrait(newIsPortrait);
        layoutUpdatedRef.current = true;
        
        // iOS needs multiple updates after orientation change
        if (isIOS) {
          // Force a scroll reset and layout recalculation
          window.scrollTo(0, 0);
          
          // Update viewport settings
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          if (viewportMeta) {
            // First disable scaling to prevent layout shift
            viewportMeta.setAttribute('content', 
              'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
            
            // Then re-enable with proper settings
            setTimeout(() => {
              viewportMeta.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
            }, 300);
          }
          
          // Reset chat iframe to fix potential display issues
          setTimeout(() => {
            setupTwitchChatEmbed();
          }, 500);
        }
      }, 100);
    };

    // Handle both resize and orientation events
    window.addEventListener('resize', handleResize);
    
    // Add orientation change event listener
    if (window.orientation !== undefined || 'orientation' in window) {
      window.addEventListener('orientationchange', handleOrientationChange);
    } else {
      // Fallback for browsers that don't support orientationchange
      const mediaQuery = window.matchMedia("(orientation: portrait)");
      mediaQuery.addListener(handleOrientationChange);
    }
    
    // For iOS, ensure we handle orientation changes properly
    if (isIOS) {
      // Fix for iOS Safari viewport issues on orientation change
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          handleOrientationChange();
        }
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (window.orientation !== undefined || 'orientation' in window) {
        window.removeEventListener('orientationchange', handleOrientationChange);
      } else {
        const mediaQuery = window.matchMedia("(orientation: portrait)");
        mediaQuery.removeListener(handleOrientationChange);
      }
      
      if (isIOS) {
        document.removeEventListener('visibilitychange', handleOrientationChange);
      }
    };
  }, [normalizedUsername, isIOS]);

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
    if (!document.getElementById("twitch-embed-script")) {
      const script = document.createElement("script");
      script.setAttribute("src", "https://player.twitch.tv/js/embed/v1.js");
      script.setAttribute("async", true);
      script.setAttribute("id", "twitch-embed-script");
      script.onload = () => createEmbed();
      document.body.appendChild(script);
    } else {
      createEmbed();
    }
  };

  const createEmbed = () => {
    const embedContainer = document.getElementById("twitch-embed");
    if (embedContainer) embedContainer.innerHTML = "";

    new window.Twitch.Embed("twitch-embed", {
      width: "100%",
      height: "100%",
      channel: normalizedUsername,
      layout: "video",
      autoplay: true,
      parent: ["chadderai.vercel.app", "localhost"],
      muted: isMobile
    });

    embedContainer.style.width = "100%";
    embedContainer.style.height = "100%";
  };

  const setupTwitchChatEmbed = () => {
    const chatContainer = document.getElementById("twitch-chat");
    if (chatContainer) {
      chatContainer.innerHTML = "";
      
      const chatIframe = document.createElement("iframe");
      
      // Add a unique identifier to force cache refresh
      const cacheBreaker = Date.now();
      
      // Set correct parent domains - very important for Twitch chat to work
      const parentDomains = [
        'localhost', 
        'chadderai.vercel.app', 
        'chadderforchadders-4uv7d1m5i-spencershahhs-projects.vercel.app',
        'chadder.ai'
      ];
      const parentParams = parentDomains.map(domain => `parent=${domain}`).join('&');
      
      chatIframe.setAttribute(
        "src",
        `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&${parentParams}&t=${cacheBreaker}`
      );
      chatIframe.setAttribute("title", `${normalizedUsername} chat`);
      
      // Apply classes instead of inline styles
      chatIframe.classList.add("chat-iframe");
      
      // Add mobile=true parameter for mobile view
      if (isMobile) {
        const currentSrc = chatIframe.getAttribute("src");
        chatIframe.setAttribute("src", `${currentSrc}&mobile=true`);
        chatIframe.classList.add("mobile-iframe");
        
        // Additional attributes for iOS
        if (isIOS) {
          chatIframe.setAttribute("scrolling", "yes");
          chatIframe.setAttribute("allowfullscreen", "true");
          
          // For iOS, add extra styles and wrap in another div for better scrolling
          chatIframe.style.webkitOverflowScrolling = "touch";
          
          // Create a wrapper div for iOS scrolling fixes
          const iosScrollWrapper = document.createElement("div");
          iosScrollWrapper.className = "ios-iframe-wrapper";
          iosScrollWrapper.style.webkitOverflowScrolling = "touch";
          iosScrollWrapper.style.overflow = "auto";
          iosScrollWrapper.style.height = "100%";
          iosScrollWrapper.style.width = "100%";
          iosScrollWrapper.style.position = "relative";
          
          // Use the wrapper instead of directly appending to container
          iosScrollWrapper.appendChild(chatIframe);
          chatContainer.appendChild(iosScrollWrapper);
          
          // Add listener to fix common iOS iframe issues
          chatIframe.addEventListener('load', () => {
            // Force height recalculation on load
            setTimeout(() => {
              chatIframe.style.height = "calc(100% - 50px)";
              // Sometimes iOS needs a scroll trigger to render properly
              iosScrollWrapper.scrollTop = 1;
              iosScrollWrapper.scrollTop = 0;
            }, 500);
          });
          
          return; // We've already appended the iframe to the container
        }
      }
      
      // For non-iOS, just append directly
      chatContainer.appendChild(chatIframe);
    }
  };

  const fetchUserCredits = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please log in to continue.");

      const { data: userData, error: checkError } = await supabase
        .from("users")
        .select("credits, subscription_tier, subscription_status")
        .eq("id", user.id)
        .single();

      if (checkError) throw checkError;

      setCredits({
        available: userData.credits || 0
      });
    } catch (err) {
      console.error("Error fetching user credits:", err.message);
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

      // Check if user has enough credits
      if (credits.available < selectedAmount) {
        setShowCreditsModal(true);
        setIsVoting(false);
        return;
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

      // Update user's credits
      const { error: updateError } = await supabase
        .from("users")
        .update({
          credits: credits.available - selectedAmount
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Update local state
      setCredits({
        available: credits.available - selectedAmount
      });
      
      await fetchVoteStats();
      setErrorMessage("");

      // After successful vote
      setVoteSuccess(true);
      setTimeout(() => setVoteSuccess(false), 2000);
    } catch (err) {
      setErrorMessage(err.message);
      console.error("Vote error:", err);
    } finally {
      setIsVoting(false);
    }
  };

  const handlePurchaseCredits = () => {
    setShowCreditsModal(false);
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

  // Add this new function to refresh user credits after watching an ad
  const refreshUserCredits = async () => {
    await fetchUserCredits();
  };

  // Add this function to handle sending chat messages through the iframe
  const sendChatMessage = (message) => {
    const chatIframe = document.querySelector("#twitch-chat iframe");
    if (chatIframe && message.trim()) {
      // Try to send the message to the Twitch chat iframe
      try {
        // This attempts to access the input field within the iframe and dispatch events
        // Note: May be limited by cross-origin restrictions
        chatIframe.contentWindow.postMessage(
          { type: 'chat-message', message }, 
          'https://www.twitch.tv'
        );
      } catch (error) {
        console.error("Error sending chat message:", error);
      }
    }
  };

  const toggleMobileVotePanel = () => {
    const panel = document.querySelector('.mobile-vote-panel');
    if (panel) {
      panel.classList.toggle('show');
      const button = document.querySelector('.mobile-vote-button');
      if (button) {
        button.classList.toggle('active');
      }
    }
  };

  // Add this function to handle vote submission (referenced in mobile panel but missing)
  const handleVoteSubmit = (amount) => {
    if (!amount || amount <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }
    
    const voteAmount = parseInt(amount);
    setSelectedAmount(voteAmount);
    setCustomAmount('');
    
    // Call the vote handler
    handleVote();
    
    // Hide mobile panel after vote
    const panel = document.querySelector('.mobile-vote-panel');
    const button = document.querySelector('.mobile-vote-button');
    if (panel) {
      panel.classList.remove('show');
    }
    if (button) {
      button.classList.remove('active');
    }
  };

  // Add function to show watch ad modal
  const showWatchAdModal = () => {
    // You might already have this functionality in WatchAdButton
    // This is just a placeholder that will be used by the mobile panel
    const watchAdButton = document.querySelector('.watch-ad-button');
    if (watchAdButton) {
      watchAdButton.click();
    }
  };

  return (
    <div className={`stream-page ${isIOS ? 'ios' : ''}`}>
      <h2 className="stream-title">Watching {username}'s Stream</h2>
      
      <div className="stream-layout">
        <div className="stream-video-container">
          <div id="twitch-embed"></div>
        </div>

        <div className="stream-right-container">
          <div className="stream-chat-container" id="twitch-chat">
            {/* Chat iframe will be injected here */}
            {isMobile && (
              <div className="chat-input-container" id="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Send a message"
                  aria-label="Chat input"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      sendChatMessage(e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
                <button 
                  onClick={(e) => {
                    const input = e.target.previousSibling;
                    sendChatMessage(input.value);
                    input.value = '';
                  }}
                  className="chat-send-button"
                  aria-label="Send message"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Vote Button and Panel */}
      {isMobile && (
        <>
          <button 
            className="mobile-vote-button" 
            onClick={toggleMobileVotePanel}
          >
            <span className="vote-button-text">Vote</span>
          </button>
          <div className="mobile-vote-panel">
            <h3 className="panel-title">Vote with Gems</h3>
            <div className="panel-amount-grid">
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(10)}>10</button>
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(20)}>20</button>
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(50)}>50</button>
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(100)}>100</button>
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(200)}>200</button>
              <button className="panel-amount-button" onClick={() => handleVoteSubmit(500)}>500</button>
            </div>
            <input 
              type="number" 
              className="panel-custom-input"
              value={customAmount} 
              onChange={(e) => setCustomAmount(e.target.value)} 
              placeholder="Custom amount" 
            />
            <button 
              className="panel-submit-button" 
              onClick={() => handleVoteSubmit(customAmount)}
            >
              Vote
            </button>
            <div className="panel-gems-section">
              <span className="panel-balance">Available: {credits ? credits.available : userCredit} gems</span>
              <span className="panel-earn">
                <button onClick={showWatchAdModal} className="earn-gems-button">
                  + Earn Gems
                </button>
              </span>
            </div>
          </div>
        </>
      )}

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

        <div className={`floating-vote-container ${isVotePaneCollapsed ? 'collapsed' : ''}`}>
          <button 
            className="collapse-toggle"
            onClick={() => setIsVotePaneCollapsed(!isVotePaneCollapsed)}
            aria-label={isVotePaneCollapsed ? "Expand voting panel" : "Collapse voting panel"}
          >
            {isVotePaneCollapsed ? '↑' : '↓'}
          </button>

          <div className="vote-options">
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
              onClick={handleVote} 
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
                  `Processing... Current Balance: ${credits.available} 💎`
                ) : errorMessage ? (
                  `Error: ${errorMessage}`
                ) : (
                  `Available Gems: ${credits.available} 💎`
                )}
              </p>
              
              <div className="earn-more-gems">
                <WatchAdButton onGemsEarned={refreshUserCredits} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        requiredAmount={selectedAmount}
        currentCredits={credits.available}
        onPurchase={handlePurchaseCredits}
      />
    </div>
  );
};

export default StreamPage;