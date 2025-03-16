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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [mobileVotePanelVisible, setMobileVotePanelVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const layoutUpdatedRef = useRef(false);
  const panelVisibleRef = useRef(false);
  const [error, setError] = useState(null);

  // Add debug logging for component state
  useEffect(() => {
    console.log("Current component state:", {
      username,
      normalizedUsername,
      isMobile,
      isPortrait,
      loading,
      mobileVotePanelVisible,
      gemBalance
    });
  }, [username, normalizedUsername, isMobile, isPortrait, loading, mobileVotePanelVisible, gemBalance]);

  // Add logging to help troubleshoot
  useEffect(() => {
    console.log("StreamPage mounting", { username, isMobile });
    
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
  }, [username, isMobile]);

  // Remove iOS detection - treat all mobile devices the same
  useEffect(() => {
    // Ensure no special device classes are added
    document.body.classList.remove('ios');
    document.documentElement.classList.remove('ios-device');
    document.documentElement.classList.remove('ios');
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
        
        // For mobile devices, use standard viewport settings
        if (isMobile) {
          // Apply standard mobile viewport settings only
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          if (viewportMeta) {
            viewportMeta.setAttribute('content', 
              'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
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
  }, [normalizedUsername, isMobile, isPortrait]);

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768;
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
        
        // Standard orientation change handling for mobile
        window.scrollTo(0, 0);
        
        // Update viewport settings
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (viewportMeta) {
          // First disable scaling to prevent layout shift
          viewportMeta.setAttribute('content', 
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
        
        // Reset chat iframe to fix potential display issues
        setTimeout(() => {
          setupTwitchChatEmbed();
        }, 500);
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

    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (window.orientation !== undefined || 'orientation' in window) {
        window.removeEventListener('orientationchange', handleOrientationChange);
      } else {
        const mediaQuery = window.matchMedia("(orientation: portrait)");
        mediaQuery.removeListener(handleOrientationChange);
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
    try {
      if (!document.getElementById("twitch-embed-script")) {
        const script = document.createElement("script");
        script.setAttribute("src", "https://player.twitch.tv/js/embed/v1.js");
        script.setAttribute("async", true);
        script.setAttribute("id", "twitch-embed-script");
        script.onload = () => createEmbed();
        script.onerror = (error) => {
          console.error("Error loading Twitch embed script:", error);
          // Use fallback method if script fails to load
          const embedContainer = document.getElementById("twitch-embed");
          if (embedContainer) {
            embedContainer.innerHTML = "";
            
            // Create simple iframe as fallback
            const fallbackIframe = document.createElement("iframe");
            fallbackIframe.src = `https://player.twitch.tv/?channel=${normalizedUsername}&parent=${window.location.hostname}`;
            fallbackIframe.allowFullscreen = true;
            fallbackIframe.style.width = "100%";
            fallbackIframe.style.height = "100%";
            embedContainer.appendChild(fallbackIframe);
          }
        };
        document.body.appendChild(script);
      } else {
        createEmbed();
      }
    } catch (error) {
      console.error("Error in setupTwitchEmbed:", error);
    }
  };

  const createEmbed = () => {
    const embedContainer = document.getElementById("twitch-embed");
    if (!embedContainer) return;
    
    embedContainer.innerHTML = "";

    try {
      // Make sure we have the Twitch lib available
      if (!window.Twitch || !window.Twitch.Embed) {
        console.error("Twitch embed library not loaded");
        // Fallback to a simple iframe if the embed library isn't available
        const fallbackIframe = document.createElement("iframe");
        fallbackIframe.src = `https://player.twitch.tv/?channel=${normalizedUsername}&parent=${window.location.hostname}`;
        fallbackIframe.allowFullscreen = true;
        fallbackIframe.style.width = "100%";
        fallbackIframe.style.height = "100%";
        embedContainer.appendChild(fallbackIframe);
        return;
      }

      // Use standard embed otherwise
      new window.Twitch.Embed("twitch-embed", {
        width: "100%",
        height: "100%",
        channel: normalizedUsername,
        layout: "video",
        autoplay: true,
        parent: ["chadderai.vercel.app", "localhost", window.location.hostname],
        muted: isMobile // Auto-mute on mobile to avoid autoplay restrictions
      });

      embedContainer.style.width = "100%";
      embedContainer.style.height = "100%";
    } catch (error) {
      console.error("Error creating Twitch embed:", error);
    }
  };

  const setupTwitchChatEmbed = () => {
    const chatContainer = document.getElementById("twitch-chat");
    if (!chatContainer) return;
    
    try {
      chatContainer.innerHTML = "";
      
      const chatIframe = document.createElement("iframe");
      
      // Add a unique identifier to force cache refresh
      const cacheBreaker = Date.now();
      
      // Set correct parent domains
      const parentDomains = [
        window.location.hostname,
        'localhost', 
        'chadderai.vercel.app', 
        'chadderforchadders-4uv7d1m5i-spencershahhs-projects.vercel.app',
        'chadder.ai'
      ];
      
      // Deduplicate domains
      const uniqueDomains = [...new Set(parentDomains)];
      const parentParams = uniqueDomains.map(domain => `parent=${domain}`).join('&');
      
      // Create the iframe URL
      let chatUrl = `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&${parentParams}&t=${cacheBreaker}`;
      
      // Add mobile=true parameter for mobile view
      if (isMobile) {
        chatUrl += "&mobile=true";
      }
      
      chatIframe.setAttribute("src", chatUrl);
      chatIframe.setAttribute("title", `${normalizedUsername} chat`);
      chatIframe.setAttribute("allowfullscreen", "true");
      
      // Apply classes based on device
      chatIframe.classList.add("chat-iframe");
      if (isMobile) {
        chatIframe.classList.add("mobile-iframe");
      }
      
      // Append the iframe and make sure it's visible
      chatContainer.appendChild(chatIframe);
      chatIframe.style.display = "block"; // Ensure the iframe is visible
    } catch (error) {
      console.error("Error setting up Twitch chat:", error);
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

  // Replace toggleMobileVotePanel with a simpler version
  const toggleMobileVotePanel = () => {
    try {
      const newVisibleState = !mobileVotePanelVisible;
      
      // Update state
      setMobileVotePanelVisible(newVisibleState);
      
      // Handle backdrop and panel visibility
      const panel = document.querySelector('.mobile-vote-panel');
      let backdrop = document.querySelector('.mobile-vote-backdrop');
      
      if (newVisibleState) {
        // Create backdrop if it doesn't exist
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.className = 'mobile-vote-backdrop';
          document.body.appendChild(backdrop);
          
          // Add click handler to close panel when backdrop is clicked
          backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
              toggleMobileVotePanel();
            }
          });
        }
        
        // Show backdrop and panel with animation
        requestAnimationFrame(() => {
          if (backdrop) {
            backdrop.classList.add('show');
          }
          if (panel) {
            panel.classList.add('show');
          }
        });
        
        // Lock body scroll when panel is open
        document.body.style.overflow = 'hidden';
        
      } else {
        // Hide backdrop and panel with animation
        if (backdrop) {
          backdrop.classList.remove('show');
          setTimeout(() => {
            if (backdrop && backdrop.parentNode) {
              backdrop.parentNode.removeChild(backdrop);
            }
          }, 300);
        }
        
        if (panel) {
          panel.classList.remove('show');
        }
        
        // Restore body scroll when panel is closed
        document.body.style.overflow = '';
      }
      
      // Toggle active class on mobile vote button
      const mobileVoteButton = document.querySelector('.mobile-vote-button');
      if (mobileVoteButton) {
        if (newVisibleState) {
          mobileVoteButton.classList.add('active');
        } else {
          mobileVoteButton.classList.remove('active');
        }
      }
    } catch (error) {
      console.error('Error toggling mobile vote panel:', error);
    }
  };

  // Replace handleSendVote with an improved version
  const handleSendVote = (e) => {
    e.preventDefault();
    if (sending) return;
    
    const amount = parseInt(customAmount) || selectedAmount;
    if (!amount) return;
    
    setSending(true);
    
    // Actually process the vote instead of using setTimeout
    handleVote();
  };

  // Add an improved cleanup function when component unmounts
  useEffect(() => {
    // ... existing setup code ...
    
    return () => {
      // Clean up any backdrop when component unmounts
      const backdrop = document.querySelector('.mobile-vote-backdrop');
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      // ... existing cleanup code ...
    };
  }, [normalizedUsername, isMobile, isPortrait]);

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

  // Add useEffect for initialization and error handling
  useEffect(() => {
    // Debug logging to help troubleshoot
    console.log("StreamPage mounted");
    console.log("Username:", username);
    console.log("isMobile:", isMobile);
    
    // Initialize
    try {
      // Clean up any leftover backdrops
      const existingBackdrop = document.querySelector('.mobile-vote-backdrop');
      if (existingBackdrop && existingBackdrop.parentNode) {
        existingBackdrop.parentNode.removeChild(existingBackdrop);
      }
      
      // Set initial gem balance (for demo)
      setGemBalance(1000);
      
      // Set loading state
      setLoading(false);
    } catch (error) {
      console.error("Error initializing StreamPage:", error);
      setError("Failed to initialize stream page");
      setLoading(false);
    }
    
    // Cleanup function
    return () => {
      // Remove any backdrop when component unmounts
      const backdrop = document.querySelector('.mobile-vote-backdrop');
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
    };
  }, [username]);

  // Wrap the render with error handling and include more robust error handling
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
    
    // Main render - simplify panel balance section, using emoji instead of gemIcon
    return (
      <div className="stream-page">
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

        {/* Mobile Vote Panel */}
        <div 
          className={`mobile-vote-panel ${mobileVotePanelVisible ? 'show' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-header">
            <h3 className="panel-title">Send Gems to {username}</h3>
            <button 
              className="panel-close" 
              onClick={toggleMobileVotePanel}
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
          
          <div className="panel-body">
            <p className="panel-description">
              Support {username} by sending gems during the stream!
            </p>
            
            <div className="panel-balance">
              <span>💎</span>
              <span className="balance-amount">Your gem balance: {gemBalance || 0}</span>
              <button 
                className="earn-gems-button"
                onClick={() => navigate('/credits')}
              >
                Get More
              </button>
            </div>
            
            <div className="panel-amounts">
              <div className="panel-amount-grid">
                {[1, 5, 10, 50, 100, 500].map(amount => (
                  <button
                    key={amount}
                    className={`panel-amount-button ${selectedAmount === amount ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedAmount(amount);
                      setCustomAmount('');
                    }}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              
              <div className="panel-custom-amount">
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="panel-custom-input"
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || (/^\d+$/.test(value) && parseInt(value) > 0)) {
                      setCustomAmount(value);
                      setSelectedAmount(value ? parseInt(value) : null);
                    }
                  }}
                />
              </div>
              
              <button
                className={`panel-submit-button ${sendSuccess ? 'success' : ''}`}
                onClick={handleSendVote}
                disabled={sending || (!selectedAmount && !customAmount)}
              >
                {sending ? 'Sending...' : sendSuccess ? 'Sent!' : 'Send Gems'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Vote Button */}
        <button
          className={`mobile-vote-button ${mobileVotePanelVisible ? 'active' : ''}`}
          onClick={toggleMobileVotePanel}
          aria-label="Vote for streamer"
        >
          VOTE
        </button>

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