import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import InsufficientCreditsModal from '../../components/InsufficientCreditsModal';

// Cache for Twitch tokens and streamer info
const cache = {
  twitchToken: {
    token: null,
    expiresAt: null
  },
  streamerInfo: {
    data: {},
    timestamp: {},
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
  }
};

const StreamPage = () => {
  const { username } = useParams();
  const normalizedUsername = username.toLowerCase();
  const [pageData, setPageData] = useState({
    voteStats: { today: 0, week: 0, allTime: 0 },
    credits: { available: 0 },
    leaderboardData: { endTime: null, prizePool: 0 },
    totalDonations: 0,
    streamerInfo: { bio: '', profileImageUrl: '' },
    topSupporters: []
  });
  const [selectedAmount, setSelectedAmount] = useState(5);
  const [userIp, setUserIp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const navigate = useNavigate();
  const STREAMER_PAYOUT_PERCENTAGE = 0.55;
  const [customAmount, setCustomAmount] = useState('');
  const [isVotePaneCollapsed, setIsVotePaneCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  // Memoized function to get Twitch token
  const getTwitchToken = useCallback(async () => {
    // Check if we have a valid cached token
    if (cache.twitchToken.token && cache.twitchToken.expiresAt > Date.now()) {
      return cache.twitchToken.token;
    }

    try {
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
      
      const tokenResponse = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: 'POST' }
      );
      const tokenData = await tokenResponse.json();
      
      // Cache the token with expiration
      cache.twitchToken = {
        token: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000)
      };
      
      return tokenData.access_token;
    } catch (error) {
      console.error('Error getting Twitch token:', error);
      throw error;
    }
  }, []);

  // Memoized function to fetch streamer info with caching
  const fetchStreamerInfo = useCallback(async () => {
    // Check cache first
    if (
      cache.streamerInfo.data[normalizedUsername] &&
      cache.streamerInfo.timestamp[normalizedUsername] &&
      Date.now() - cache.streamerInfo.timestamp[normalizedUsername] < cache.streamerInfo.CACHE_DURATION
    ) {
      return cache.streamerInfo.data[normalizedUsername];
    }

    try {
      const accessToken = await getTwitchToken();
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      const response = await fetch(`https://api.twitch.tv/helix/users?login=${normalizedUsername}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const data = await response.json();
      if (data.data && data.data[0]) {
        const streamerInfo = {
          bio: data.data[0].description,
          profileImageUrl: data.data[0].profile_image_url
        };

        // Update cache
        cache.streamerInfo.data[normalizedUsername] = streamerInfo;
        cache.streamerInfo.timestamp[normalizedUsername] = Date.now();

        return streamerInfo;
      }
      return null;
    } catch (error) {
      console.error('Error fetching streamer info:', error);
      return null;
    }
  }, [normalizedUsername]);

  // Batch fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      // Fetch all data in parallel
      const [
        userCredits,
        voteStats,
        ip,
        leaderboard,
        donations,
        streamerInfo,
        supporters
      ] = await Promise.all([
        // User credits
        supabase
          .from("users")
          .select("monthly_credits, additional_credits")
          .eq("id", user?.id)
          .single()
          .then(({ data }) => ({
            available: (data?.monthly_credits || 0) + (data?.additional_credits || 0)
          }))
          .catch(() => ({ available: 0 })),

        // Vote stats
        supabase
          .from("votes")
          .select("vote_amount, created_at")
          .eq("streamer", normalizedUsername)
          .then(({ data }) => {
            const today = new Date();
            const startOfToday = new Date(today.setHours(0, 0, 0, 0));
            const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
            
            return data.reduce((acc, vote) => {
              const voteDate = new Date(vote.created_at);
              acc.allTime += vote.vote_amount;
              if (voteDate >= startOfToday) acc.today += vote.vote_amount;
              if (voteDate >= startOfWeek) acc.week += vote.vote_amount;
              return acc;
            }, { today: 0, week: 0, allTime: 0 });
          })
          .catch(() => ({ today: 0, week: 0, allTime: 0 })),

        // IP address
        fetch("https://api64.ipify.org?format=json")
          .then(res => res.json())
          .then(data => data.ip)
          .catch(() => ""),

        // Leaderboard data
        supabase
          .from("leaderboard_settings")
          .select("*")
          .single()
          .then(({ data }) => ({
            endTime: data?.end_time,
            prizePool: data?.prize_pool || 0
          }))
          .catch(() => ({ endTime: null, prizePool: 0 })),

        // Total donations
        supabase
          .from("donations")
          .select("amount")
          .eq("streamer", normalizedUsername)
          .then(({ data }) => 
            data?.reduce((sum, donation) => sum + donation.amount, 0) || 0
          )
          .catch(() => 0),

        // Streamer info (using cached function)
        fetchStreamerInfo(),

        // Top supporters
        supabase
          .from("votes")
          .select("user_id, amount")
          .eq("streamer", normalizedUsername)
          .order("amount", { ascending: false })
          .limit(10)
          .then(({ data }) => data || [])
          .catch(() => [])
      ]);

      // Update all state at once
      setPageData({
        credits: userCredits,
        voteStats,
        leaderboardData: leaderboard,
        totalDonations: donations,
        streamerInfo: streamerInfo || { bio: '', profileImageUrl: '' },
        topSupporters: supporters
      });

      setUserIp(ip);

    } catch (error) {
      console.error("Error fetching data:", error);
      setErrorMessage("Failed to load stream data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [normalizedUsername, fetchStreamerInfo]);

  useEffect(() => {
    let mounted = true;
    let subscriptionSubscription = null;
    let votesSubscription = null;

    const initializePage = async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        window.scrollTo(0, 0);
        await fetchAllData();
        
        if (mounted) {
          setupTwitchEmbed();
          setupTwitchChatEmbed();
        }
      } catch (error) {
        console.error('Error initializing page:', error);
        if (mounted) {
          setErrorMessage('Failed to load stream data. Please refresh the page.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          window.scrollTo(0, 0);
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
            fetchAllData();
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
            fetchAllData();
          }
        }
      )
      .subscribe();

    initializePage();

    return () => {
      mounted = false;
      subscriptionSubscription?.unsubscribe();
      votesSubscription?.unsubscribe();
    };
  }, [normalizedUsername, fetchAllData]);

  // Lazy load Twitch embed
  const setupTwitchEmbed = useCallback(() => {
    if (!window.Twitch || !window.Twitch.Embed) {
      const script = document.createElement('script');
      script.src = "https://embed.twitch.tv/embed/v1.js";
      script.async = true;
      script.onload = () => {
        createTwitchEmbed();
      };
      document.body.appendChild(script);
    } else {
      createTwitchEmbed();
    }
  }, [normalizedUsername]);

  // Memoized function to create Twitch embed
  const createTwitchEmbed = useCallback(() => {
    try {
      const embed = new window.Twitch.Embed("twitch-embed", {
        width: "100%",
        height: "100%",
        channel: normalizedUsername,
        layout: "video",
        autoplay: false,
        parent: ["localhost", "your-domain.com"]  // Replace with your actual domain
      });

      embed.addEventListener(window.Twitch.Embed.VIDEO_READY, () => {
        const player = embed.getPlayer();
        player.setVolume(0.5);
      });
    } catch (error) {
      console.error('Error creating Twitch embed:', error);
      setErrorMessage('Failed to load Twitch stream. Please refresh the page.');
    }
  }, [normalizedUsername]);

  // Lazy load Twitch chat
  const setupTwitchChatEmbed = useCallback(() => {
    try {
      const chatIframe = document.createElement('iframe');
      chatIframe.src = `https://www.twitch.tv/embed/${normalizedUsername}/chat?parent=localhost&parent=your-domain.com`;  // Replace with your actual domain
      chatIframe.height = "100%";
      chatIframe.width = "100%";
      
      const chatContainer = document.getElementById('twitch-chat-embed');
      if (chatContainer) {
        chatContainer.innerHTML = '';
        chatContainer.appendChild(chatIframe);
      }
    } catch (error) {
      console.error('Error setting up Twitch chat:', error);
    }
  }, [normalizedUsername]);

  // Add window resize handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ... rest of the component code ...

  return (
    <div className="stream-page">
      {/* ... existing JSX ... */}
    </div>
  );
};

export default StreamPage; 