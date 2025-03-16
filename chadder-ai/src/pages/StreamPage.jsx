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
  const normalizedUsername = username.toLowerCase();
  const [voteStats, setVoteStats] = useState({ today: 0, week: 0, allTime: 0 });
  const [gemBalance, setGemBalance] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState(5);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [isIOS, setIsIOS] = useState(false);
  const layoutUpdatedRef = useRef(false);
  const panelVisibleRef = useRef(false);
  const [showMobileVotePanel, setShowMobileVotePanel] = useState(false);

  // Add logging to help troubleshoot
  useEffect(() => {
    console.log("StreamPage mounting", { username, isMobile, isIOS });
    
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
  }, [username, isMobile, isIOS]);

  // Detect iOS - more robust detection
  useEffect(() => {
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      
      // iOS detection methods
      const isIOS = 
        /ipad|iphone|ipod/.test(userAgent) && !window.MSStream || // Standard detection
        (userAgent.includes('mac') && 'ontouchend' in document) || // iPad with new iPadOS
        (/iPad|iPhone|iPod/.test(navigator.platform) ||           // Older devices
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      
      setIsIOS(isIOS);
      
      // Add iOS class to body if needed
      if (isIOS) {
        document.body.classList.add('ios');
        console.log('iOS device detected');
      }
    };
    
    checkIOS();
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

  // Add effect to ensure vote container is properly visible on desktop
  useEffect(() => {
    if (!isMobile) {
      // Keep it collapsed by default (don't set isVotePaneCollapsed here)
      
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
        .select("gem_balance, subscription_tier, subscription_status")
        .eq("id", user.id)
        .single();

      if (checkError) throw checkError;

      setGemBalance(userData.gem_balance || 0);
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

      // Check if user has enough gems
      if (gemBalance < selectedAmount) {
        setShowGemsModal(true);
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
      
      // For mobile: Close the vote panel after successful vote
      if (isMobile) {
        // Use setTimeout to ensure UI shows "Processing..." briefly before closing
        setTimeout(() => {
          const panel = document.querySelector('.mobile-vote-panel');
          if (panel) {
            panel.classList.remove('show');
          }
          
          // Remove the backdrop
          const backdrop = document.querySelector('.mobile-vote-backdrop');
          if (backdrop) {
            backdrop.remove();
          }
        }, 700); // Short delay to show success state
      }
      
      // Reset vote success message after a delay
      setTimeout(() => setVoteSuccess(false), 2000);
    } catch (err) {
      setErrorMessage(err.message);
      console.error("Vote error:", err);
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

  // Add this new function to refresh user credits after watching an ad
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

  // Toggle mobile vote panel with improved iOS handling
  const toggleMobileVotePanel = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Toggle panel visibility
    const newState = !showMobileVotePanel;
    setShowMobileVotePanel(newState);
    
    try {
      // Toggle backdrop
      if (newState) {
        // Create backdrop element if it doesn't exist
        let backdrop = document.querySelector('.mobile-vote-backdrop');
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.className = 'mobile-vote-backdrop';
          document.body.appendChild(backdrop);
        }
        
        // IMPORTANT: Make sure backdrop is below clickable elements
        backdrop.style.zIndex = '9000'; // Lower z-index than the panel (10000)
        
        // Special handling for iOS - CRITICAL FIX
        if (isIOS) {
          // For iOS, set backdrop to not capture pointer events
          // This allows clicks to pass through to elements above it
          backdrop.style.pointerEvents = 'none';
          
          // Lock body scrolling on iOS
          document.body.style.position = 'fixed';
          document.body.style.top = `-${window.scrollY}px`;
          document.body.style.width = '100%';
          document.body.style.overflowY = 'hidden';
          
          // Set backdrop click handler for iOS
          setTimeout(() => {
            // Create a close button in the backdrop for iOS
            const closeButton = document.createElement('button');
            closeButton.className = 'backdrop-close-button';
            closeButton.textContent = 'Close';
            closeButton.style.position = 'absolute';
            closeButton.style.bottom = '20px';
            closeButton.style.left = '50%';
            closeButton.style.transform = 'translateX(-50%)';
            closeButton.style.padding = '10px 20px';
            closeButton.style.background = 'rgba(0,0,0,0.7)';
            closeButton.style.color = 'white';
            closeButton.style.borderRadius = '20px';
            closeButton.style.border = 'none';
            closeButton.style.zIndex = '9999';
            closeButton.style.pointerEvents = 'auto'; // Make this clickable
            
            closeButton.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleMobileVotePanel();
            };
            
            if (backdrop) {
              backdrop.appendChild(closeButton);
            }
          }, 100);
        } else {
          // Non-iOS can use normal backdrop click to close
          backdrop.style.pointerEvents = 'auto';
          backdrop.onclick = () => {
            toggleMobileVotePanel();
          };
        }
        
        // Show backdrop
        backdrop.style.display = 'block';
        setTimeout(() => {
          if (backdrop) backdrop.style.opacity = '1';
        }, 10);
        
        // Force layout reflow for iOS
        if (isIOS) {
          const panel = document.querySelector('.mobile-vote-panel');
          if (panel) {
            panel.style.display = 'block';
            // Force reflow
            void panel.offsetWidth;
            panel.classList.add('show');
            
            // CRITICAL: Make panel itself receive pointer events
            panel.style.pointerEvents = 'auto';
            panel.style.zIndex = '10000';
            
            // Schedule button initialization
            setTimeout(() => {
              const buttons = panel.querySelectorAll('button');
              buttons.forEach(button => {
                // Ensure pointer events is enabled
                button.style.pointerEvents = 'auto';
                button.style.zIndex = '10001';
                button.style.position = 'relative';
                // Add tap highlight color
                button.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
              });
              
              // Also ensure input is clickable
              const inputs = panel.querySelectorAll('input');
              inputs.forEach(input => {
                input.style.pointerEvents = 'auto';
                input.style.zIndex = '10001';
                input.style.position = 'relative';
              });
            }, 100);
          }
        }
      } else {
        // Hide backdrop
        const backdrop = document.querySelector('.mobile-vote-backdrop');
        if (backdrop) {
          backdrop.style.opacity = '0';
          setTimeout(() => {
            if (backdrop) {
              backdrop.style.display = 'none';
              // Remove any close buttons
              const closeButton = backdrop.querySelector('.backdrop-close-button');
              if (closeButton) closeButton.remove();
            }
          }, 300);
        }
        
        // Unlock body scrolling on iOS
        if (isIOS) {
          const scrollY = document.body.style.top;
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.overflowY = '';
          document.body.style.width = '';
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      }
    } catch (error) {
      console.error("Error in toggleMobileVotePanel:", error);
    }
  };

  // Handle vote submission (for mobile panel)
  const handleVoteSubmit = (amount) => {
    if (!amount || amount <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }
    
    const voteAmount = parseInt(amount);
    setSelectedAmount(voteAmount);
    
    // Call the vote handler directly
    handleVote();
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

  // Add this new function to handle the desktop vote button click
  const toggleDesktopVotePanel = (e) => {
    e.stopPropagation();
    setIsVotePaneCollapsed(!isVotePaneCollapsed);
  };

  // Add a special effect to handle iOS button initialization
  useEffect(() => {
    if (!isIOS) return; // Only for iOS devices
    
    const initializeIOSButtons = () => {
      const panel = document.querySelector('.mobile-vote-panel');
      if (!panel || !panel.classList.contains('show')) return;
      
      console.log('Initializing iOS buttons');
      
      // Get all buttons in the panel
      const buttons = panel.querySelectorAll('button');
      
      // Add special iOS event handling
      buttons.forEach(button => {
        // Make sure button has the iOS touch class
        button.classList.add('ios-touch-button');
        
        // Remove existing event listeners (to prevent duplicates)
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // Add new direct touch event listeners
        newButton.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Visual feedback
          newButton.style.opacity = '0.8';
          
          // Get button type
          if (newButton.classList.contains('panel-amount-button')) {
            // Amount button
            const amount = parseInt(newButton.textContent.trim(), 10);
            if (!isNaN(amount)) {
              setSelectedAmount(amount);
              setCustomAmount('');
              
              // Clear selected state from all buttons
              const amountButtons = panel.querySelectorAll('.panel-amount-button');
              amountButtons.forEach(btn => btn.classList.remove('selected'));
              
              // Add selected state to this button
              newButton.classList.add('selected');
            }
          } else if (newButton.classList.contains('panel-submit-button')) {
            // Submit button (vote)
            handleVote();
          } else if (newButton.classList.contains('earn-gems-button')) {
            // Earn gems button
            showWatchAdModal();
          }
          
          // Restore opacity after a delay
          setTimeout(() => {
            newButton.style.opacity = '1';
          }, 200);
        }, { passive: false });
        
        // Also add regular click as fallback
        newButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Similar functionality as touchstart
          if (newButton.classList.contains('panel-amount-button')) {
            const amount = parseInt(newButton.textContent.trim(), 10);
            if (!isNaN(amount)) {
              setSelectedAmount(amount);
              setCustomAmount('');
              
              // Update selected state
              const amountButtons = panel.querySelectorAll('.panel-amount-button');
              amountButtons.forEach(btn => btn.classList.remove('selected'));
              newButton.classList.add('selected');
            }
          } else if (newButton.classList.contains('panel-submit-button')) {
            handleVote();
          } else if (newButton.classList.contains('earn-gems-button')) {
            showWatchAdModal();
          }
        }, { passive: false });
      });
    };
    
    // Add a mutation observer to detect when the panel becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target.classList && 
            mutation.target.classList.contains('mobile-vote-panel') && 
            mutation.target.classList.contains('show')) {
          // Panel became visible, initialize buttons
          initializeIOSButtons();
          panelVisibleRef.current = true;
        }
      });
    });
    
    // Start observing
    const panel = document.querySelector('.mobile-vote-panel');
    if (panel) {
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
    
    // Cleanup
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isIOS, handleVote, setSelectedAmount, showWatchAdModal]);

  // Cleanup for iOS-specific touch event handlers
  useEffect(() => {
    if (!isIOS) return;
    
    // Set up universal touch event handler for iOS
    const preventDefaultForIOS = (e) => {
      if (showMobileVotePanel && e.target.closest('.mobile-vote-panel')) {
        // Don't block default behavior within the vote panel
        return;
      }
      
      // Prevent double-tap zoom on iOS when vote panel is open
      if (showMobileVotePanel) {
        e.preventDefault();
      }
    };
    
    // Add iOS-specific touch handlers
    if (isIOS) {
      document.addEventListener('touchstart', preventDefaultForIOS, { passive: false });
      document.addEventListener('touchmove', preventDefaultForIOS, { passive: false });
      
      // Prevent pinch zoom on iOS
      document.addEventListener('gesturestart', (e) => {
        if (showMobileVotePanel) {
          e.preventDefault();
        }
      }, { passive: false });
    }
    
    // Cleanup
    return () => {
      if (isIOS) {
        document.removeEventListener('touchstart', preventDefaultForIOS);
        document.removeEventListener('touchmove', preventDefaultForIOS);
        document.removeEventListener('gesturestart', preventDefaultForIOS);
      }
    };
  }, [isIOS, showMobileVotePanel]);

  // Add special touch events for direct handling
  const handleButtonInteraction = (e, buttonType, amount = null) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Add visual feedback
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.7';
      setTimeout(() => {
        if (e.currentTarget) e.currentTarget.style.opacity = '1';
      }, 150);
    }
    
    // Handle based on button type
    switch (buttonType) {
      case 'amount':
        if (amount !== null) {
          setSelectedAmount(amount);
          setCustomAmount('');
          
          // Clear selected state from all buttons
          const panel = document.querySelector('.mobile-vote-panel');
          if (panel) {
            const amountButtons = panel.querySelectorAll('.panel-amount-button');
            amountButtons.forEach(btn => btn.classList.remove('selected'));
            
            // Add selected to current button
            e.currentTarget.classList.add('selected');
          }
        }
        break;
      case 'vote':
        handleVote();
        break;
      case 'earn':
        showWatchAdModal();
        break;
      case 'close':
        toggleMobileVotePanel();
        break;
      default:
        break;
    }
  };

  // Fix viewport on iOS
  useEffect(() => {
    if (!isIOS) return;
    
    if (showMobileVotePanel) {
      // When panel is showing on iOS, fix viewport
      const metaViewport = document.querySelector('meta[name=viewport]');
      if (metaViewport) {
        // Save original viewport
        const originalContent = metaViewport.getAttribute('content');
        metaViewport._originalContent = originalContent;
        
        // Set fixed viewport that prevents scaling/zooming
        metaViewport.setAttribute('content', 
          'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        
        // Force redraw
        document.body.style.display = 'none';
        setTimeout(() => {
          document.body.style.display = '';
        }, 10);
      }
    } else {
      // Restore original viewport when panel is closed
      const metaViewport = document.querySelector('meta[name=viewport]');
      if (metaViewport && metaViewport._originalContent) {
        metaViewport.setAttribute('content', metaViewport._originalContent);
      }
    }
  }, [isIOS, showMobileVotePanel]);

  // Add a try-catch wrapper around the render to diagnose issues
  if (!username) {
    return <div className="error-state">Username is required to view the stream</div>;
  }

  // Return loading state when initializing  
  if (loading) {
    return (
      <div className="loading-state">
        <h2>Loading stream for {username}...</h2>
      </div>
    );
  }

  try {
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
              onClick={(e) => {
                e.preventDefault(); // Prevent default touch behavior
                e.stopPropagation(); // Prevent event bubbling
                toggleMobileVotePanel();
              }}
              onTouchStart={(e) => {
                // For iOS, add touchstart handler
                if (isIOS) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleMobileVotePanel();
                }
              }}
              aria-label="Open vote panel"
            >
              <span className="vote-button-text">VOTE</span>
            </button>
            <div 
              className={`mobile-vote-panel ${showMobileVotePanel ? 'show' : ''} ${isIOS ? 'ios' : ''}`}
              onClick={(e) => e.stopPropagation()} 
              style={{ 
                zIndex: 10000,
                position: 'fixed',
                pointerEvents: 'auto',
                touchAction: 'auto'
              }}
            >
              <div className="panel-header">
                <div className="panel-title">Support {username}</div>
                <button 
                  className="panel-close" 
                  onClick={(e) => handleButtonInteraction(e, 'close')}
                  onTouchStart={(e) => handleButtonInteraction(e, 'close')}
                  role="button"
                  tabIndex={0}
                  aria-label="Close vote panel"
                  style={{ 
                    pointerEvents: 'auto',
                    zIndex: 10001,
                    position: 'relative' 
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="panel-body">
                <div className="panel-description">
                  Your support helps the creator climb the rankings.
                </div>
                <div className="panel-balance">
                  <span className="balance-amount">💎 {gemBalance || 0}</span>
                  <button 
                    className="earn-gems-button ios-touch-button" 
                    onClick={(e) => handleButtonInteraction(e, 'earn')}
                    onTouchStart={(e) => handleButtonInteraction(e, 'earn')}
                    role="button"
                    tabIndex={0}
                    aria-label="Earn gems"
                    style={{ 
                      pointerEvents: 'auto',
                      zIndex: 10001,
                      position: 'relative' 
                    }}
                  >
                    <span>+ Earn More</span>
                  </button>
                </div>
                <div className="panel-amounts">
                  {[100, 500, 1000, 5000].map((amount) => (
                    <button
                      key={amount}
                      className={`panel-amount-button ios-touch-button ${selectedAmount === amount ? 'selected' : ''}`}
                      onClick={(e) => handleButtonInteraction(e, 'amount', amount)}
                      onTouchStart={(e) => handleButtonInteraction(e, 'amount', amount)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Vote ${amount} gems`}
                      style={{ 
                        pointerEvents: 'auto',
                        zIndex: 10001,
                        position: 'relative' 
                      }}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
                <div className="panel-custom-amount">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => {
                      e.stopPropagation();
                      setCustomAmount(e.target.value);
                      if (e.target.value) {
                        setSelectedAmount(parseInt(e.target.value));
                      } else {
                        setSelectedAmount(0);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    placeholder="Custom amount"
                    min="1"
                    max="1000000"
                    style={{ 
                      pointerEvents: 'auto',
                      zIndex: 10001,
                      position: 'relative' 
                    }}
                  />
                </div>
                <button 
                  className="panel-submit-button ios-touch-button" 
                  onClick={(e) => handleButtonInteraction(e, 'vote')}
                  onTouchStart={(e) => handleButtonInteraction(e, 'vote')}
                  disabled={!selectedAmount && !customAmount}
                  role="button"
                  tabIndex={0}
                  aria-label="Submit vote"
                  style={{ 
                    pointerEvents: 'auto',
                    zIndex: 10001,
                    position: 'relative' 
                  }}
                >
                  Vote
                </button>
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

          {/* Desktop Voting Panel - Fixing to make sure button is clickable */}
          {!isMobile && (
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
                // When collapsed, make the entire circle clickable
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
          )}
        </div>

        <InsufficientGemsModal
          isOpen={showGemsModal}
          onClose={() => setShowGemsModal(false)}
          requiredAmount={selectedAmount}
          currentCredits={gemBalance}
          onPurchase={handlePurchaseGems}
        />
      </div>
    );
  } catch (error) {
    console.error('Render error:', error);
    return (
      <div className="error-state">
        <h2>Something went wrong</h2>
        <p>There was an error loading the stream. Please try refreshing the page.</p>
        <p>Error details: {error.message}</p>
      </div>
    );
  }
};

export default StreamPage;