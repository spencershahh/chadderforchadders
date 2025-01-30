import { useEffect, useState } from "react";
import { fetchStreamers } from "../api/twitch";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

const Discover = () => {
  const [user, setUser] = useState(null);
  const [streamers, setStreamers] = useState([]);
  const [streamerVotes, setStreamerVotes] = useState({});
  const [userBalance, setUserBalance] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [topStreamer, setTopStreamer] = useState(null);
  const [totalDonations, setTotalDonations] = useState(0);
  const [timeUntilPayout, setTimeUntilPayout] = useState('');
  const [nominationUrl, setNominationUrl] = useState('');
  const [nominationStatus, setNominationStatus] = useState('');
  const navigate = useNavigate();

  // Get user's preferences or default values
  const getUserPreferences = () => {
    if (user) {
      return {
        sortOption: localStorage.getItem(`sortPreference_${user.id}`) || "viewers-high",
        streamersFilter: localStorage.getItem(`streamersFilter_${user.id}`) || "all"
      };
    }
    return {
      sortOption: localStorage.getItem('sortPreference') || "viewers-high",
      streamersFilter: localStorage.getItem('streamersFilter') || "all"
    };
  };

  const [sortOption, setSortOption] = useState(getUserPreferences().sortOption);
  const [streamersFilter, setStreamersFilter] = useState(getUserPreferences().streamersFilter);

  const OFFLINE_THUMBNAIL = "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg";
  const DEFAULT_PROFILE_IMAGE = "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";

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
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        // Fetch streamers and votes
        const [streamersData, votesData] = await Promise.all([
          fetchStreamers(),
          fetchVotes()
        ]);

        setStreamers(streamersData);
        setStreamerVotes(votesData);

        // Find top streamer
        if (votesData) {
          const topStreamerLogin = Object.entries(votesData)
            .sort(([, a], [, b]) => b - a)[0]?.[0];
          
          const topStreamerData = streamersData.find(
            s => s.user_login.toLowerCase() === topStreamerLogin?.toLowerCase()
          );
          
          if (topStreamerData) {
            setTopStreamer({
              ...topStreamerData,
              weeklyVotes: votesData[topStreamerLogin] || 0
            });
          }
        }

        // Fetch user balance if logged in
        if (user) {
          const { data: balanceData } = await supabase
            .from('users')
            .select('credits')
            .eq('id', user.id)
            .single();
          
          setUserBalance(balanceData?.credits || 0);
        }

        await fetchTotalDonations();
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUntilPayout(updateTimeUntilReset());
    }, 1000); // Update every second instead of every minute

    setTimeUntilPayout(updateTimeUntilReset());

    return () => clearInterval(timer);
  }, []);

  const fetchVotes = async () => {
    try {
      const { data: votes, error } = await supabase
        .from("votes")
        .select("streamer, vote_amount");

      if (error) throw error;

      return votes.reduce((acc, vote) => {
        acc[vote.streamer] = (acc[vote.streamer] || 0) + vote.vote_amount;
        return acc;
      }, {});
    } catch (error) {
      console.error("Error fetching votes:", error);
      return {};
    }
  };

  const handleCardClick = (username) => {
    navigate(`/stream/${username.toLowerCase()}`);
  };

  // Filter and sort streamers
  const getSortedStreamers = () => {
    let filtered = [...streamers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(streamer => 
        streamer.user_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamer.game_name?.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    // Apply online/offline filter
    if (streamersFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamersFilter === 'online' ? 
          streamer.type === "live" : 
          streamer.type !== "live"
      );
    }

    // Apply sorting
    switch (sortOption) {
      case "viewers-high":
        return filtered.sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
      case "viewers-low":
        return filtered.sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0));
      case "alphabetical":
        return filtered.sort((a, b) => a.user_name.localeCompare(b.user_name));
      case "popular":
        return filtered.sort((a, b) => {
          const votesA = streamerVotes[a.user_login] || 0;
          const votesB = streamerVotes[b.user_login] || 0;
          return votesB - votesA;
        });
      default:
        return filtered;
    }
  };

  const sortedStreamers = getSortedStreamers();

  const updateSortOption = (value) => {
    setSortOption(value);
  };

  const updateOnlineFilter = (checked) => {
    setStreamersFilter(checked ? 'online' : 'all');
  };

  const handleNomination = async (e) => {
    e.preventDefault();
    
    try {
      // Basic URL validation
      if (!nominationUrl.includes('twitch.tv/')) {
        setNominationStatus('Please enter a valid Twitch URL');
        return;
      }

      // Extract streamer name from URL
      const streamerName = nominationUrl.split('twitch.tv/').pop().split('/')[0];
      
      const { data, error } = await supabase
        .from('nominations')
        .insert([
          {
            streamer_url: nominationUrl,
            streamer_name: streamerName,
            nominated_by: user?.id
          }
        ]);

      if (error) throw error;

      setNominationUrl('');
      setNominationStatus('Streamer successfully nominated!');
      setTimeout(() => setNominationStatus(''), 3000);

    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        setNominationStatus('This streamer has already been nominated');
      } else {
        setNominationStatus('Error submitting nomination');
        console.error('Nomination error:', error);
      }
    }
  };

  return (
    <div className="discover-container">
      <div className="discover-header">
        <h1>Discover Streamers</h1>
        <p>Find streamers, join the conversation, and vote for your favorites!</p>

        <div className="stats-container">
          <div className="stats-wrapper">
            <div className="stat-item">
              <span className="stat-number">{streamers.filter(s => s.type === "live").length}</span>
              <span className="stat-label">LIVE NOW</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-number">{streamers.length}</span>
              <span className="stat-label">TOTAL STREAMERS</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item prize-pool">
              <span className="stat-number">
                <span className="currency">$</span>
                {totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="stat-label">PRIZE POOL</span>
              <div className="prize-pool-timer">{timeUntilPayout}</div>
            </div>
          </div>
        </div>

        {topStreamer && (
          <div 
            className="top-streamer-card"
            onClick={() => navigate(`/stream/${topStreamer.user_login}`)}
            role="button"
            tabIndex={0}
            style={{
              background: 'rgba(20, 20, 20, 0.7)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              cursor: 'pointer',
              border: '1px solid rgba(145, 71, 255, 0.2)',
              transition: 'all 0.2s ease',
              maxWidth: '400px',
              margin: '20px auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 0 20px rgba(145, 71, 255, 0.15)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 0 30px rgba(145, 71, 255, 0.3)',
                border: '1px solid rgba(145, 71, 255, 0.4)'
              }
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '1rem',
              color: '#9147ff',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              <span>🏆</span>
              <span style={{
                background: 'linear-gradient(90deg, #9147ff, #6441a5)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Top Streamer This Week</span>
            </div>

            <img 
              src={topStreamer.profile_image_url} 
              alt={`${topStreamer.user_name} profile`} 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: '2px solid #9147ff',
                marginBottom: '8px',
                boxShadow: '0 0 15px rgba(145, 71, 255, 0.3)'
              }}
            />
            
            <h3 style={{
              margin: '0 0 4px 0',
              fontSize: '1.2rem',
              color: '#fff',
              fontWeight: '600'
            }}>{topStreamer.user_name}</h3>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: '#a8a8a8',
              fontSize: '0.9rem'
            }}>
              <span style={{ 
                color: '#9147ff', 
                fontWeight: 'bold',
                background: 'rgba(145, 71, 255, 0.1)',
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
                {topStreamer.weeklyVotes} votes
              </span>
              {topStreamer.type === "live" && (
                <>
                  <span>•</span>
                  <span style={{
                    background: '#ff0000',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    color: 'white'
                  }}>LIVE</span>
                  <span>•</span>
                  <span>{topStreamer.viewer_count?.toLocaleString()} viewers</span>
                </>
              )}
            </div>
          </div>
        )}
        <div className="search-controls" style={{ marginTop: '2rem' }}>
          <div className="search-bar" style={{ gap: '1rem', display: 'flex' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search streamers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="sort-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
            >
              <option value="viewers-high">Viewers (High)</option>
              <option value="viewers-low">Viewers (Low)</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
          
          <div className="toggle-wrapper">
            <div 
              className="toggle-switch" 
              data-state={streamersFilter === 'online' ? 'online' : 'all'}
              onClick={() => setStreamersFilter(streamersFilter === 'online' ? 'all' : 'online')}
            >
              <div className="toggle-switch-inner">
                <span className={`toggle-option ${streamersFilter === 'online' ? 'active' : ''}`}>
                  Online
                </span>
                <span className={`toggle-option ${streamersFilter === 'all' ? 'active' : ''}`}>
                  All
                </span>
                <div className="toggle-slider" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="streamer-grid">
        {sortedStreamers.length > 0 ? (
          sortedStreamers.map((streamer) => (
            <div
              key={streamer.id}
              className="streamer-card"
              onClick={() => handleCardClick(streamer.user_name)}
              role="button"
              tabIndex="0"
            >
              <div className="thumbnail-wrapper">
                {streamer.type === "live" && <span className="live-badge">LIVE</span>}
                <img
                  src={streamer.type === "live" ? 
                    streamer.thumbnail_url.replace("{width}", "320").replace("{height}", "180") : 
                    OFFLINE_THUMBNAIL
                  }
                  alt={streamer.user_name}
                  className="streamer-thumbnail"
                />
              </div>
              <div className="streamer-card-content">
                <img
                  src={streamer.profile_image_url}
                  alt={`${streamer.user_name}'s profile`}
                  className="streamer-profile-image"
                  onError={(e) => {
                    e.target.src = "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";
                  }}
                />
                <div className="streamer-info">
                  <div className="streamer-title">
                    {streamer.type === "live" ? streamer.title : "Offline"}
                  </div>
                  <div className="viewer-count">
                    {streamer.type === "live" ? 
                      `${streamer.viewer_count?.toLocaleString() || "0"} viewers` : 
                      "Currently Offline"
                    }
                  </div>
                  <div className="game-name">{streamer.game_name || "No Game Selected"}</div>
                  <div className="streamer-name">@{streamer.user_name}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-results">
            <p>No streamers found</p>
            <span className="no-results-subtitle">Try adjusting your search or filters</span>
          </div>
        )}
      </div>

      <div style={{
        width: '100%',
        height: '2px',
        background: 'linear-gradient(90deg, transparent, rgba(145, 71, 255, 0.5), transparent)',
        margin: '4rem 0 2rem',
      }} />

      <div className="nomination-section" style={{
        background: 'rgba(20, 20, 20, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '2rem',
        margin: '0 auto 4rem',
        maxWidth: '800px',
        border: '1px solid rgba(145, 71, 255, 0.2)',
        boxShadow: '0 4px 24px rgba(145, 71, 255, 0.1)',
      }}>
        <h2 style={{ 
          marginBottom: '1.5rem', 
          color: '#fff',
          textAlign: 'center',
          fontSize: '2rem',
          background: 'linear-gradient(90deg, #9147ff, #6441a5)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Nominate a Streamer
        </h2>
        <p style={{
          textAlign: 'center',
          color: '#a8a8a8',
          marginBottom: '2rem',
          maxWidth: '600px',
          margin: '0 auto 2rem',
        }}>
          Know an amazing streamer who should be part of our community? 
          Nominate them by submitting their Twitch channel URL below.
        </p>
        <form onSubmit={handleNomination} style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem',
          maxWidth: '500px',
          margin: '0 auto',
        }}>
          <input
            type="text"
            value={nominationUrl}
            onChange={(e) => setNominationUrl(e.target.value)}
            placeholder="Enter Twitch channel URL (e.g., https://twitch.tv/username)"
            style={{
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(145, 71, 255, 0.3)',
              background: 'rgba(0, 0, 0, 0.2)',
              color: '#fff',
              fontSize: '1rem',
              width: '100%',
              transition: 'all 0.2s ease',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'linear-gradient(90deg, #9147ff, #6441a5)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              ':hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(145, 71, 255, 0.3)',
              }
            }}
          >
            Submit Nomination
          </button>
          {nominationStatus && (
            <div style={{
              padding: '1rem',
              borderRadius: '8px',
              background: nominationStatus.includes('Error') || nominationStatus.includes('already') 
                ? 'rgba(255, 0, 0, 0.1)' 
                : 'rgba(0, 255, 0, 0.1)',
              color: nominationStatus.includes('Error') || nominationStatus.includes('already')
                ? '#ff4444'
                : '#44ff44',
              textAlign: 'center',
              fontSize: '0.9rem',
            }}>
              {nominationStatus}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Discover;