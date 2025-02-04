import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import InsufficientCreditsModal from '../components/InsufficientCreditsModal';


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

  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      await fetchUserCredits();
      await fetchVoteStats();
      await getUserIP();
      await fetchLeaderboardData();
      await fetchTotalDonations();
      await fetchStreamerInfo();
      await fetchTopSupporters();
      setupTwitchEmbed();
      setupTwitchChatEmbed();
      setLoading(false);
    };

    initializePage();

    // Set up real-time subscriptions
    const subscriptionSubscription = supabase
      .channel('subscriptions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_revenue'
        },
        () => {
          fetchTotalDonations();
        }
      )
      .subscribe();

    // Add real-time subscription for votes
    const votesSubscription = supabase
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
          fetchTopSupporters();
          fetchVoteStats();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(subscriptionSubscription);
      supabase.removeChannel(votesSubscription);
    };
  }, [normalizedUsername]);

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
      parent: ["localhost"],
    });

    embedContainer.style.width = "100%";
    embedContainer.style.height = "100%";
  };

  const setupTwitchChatEmbed = () => {
    const chatContainer = document.getElementById("twitch-chat");
    if (chatContainer) chatContainer.innerHTML = "";
  
    const chatIframe = document.createElement("iframe");
    chatIframe.setAttribute(
      "src",
      `https://www.twitch.tv/embed/${normalizedUsername}/chat?parent=localhost`
    );
    chatIframe.setAttribute("title", `${normalizedUsername} chat`);
    chatIframe.style.width = "100%";
    chatIframe.style.height = "100%"; // Ensures it takes full space
    chatIframe.style.border = "none";
    chatIframe.setAttribute("scrolling", "no");
  
    chatContainer.appendChild(chatIframe);
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
      // First get the access token - you'll need to set these up in your environment variables
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
      
      const tokenResponse = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
        method: 'POST'
      });
      const tokenData = await tokenResponse.json();
      
      // Then fetch the user info
      const response = await fetch(`https://api.twitch.tv/helix/users?login=${normalizedUsername}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${tokenData.access_token}`
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

  return (
    <div className="stream-page">
      <h2 className="stream-title">Watching {username}&apos;s Stream</h2>
      
      <div className="stream-layout">
        <div className="stream-video-container">
          <div id="twitch-embed" style={{ width: '100%', height: '100%' }}></div>
        </div>

        <div className="stream-right-container">
          <div className="stream-chat-container" id="twitch-chat">
            {/* Chat will be injected here by setupTwitchChatEmbed */}
          </div>
        </div>
      </div>

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
          <h3>🏆 Top Supporters</h3>
          <div className="supporters-list">
            {topSupporters.map((supporter, index) => (
              <div 
                key={`${supporter.username}-${supporter.amount}-${Date.now()}`} 
                className="supporter-item animate-update"
              >
                <span className="rank">#{index + 1}</span>
                <span className="username">{supporter.username}</span>
                <span className="amount">{supporter.amount} 🪙</span>
              </div>
            ))}
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
            {[5, 25, 50, 100, 200].map((amount) => (
              <button
                key={amount}
                className={`vote-amount-button ${selectedAmount === amount ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedAmount(amount);
                  setCustomAmount('');
                }}
              >
                {amount} 🪙
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
              <span className="custom-amount-icon">🪙</span>
            </div>
          </div>

          <button 
            className={`vote-submit-button ${voteSuccess ? 'success' : ''}`}
            onClick={handleVote} 
            disabled={isVoting || errorMessage === "Please log in to continue."}
          >
            {isVoting ? (
              `Processing Vote (${selectedAmount} 🪙)`
            ) : voteSuccess ? (
              `Vote Successful! (${selectedAmount} 🪙)`
            ) : (
              `👍 Vote with ${selectedAmount} 🪙`
            )}
          </button>

          <p className="credit-balance">
            {isVoting ? (
              `Processing... Current Balance: ${credits.available} 🪙`
            ) : errorMessage ? (
              `Error: ${errorMessage}`
            ) : (
              `Available Credits: ${credits.available} 🪙`
            )}
          </p>
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