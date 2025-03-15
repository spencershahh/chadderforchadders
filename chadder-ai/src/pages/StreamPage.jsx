import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
  const [isVotePaneCollapsed, setIsVotePaneCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

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
        
        // For mobile devices, directly set critical styles on document elements
        if (isMobile) {
          // Apply mobile styles to document body to ensure full viewport usage
          document.body.style.overflow = 'auto';
          document.body.style.position = 'relative';
          
          // Force any stream page elements to use our styles
          const applyMobileStyles = () => {
            const streamPage = document.querySelector('.stream-page');
            if (streamPage) {
              streamPage.style.padding = '0';
              streamPage.style.margin = '0';
              streamPage.style.minHeight = '100vh';
              streamPage.style.display = 'flex';
              streamPage.style.flexDirection = 'column';
              streamPage.style.overflow = 'hidden';
              streamPage.style.paddingBottom = '120px';
            }

            const streamLayout = document.querySelector('.stream-layout');
            if (streamLayout) {
              streamLayout.style.flexDirection = isPortrait ? 'column' : 'row';
              streamLayout.style.height = '100vh';
              streamLayout.style.paddingTop = '40px';
              streamLayout.style.position = 'fixed';
              streamLayout.style.width = '100%';
              streamLayout.style.zIndex = '900';
            }

            const videoContainer = document.querySelector('.stream-video-container');
            if (videoContainer) {
              if (isPortrait) {
                videoContainer.style.width = '100%';
                videoContainer.style.height = '40vh';
              } else {
                videoContainer.style.width = '65%';
                videoContainer.style.height = 'calc(100vh - 40px)';
              }
              videoContainer.style.position = 'relative';
              videoContainer.style.zIndex = '900';
            }

            const chatContainer = document.querySelector('.stream-right-container');
            if (chatContainer) {
              if (isPortrait) {
                chatContainer.style.flex = '1';
                chatContainer.style.width = '100%';
                chatContainer.style.height = 'calc(60vh - 40px)';
              } else {
                chatContainer.style.width = '35%';
                chatContainer.style.height = 'calc(100vh - 40px)';
              }
              chatContainer.style.position = 'relative';
              chatContainer.style.background = '#18181b';
              chatContainer.style.display = 'flex';
              chatContainer.style.flexDirection = 'column';
            }
          };

          // Apply styles immediately 
          applyMobileStyles();
          
          // And after a short delay to ensure DOM is updated
          setTimeout(applyMobileStyles, 100);
          setTimeout(applyMobileStyles, 500);
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
  }, [normalizedUsername]);

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768;
      const newIsPortrait = window.innerHeight > window.innerWidth;
      
      setIsMobile(newIsMobile);
      setIsPortrait(newIsPortrait);
      
      // If mobile state or orientation changes, update layout immediately
      if (newIsMobile) {
        const applyOrientationStyles = () => {
          // Update stream layout orientation
          const streamLayout = document.querySelector('.stream-layout');
          if (streamLayout) {
            streamLayout.style.flexDirection = newIsPortrait ? 'column' : 'row';
          }
          
          // Update video container size
          const videoContainer = document.querySelector('.stream-video-container');
          if (videoContainer) {
            if (newIsPortrait) {
              videoContainer.style.width = '100%';
              videoContainer.style.height = '40vh';
              videoContainer.style.minHeight = '150px';
            } else {
              videoContainer.style.width = '65%';
              videoContainer.style.height = 'calc(100vh - 40px)';
              videoContainer.style.minHeight = 'unset';
            }
          }
          
          // Update chat container layout
          const chatContainer = document.querySelector('.stream-right-container');
          if (chatContainer) {
            if (newIsPortrait) {
              chatContainer.style.flex = '1';
              chatContainer.style.width = '100%';
              chatContainer.style.height = 'calc(60vh - 40px)';
            } else {
              chatContainer.style.width = '35%';
              chatContainer.style.height = 'calc(100vh - 40px)';
            }
          }
          
          // Update info sections
          const infoElements = [
            '.info-row', 
            '.vote-stats-container', 
            '.leaderboard-info-card', 
            '.floating-vote-container'
          ];
          
          infoElements.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
              if (newIsPortrait) {
                element.style.marginTop = selector === '.info-row' ? '100vh' : '0.5rem';
                element.style.marginLeft = '0';
              } else {
                element.style.marginTop = '0';
                element.style.marginLeft = '65%';
              }
            }
          });
          
          // Refresh chat iframe by calling the function directly
          if (normalizedUsername) {
            const chatContainer = document.getElementById("twitch-chat");
            if (chatContainer) {
              chatContainer.innerHTML = "";
              
              // Create and add the iframe directly here instead of calling setupTwitchChatEmbed
              const chatIframe = document.createElement("iframe");
              const cacheBreaker = new Date().getTime();
              chatIframe.setAttribute(
                "src",
                `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&parent=localhost&parent=chadderai.vercel.app&mobile=true&t=${cacheBreaker}`
              );
              chatIframe.setAttribute("title", `${normalizedUsername} chat`);
              
              // Apply styles directly
              chatIframe.style.width = "100%";
              chatIframe.style.border = "none";
              
              if (newIsMobile) {
                chatIframe.style.height = "calc(100% - 50px)";
                chatIframe.style.position = "absolute";
                chatIframe.style.top = "0";
                chatIframe.style.left = "0";
                chatIframe.style.right = "0";
                chatIframe.style.bottom = "50px";
                chatIframe.style.zIndex = "5";
              } else {
                chatIframe.style.height = "100%";
              }
              
              chatIframe.setAttribute("scrolling", "yes");
              chatContainer.appendChild(chatIframe);
              
              // Position the input container correctly
              const inputContainer = chatContainer.querySelector('.chat-input-container');
              if (inputContainer) {
                inputContainer.style.position = "absolute";
                inputContainer.style.bottom = "0";
                inputContainer.style.width = "100%";
                inputContainer.style.zIndex = "10";
              }
            }
          }
        };
        
        // Apply immediately and with slight delay to ensure all elements are ready
        applyOrientationStyles();
        setTimeout(applyOrientationStyles, 300);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
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
      
      // Force clear ALL styles
      chatContainer.setAttribute('style', '');
      
      // Apply necessary styles directly to container
      if (isMobile) {
        chatContainer.style.flex = '1';
        chatContainer.style.borderRadius = '0';
        chatContainer.style.display = 'flex';
        chatContainer.style.flexDirection = 'column';
        chatContainer.style.height = '100%';
        chatContainer.style.position = 'relative';
        chatContainer.style.overflow = 'hidden';
      }
    }
  
    const chatIframe = document.createElement("iframe");
    
    // Add a unique identifier to force cache refresh
    const cacheBreaker = new Date().getTime();
    chatIframe.setAttribute(
      "src",
      `https://www.twitch.tv/embed/${normalizedUsername}/chat?darkpopout&parent=localhost&parent=chadderai.vercel.app&mobile=true&t=${cacheBreaker}`
    );
    chatIframe.setAttribute("title", `${normalizedUsername} chat`);
    
    // Apply styles directly - these will override any CSS
    chatIframe.style.width = "100%";
    chatIframe.style.border = "none";
    
    // Set different height for mobile vs desktop
    if (isMobile) {
      chatIframe.style.height = "calc(100% - 50px)";
      chatIframe.style.position = "absolute";
      chatIframe.style.top = "0";
      chatIframe.style.left = "0";
      chatIframe.style.right = "0";
      chatIframe.style.bottom = "50px"; // Leave space for the input
      chatIframe.style.zIndex = "5";
    } else {
      chatIframe.style.height = "100%";
    }
    
    chatIframe.setAttribute("scrolling", "yes");
    
    if (chatContainer) {
      chatContainer.appendChild(chatIframe);
    }

    // For mobile, ensure styles and layout are correct
    if (isMobile) {
      // Force the chat input container to be correctly positioned
      const inputContainer = document.querySelector('.chat-input-container');
      if (inputContainer) {
        inputContainer.style.height = isPortrait ? '50px' : '40px';
        inputContainer.style.padding = isPortrait ? '8px' : '4px 8px';
        inputContainer.style.background = '#18181b';
        inputContainer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
        inputContainer.style.display = 'flex';
        inputContainer.style.alignItems = 'center';
        inputContainer.style.gap = '8px';
        inputContainer.style.width = '100%';
        inputContainer.style.position = 'absolute';
        inputContainer.style.bottom = '0';
        inputContainer.style.left = '0';
        inputContainer.style.right = '0';
        inputContainer.style.zIndex = '10';
      }

      // Force iframe refresh on orientation changes
      const orientationHandler = () => {
        const currentIsPortrait = window.innerHeight > window.innerWidth;
        
        // Delay to ensure container layout is updated
        setTimeout(() => {
          if (window.innerWidth <= 768) {
            if (chatIframe) {
              chatIframe.style.height = "calc(100% - 50px)";
              
              // Force refresh to adjust to new container size
              const newCacheBreaker = new Date().getTime();
              const src = chatIframe.getAttribute("src").split('&t=')[0];
              chatIframe.setAttribute("src", `${src}&t=${newCacheBreaker}`);
            }
            
            // Update input container height
            if (inputContainer) {
              inputContainer.style.height = currentIsPortrait ? '50px' : '40px';
              inputContainer.style.padding = currentIsPortrait ? '8px' : '4px 8px';
            }
          } else {
            if (chatIframe) chatIframe.style.height = "100%";
          }
        }, 300);
      };
      
      // Remove any existing event listeners before adding new ones
      window.removeEventListener('resize', orientationHandler);
      window.addEventListener('resize', orientationHandler);

      // Ensure layout is correct after everything has loaded
      setTimeout(() => {
        if (chatIframe && chatContainer) {
          chatIframe.style.height = "calc(100% - 50px)";
          chatIframe.style.position = "absolute";
          chatContainer.style.position = "relative";
          
          // Force refresh one more time
          const finalCacheBreaker = new Date().getTime();
          const src = chatIframe.getAttribute("src").split('&t=')[0];
          chatIframe.setAttribute("src", `${src}&t=${finalCacheBreaker}`);
        }
      }, 1000);
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

  return (
    <div className="stream-page" style={isMobile ? {
      padding: '0',
      margin: '0',
      minHeight: '100vh',
      backgroundColor: '#0e0e10',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      paddingBottom: '120px'
    } : {}}>
      <h2 className="stream-title" style={isMobile ? {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        height: '40px',
        padding: '0.5rem 1rem',
        margin: '0',
        fontSize: '1rem',
        background: 'rgba(14, 14, 16, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: '1000',
        display: 'flex',
        alignItems: 'center'
      } : {}}>Watching {username}&apos;s Stream</h2>
      
      <div className="stream-layout" style={isMobile ? 
        isPortrait ? {
          flexDirection: 'column',
          height: '100vh',
          paddingTop: '40px',
          position: 'fixed',
          width: '100%',
          zIndex: '900'
        } : {
          flexDirection: 'row',
          height: '100vh',
          paddingTop: '40px',
          position: 'fixed',
          width: '100%',
          zIndex: '900'
        } : {}}>
        <div className="stream-video-container" style={isMobile ? 
          isPortrait ? {
            width: '100%',
            height: '40vh',
            position: 'relative',
            zIndex: '900',
            minHeight: '150px'
          } : {
            width: '65%',
            height: 'calc(100vh - 40px)',
            position: 'relative',
            zIndex: '900',
            minHeight: 'unset'
          } : {}}>
          <div id="twitch-embed"></div>
        </div>

        <div className="stream-right-container" style={isMobile ? 
          isPortrait ? {
            flex: '1',
            width: '100%',
            height: 'calc(60vh - 40px)',
            position: 'relative',
            background: '#18181b',
            display: 'flex',
            flexDirection: 'column'
          } : {
            width: '35%',
            height: 'calc(100vh - 40px)',
            position: 'relative',
            background: '#18181b',
            display: 'flex',
            flexDirection: 'column'
          } : {}}>
          <div className="stream-chat-container" id="twitch-chat" style={isMobile ? {
            flex: '1',
            borderRadius: '0',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative'
          } : {}}>
            {/* Chat iframe will be injected here */}
            {isMobile && (
              <div className="chat-input-container" style={{
                height: isPortrait ? '50px' : '40px',
                padding: isPortrait ? '8px' : '4px 8px',
                background: '#18181b',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                position: 'absolute',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '10'
              }} id="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Send a message"
                  aria-label="Chat input"
                  style={{
                    flex: '1',
                    height: isPortrait ? '36px' : '32px',
                    padding: '0 12px',
                    borderRadius: '18px',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#efeff1',
                    fontSize: '14px'
                  }}
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
                  style={{
                    height: isPortrait ? '36px' : '32px',
                    padding: '0 12px',
                    borderRadius: '18px',
                    border: 'none',
                    background: '#9147ff',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Show these sections on all devices */}
      <div className="info-row" style={isMobile ? {
        marginTop: isPortrait ? '100vh' : '0',
        marginLeft: isPortrait ? '0' : '65%',
        position: 'relative',
        zIndex: '800',
        flexDirection: 'column',
        padding: '0.5rem',
        gap: '0.5rem',
        display: 'block'
      } : {}}>
        {streamerInfo.bio && (
          <div className="streamer-bio-card" style={isMobile ? {
            width: '100%',
            margin: '0',
            borderRadius: '8px'
          } : {}}>
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

        <div className="top-supporters-card" style={isMobile ? {
          width: '100%',
          margin: '0',
          borderRadius: '8px'
        } : {}}>
          <h3>💎 Top Supporters</h3>
          <div className="supporters-list">
            {topSupporters.map((supporter, index) => (
              <div 
                key={`${supporter.username}-${supporter.amount}-${Date.now()}`} 
                className="supporter-item animate-update"
              >
                <span className="rank">#{index + 1}</span>
                <span className="username">{supporter.username}</span>
                <span className="amount">{supporter.amount} 💎</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="vote-stats-container" style={isMobile ? {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
        padding: '0.5rem',
        marginTop: isPortrait ? '0.5rem' : '0',
        marginLeft: isPortrait ? '0' : '65%',
        position: 'relative',
        zIndex: '800'
      } : {}}>
        <div className="stat-box" style={isMobile ? { padding: '0.75rem' } : {}}>
          <p style={isMobile ? { fontSize: '0.8rem' } : {}}>Votes Today</p>
          <h4 style={isMobile ? { fontSize: '1.2rem' } : {}}>{voteStats.today}</h4>
        </div>
        <div className="stat-box" style={isMobile ? { padding: '0.75rem' } : {}}>
          <p style={isMobile ? { fontSize: '0.8rem' } : {}}>Votes This Week</p>
          <h4 style={isMobile ? { fontSize: '1.2rem' } : {}}>{voteStats.week}</h4>
        </div>
        <div className="stat-box" style={isMobile ? { padding: '0.75rem' } : {}}>
          <p style={isMobile ? { fontSize: '0.8rem' } : {}}>All Time Votes</p>
          <h4 style={isMobile ? { fontSize: '1.2rem' } : {}}>{voteStats.allTime}</h4>
        </div>
      </div>

      <div className="leaderboard-info-card" style={isMobile ? {
        margin: '0.5rem',
        padding: '0.75rem',
        marginLeft: isPortrait ? '0.5rem' : '65%',
        position: 'relative',
        zIndex: '800'
      } : {}}>
        <h3>🏆 Current Competition</h3>
        <div className="leaderboard-stats" style={isMobile ? {
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem'
        } : {}}>
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

      <div 
        className={`floating-vote-container ${isVotePaneCollapsed ? 'collapsed' : ''}`}
        style={isMobile ? {
          position: 'sticky',
          bottom: '0',
          padding: '0.75rem',
          marginLeft: isPortrait ? '0' : '65%',
          zIndex: '800'
        } : {}}
      >
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
            
            {/* Add the WatchAdButton component */}
            <div className="earn-more-gems">
              <WatchAdButton onGemsEarned={refreshUserCredits} />
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