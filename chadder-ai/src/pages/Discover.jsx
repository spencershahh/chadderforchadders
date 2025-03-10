import { useEffect, useState, useRef } from "react";
import { fetchStreamers } from "../api/twitch";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import styles from './Discover.module.css';
import { FaLock } from 'react-icons/fa';

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
  const nominationSectionRef = useRef(null);
  const streamersGridRef = useRef(null);

  const FREE_STREAMER_LIMIT = 5;
  const [showAuthModal, setShowAuthModal] = useState(false);

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

  // Add fallback streamer data in case all APIs fail
  const FALLBACK_STREAMERS = [
    { 
      user_id: '1', 
      user_login: 'drewskisquad22', 
      user_name: 'drewskisquad22', 
      profile_image_url: null, 
      title: "Offline", 
      type: "offline", 
      viewer_count: 0, 
      game_name: "N/A", 
      thumbnail_url: OFFLINE_THUMBNAIL,
      bio: "Twitch Streamer" 
    },
    { 
      user_id: '2', 
      user_login: 'fatstronaut', 
      user_name: 'fatstronaut', 
      profile_image_url: null, 
      title: "Offline", 
      type: "offline", 
      viewer_count: 0, 
      game_name: "N/A", 
      thumbnail_url: OFFLINE_THUMBNAIL,
      bio: "Twitch Streamer" 
    },
    { 
      user_id: '3', 
      user_login: 'ferretsoftware', 
      user_name: 'ferretsoftware', 
      profile_image_url: null, 
      title: "Offline", 
      type: "offline", 
      viewer_count: 0, 
      game_name: "N/A", 
      thumbnail_url: OFFLINE_THUMBNAIL,
      bio: "Twitch Streamer" 
    },
    { 
      user_id: '4', 
      user_login: 'fuslie', 
      user_name: 'fuslie', 
      profile_image_url: null, 
      title: "Offline", 
      type: "offline", 
      viewer_count: 0, 
      game_name: "N/A", 
      thumbnail_url: OFFLINE_THUMBNAIL,
      bio: "Twitch Streamer" 
    },
    { 
      user_id: '5', 
      user_login: 'hanner', 
      user_name: 'hanner', 
      profile_image_url: null, 
      title: "Offline", 
      type: "offline", 
      viewer_count: 0, 
      game_name: "N/A", 
      thumbnail_url: OFFLINE_THUMBNAIL,
      bio: "Twitch Streamer" 
    }
  ];

  const fetchTotalDonations = async () => {
    try {
      console.log('Fetching total donations...');
      const { data, error } = await supabase
        .rpc('calculate_weekly_donation_bomb');

      if (error) {
        console.error('Error calculating donation bomb:', error);
        throw error;
      }
      
      console.log('New donation bomb amount:', data);
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
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    // Check user authentication state
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error checking auth:', error);
        } else if (currentUser) {
          console.log('User is authenticated:', currentUser.id);
          setUser(currentUser);
        } else {
          console.log('No authenticated user');
          setUser(null);
        }
      } catch (error) {
        console.error('Unexpected error checking auth:', error);
      }
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    const loadStreamers = async () => {
      try {
        console.log('Starting to load streamers...');
        setStreamers([...FALLBACK_STREAMERS]); // Set fallback streamers immediately so UI shows something
        
        try {
          // Try to get streamers from API
          const streamersData = await fetchStreamers();
          console.log('Loaded streamers from API:', streamersData);
          
          if (streamersData && streamersData.length > 0) {
            setStreamers(streamersData);
          } else {
            console.warn('API returned empty streamers array, using fallback data');
          }
        } catch (apiError) {
          console.error('Error loading streamers from API:', apiError);
          // No need to set fallback streamers again as we already did at the start
        }
      } catch (error) {
        console.error('Critical error in loadStreamers:', error);
      }
    };

    loadStreamers();
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
        .select("streamer, amount");

      if (error) throw error;

      return votes.reduce((acc, vote) => {
        acc[vote.streamer] = (acc[vote.streamer] || 0) + vote.amount;
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
      // Check if user is authenticated
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
        setShowAuthModal(true);
        return;
      }

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
            nominated_by: currentUser.id
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

  // Add subscription listener in useEffect
  useEffect(() => {
    fetchTotalDonations();
    
    // Listen for prize pool and subscription changes
    const prizePoolSubscription = supabase
      .channel('prize-pool-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_pool'
        },
        (payload) => {
          console.log('Prize pool update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    const subscriptionSubscription = supabase
      .channel('subscriptions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_revenue'
        },
        (payload) => {
          console.log('Subscription update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(prizePoolSubscription);
      supabase.removeChannel(subscriptionSubscription);
    };
  }, []);

  const scrollToNomination = () => {
    nominationSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAuthPrompt = () => {
    navigate('/signup');
  };

  const handleLiveNowClick = () => {
    setStreamersFilter('online');
    streamersGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTotalStreamersClick = () => {
    setStreamersFilter('all');
    streamersGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const renderStreamerCard = (streamer, index) => {
    // Early return if streamer data is invalid
    if (!streamer || !streamer.user_name) {
      console.error('Invalid streamer data:', streamer);
      return null;
    }
    
    // Only lock cards if user is not logged in AND index is beyond the free limit
    const isLocked = !user && index >= FREE_STREAMER_LIMIT;
    const votes = streamerVotes[streamer.user_login] || 0;

    // Generate a fallback profile image if none exists
    const getProfileImageFallback = () => {
      if (streamer.initials) {
        return `https://ui-avatars.com/api/?name=${streamer.initials}&background=random&color=fff&size=300`;
      }
      
      // Extract initials from the username if not provided
      const initials = streamer.user_name.substring(0, 2).toUpperCase();
      return `https://ui-avatars.com/api/?name=${initials}&background=random&color=fff&size=300`;
    };
    
    // Get appropriate thumbnail
    const getThumbnail = () => {
      if (streamer.type === "live" && streamer.thumbnail_url) {
        return streamer.thumbnail_url;
      }
      return streamer.offline_image_url || OFFLINE_THUMBNAIL;
    };

    return (
      <div 
        key={streamer.user_id || `streamer-${index}`}
        className={`${styles.streamerCard} ${isLocked ? styles.lockedCard : ''}`}
        onClick={() => isLocked ? handleAuthPrompt() : handleCardClick(streamer.user_login)}
      >
        <div className={styles.thumbnailWrapper}>
          <img
            className={styles.streamerThumbnail}
            src={getThumbnail()}
            alt={`${streamer.user_name}'s stream`}
            onError={(e) => {
              console.log(`Failed to load thumbnail for ${streamer.user_name}, using fallback`);
              e.target.src = "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=Stream+Unavailable";
            }}
          />
          {streamer.type === "live" && <span className={styles.liveBadge}>LIVE</span>}
        </div>
        <div className={styles.streamerCardContent}>
          <img
            className={styles.streamerProfileImage}
            src={streamer.profile_image_url || getProfileImageFallback()}
            alt={`${streamer.user_name}'s profile`}
            onError={(e) => {
              console.log(`Failed to load profile image for ${streamer.user_name}, using fallback`);
              e.target.src = getProfileImageFallback();
            }}
          />
          <div className={styles.streamerInfo}>
            <h3 className={styles.streamerName}>{streamer.user_name}</h3>
            {streamer.type === "live" && (
              <span className={styles.viewerCount}>{streamer.viewer_count || 0} viewers</span>
            )}
            <span className={styles.gameName}>{streamer.game_name || 'N/A'}</span>
            {votes > 0 && <span className={styles.votesBadge}>{votes} votes this week</span>}
          </div>
        </div>
        {isLocked && (
          <div className={styles.lockOverlay} onClick={handleAuthPrompt}>
            <FaLock className={styles.lockIcon} />
            <p className={styles.lockMessage}>Create an account to view more streamers</p>
          </div>
        )}
      </div>
    );
  };

  // Add glow effect
  useEffect(() => {
    const container = document.querySelector(`.${styles.discoverContainer}`);
    const handleMouseMove = (e) => {
      if (container) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        container.style.setProperty('--mouse-x', `${x}px`);
        container.style.setProperty('--mouse-y', `${y}px`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className={styles.discoverContainer}>
      <div className="glow-effect"></div>
      <div className={styles.discoverHeader}>
        <h1 className={styles.discoverTitle}>
          Discover Streamers
        </h1>
        <p className={styles.discoverSubtitle}>
          Discovering Hidden Gems, One Stream at a Time.
        </p>

        <div className={styles.statsContainer}>
          <div className={styles.statsGrid}>
            <div 
              className={`${styles.statItem} ${styles.clickable}`}
              onClick={handleLiveNowClick}
              role="button"
              tabIndex={0}
            >
              <span className={styles.statNumber}>
                {streamers.filter(s => s.type === "live").length}
              </span>
              <span className={styles.statLabel}>LIVE NOW</span>
            </div>
            <div 
              className={`${styles.statItem} ${styles.clickable}`}
              onClick={handleTotalStreamersClick}
              role="button"
              tabIndex={0}
            >
              <span className={styles.statNumber}>
                {streamers.length}
              </span>
              <span className={styles.statLabel}>TOTAL STREAMERS</span>
            </div>
            <div className={`${styles.statItem} ${styles.prizePool}`}>
              <span className={styles.statNumber}>
                <span className={styles.currency}>$</span>
                {totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={styles.statLabel}>PRIZE POOL</span>
              <div className={styles.prizePoolTimer} aria-label="Time until payout">
                {timeUntilPayout}
              </div>
            </div>
          </div>
        </div>

        {topStreamer && (
          <div 
            className={styles.topStreamerCard}
            onClick={() => navigate(`/stream/${topStreamer.user_login}`)}
            role="button"
            tabIndex={0}
            aria-label={`View ${topStreamer.user_name}'s stream`}
          >
            <div className={styles.topStreamerBadge}>
              <span>🏆 Top Streamer This Week</span>
            </div>

            <img 
              src={topStreamer.profile_image_url} 
              alt={`${topStreamer.user_name} profile`} 
              className={styles.topStreamerProfileImage}
              loading="lazy"
            />
            
            <div className={styles.topStreamerInfo}>
              <h3 className={styles.topStreamerName}>{topStreamer.user_name}</h3>
              
              <div className={styles.topStreamerStats}>
                <span className={styles.votesBadge}>
                  {topStreamer.weeklyVotes} votes
                </span>
                {topStreamer.type === "live" && (
                  <>
                    <span className={styles.liveBadge}>LIVE</span>
                    <span className={styles.viewerCount}>
                      {topStreamer.viewer_count?.toLocaleString()} viewers
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={styles.searchControls}>
          <div className={styles.searchWrapper}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search streamers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search streamers"
            />
            <div className={styles.filterControls}>
              <select
                className={styles.sortSelect}
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                aria-label="Sort streamers"
              >
                <option value="viewers-high">Viewers (High)</option>
                <option value="viewers-low">Viewers (Low)</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="popular">Most Popular</option>
              </select>
              
              <div 
                className={`${styles.toggleSwitch} ${streamersFilter === 'online' ? styles.online : styles.all}`}
                onClick={() => setStreamersFilter(streamersFilter === 'online' ? 'all' : 'online')}
                role="button"
                tabIndex={0}
                aria-label="Toggle online streamers"
              >
                <div className={styles.toggleSwitchInner}>
                  <span className={`${styles.toggleOption} ${streamersFilter === 'online' ? styles.active : ''}`}>
                    Online
                  </span>
                  <span className={`${styles.toggleOption} ${streamersFilter === 'all' ? styles.active : ''}`}>
                    All
                  </span>
                  <div className={styles.toggleSlider} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={scrollToNomination}
          className={styles.nominateButton}
          aria-label="Go to nominate streamer section"
        >
          Nominate a Streamer
        </button>
      </div>

      <div className={styles.streamersSection}>
        <h2 className={styles.streamersTitle}>
          Featured Streamers
        </h2>
        <p className={styles.streamersSubtitle}>
        Find streamers, join the conversation, and vote for your favorites!
        </p>
        {!user && (
          <div className={styles.gatedContentMessage}>
            <h3>Want to see more amazing streamers?</h3>
            <p>Create a free account to unlock our full catalog of talented streamers and join our community!</p>
            <button className={styles.signUpButton} onClick={handleAuthPrompt}>
              Sign Up Now
            </button>
          </div>
        )}
      </div>

      <div className={styles.streamerGrid} ref={streamersGridRef}>
        {sortedStreamers.map((streamer, index) => renderStreamerCard(streamer, index))}
      </div>

      <div className={styles.sectionDivider} />

      <div className={styles.nominationSection} ref={nominationSectionRef}>
        <h2 className={styles.nominationTitle}>
          Nominate a Streamer
        </h2>
        <p className={styles.nominationSubtitle}>
          Know an amazing streamer who should be part of our community? 
          Nominate them by submitting their Twitch channel URL below.
        </p>
        <form onSubmit={handleNomination} className={styles.nominationForm}>
          <input
            type="text"
            value={nominationUrl}
            onChange={(e) => setNominationUrl(e.target.value)}
            placeholder="Enter Twitch channel URL (e.g., https://twitch.tv/username)"
            className={styles.nominationInput}
            aria-label="Streamer URL"
          />
          <button
            type="submit"
            className={styles.nominationSubmit}
            aria-label={user ? "Submit nomination" : "Login to nominate"}
            onClick={(e) => {
              if (!user) {
                e.preventDefault();
                navigate('/signup');
              }
            }}
          >
            {user ? "Submit Nomination" : "Login or Signup to Nominate a Streamer"}
          </button>
          {nominationStatus && (
            <div 
              className={`${styles.nominationStatus} ${
                nominationStatus.includes('Error') || nominationStatus.includes('already') 
                  ? styles.error 
                  : styles.success
              }`}
              role="alert"
            >
              {nominationStatus}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Discover;