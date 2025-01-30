import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import InsufficientCreditsModal from '../components/InsufficientCreditsModal';


const StreamPage = () => {
  const { username } = useParams();
  const normalizedUsername = username.toLowerCase();
  const [voteStats, setVoteStats] = useState({ today: 0, week: 0, allTime: 0 });
  const [credits, setCredits] = useState({ monthly: 0, additional: 0 });
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

    // Set up real-time subscription for votes
    const votesSubscription = supabase
      .channel('votes-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes'
        },
        () => {
          // Refresh data when votes change
          fetchVoteStats();
          fetchTotalDonations();
          fetchTopSupporters();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(votesSubscription);
    };
  }, [normalizedUsername]);

  const calculateDonationBomb = (votes) => {
    const WACP = 0.0725; // Fixed WACP value
    const totalCredits = votes.reduce((sum, vote) => sum + vote.vote_amount, 0);
    return (totalCredits * WACP * 0.55).toFixed(2);
  };

  const fetchTotalDonations = async () => {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*');
      
      if (error) throw error;
      const donationBomb = calculateDonationBomb(data);
      setTotalDonations(parseFloat(donationBomb));
    } catch (error) {
      console.error('Error fetching total donations:', error);
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

      // First check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("monthly_credits, additional_credits")
        .eq("id", user.id);

      if (checkError) throw checkError;

      // If no user found, create one
      if (!existingUser || existingUser.length === 0) {
        const { data: newUser, error: insertError } = await supabase
          .from("users")
          .insert([
            {
              id: user.id,
              email: user.email,
              monthly_credits: 0,
              additional_credits: 0,
              created_at: new Date().toISOString()
            }
          ])
          .select("monthly_credits, additional_credits")
          .single();

        if (insertError) throw insertError;
        
        setCredits({
          monthly: newUser.monthly_credits || 0,
          additional: newUser.additional_credits || 0,
        });
        return;
      }

      // Use the first user record if multiple exist (shouldn't happen after cleanup)
      const userData = existingUser[0];
      setCredits({
        monthly: userData.monthly_credits || 0,
        additional: userData.additional_credits || 0,
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
        .select("vote_amount, created_at")
        .eq("streamer", normalizedUsername);

      if (error) throw error;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());

      let todayVotes = 0, weekVotes = 0, allTimeVotes = 0;

      data.forEach((vote) => {
        const voteDate = new Date(vote.created_at);
        allTimeVotes += vote.vote_amount;
        if (voteDate >= startOfToday) todayVotes += vote.vote_amount;
        if (voteDate >= startOfWeek) weekVotes += vote.vote_amount;
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
          vote_amount,
          users (
            display_name
          )
        `)
        .eq('streamer', normalizedUsername)
        .order('vote_amount', { ascending: false });

      if (error) throw error;

      // Group votes by display_name and sum amounts
      const aggregatedVotes = data.reduce((acc, vote) => {
        const displayName = vote.users?.display_name || 'Anonymous';
        acc[displayName] = (acc[displayName] || 0) + vote.vote_amount;
        return acc;
      }, {});

      // Convert to array and sort
      const sortedSupporters = Object.entries(aggregatedVotes)
        .map(([displayName, amount]) => ({ username: displayName, amount }))
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

      // First try to get the streamer, if not exists then create them
      let { data: streamerData, error: streamerError } = await supabase
        .from('streamers')
        .select('id')
        .eq('username', normalizedUsername)
        .single();

      // If streamer doesn't exist, create them
      if (!streamerData) {
        const { data: newStreamer, error: createError } = await supabase
          .from('streamers')
          .insert([
            {
              username: normalizedUsername,
              name: username,  // original username with case preserved
              votes: 0,
              created_at: new Date().toISOString()
            }
          ])
          .select()
          .single();

        if (createError) throw new Error("Failed to create streamer profile");
        streamerData = newStreamer;
      }

      // Check if user has enough credits
      const totalCredits = credits.monthly + credits.additional;
      if (totalCredits < selectedAmount) {
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

      // Create the vote with display_name
      const { error: voteError } = await supabase
        .from("votes")
        .insert([
          {
            user_id: user.id,
            streamer_id: streamerData.id,
            vote_amount: selectedAmount,
            vote_ip: userIp,
            vote_type: 'monthly',
            vote_status: 'success',
            vote_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            streamer: normalizedUsername,
            username: displayName // Use display_name instead of email
          },
        ]);

      if (voteError) throw voteError;

      // Update user's credits (use monthly credits first)
      let remainingAmount = selectedAmount;
      let newMonthlyCredits = credits.monthly;
      let newAdditionalCredits = credits.additional;

      if (remainingAmount <= credits.monthly) {
        newMonthlyCredits -= remainingAmount;
      } else {
        remainingAmount -= credits.monthly;
        newMonthlyCredits = 0;
        newAdditionalCredits -= remainingAmount;
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          monthly_credits: newMonthlyCredits,
          additional_credits: newAdditionalCredits,
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Update local state
      setCredits({
        monthly: newMonthlyCredits,
        additional: newAdditionalCredits,
      });
      await fetchVoteStats();
      setErrorMessage("");

      // After successful vote
      setVoteSuccess(true);
      setTimeout(() => setVoteSuccess(false), 2000); // Reset after 2 seconds
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
    <div className="stream-page glow-background">
      <h2 className="stream-title">Watching {username}&apos;s Stream</h2>
      
      <div className="stream-layout">
        <div className="stream-video-container">
          <div id="twitch-embed"></div>
        </div>

        <div className="stream-right-container">
          <div className="stream-chat-container">
            <iframe
              src={`https://www.twitch.tv/embed/${username}/chat?parent=localhost`}
              title={`${username} chat`}
            ></iframe>
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
              <div key={supporter.username} className="supporter-item">
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
          <h3 className="vote-title">Select Vote Amount:</h3>
          <div className="vote-buttons">
            {[5, 25, 50, 100, 200].map((amount) => (
              <button
                key={amount}
                className={`vote-amount-button ${
                  selectedAmount === amount ? "selected" : ""
                }`}
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
              `Processing... Current Balance: ${credits.monthly} 🪙 Monthly | ${credits.additional} 🪙 Additional`
            ) : errorMessage ? (
              `Error: ${errorMessage}`
            ) : (
              `Monthly Balance: ${credits.monthly} 🪙 | Additional Balance: ${credits.additional} 🪙`
            )}
          </p>
        </div>
      </div>

      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        requiredAmount={selectedAmount}
        currentCredits={credits.monthly + credits.additional}
        onPurchase={handlePurchaseCredits}
      />
    </div>
  );
};

export default StreamPage;