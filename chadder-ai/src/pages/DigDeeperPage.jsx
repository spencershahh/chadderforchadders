import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

const isDevelopment = typeof import.meta !== 'undefined' && 
  import.meta.env && 
  (import.meta.env.DEV || window.location.hostname === 'localhost');

const DigDeeperPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const controls = useAnimation();
  const [expandedBios, setExpandedBios] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [twitchAccessToken, setTwitchAccessToken] = useState(null);

  // Only fetch streamers when user is authenticated
  useEffect(() => {
    if (user) {
      const loadTwitchAuth = async () => {
        try {
          const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
          const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
          
          if (!clientId || !clientSecret) {
            console.error('Twitch API credentials missing');
            toast.error('Twitch API credentials are missing in environment variables');
            return null;
          }
          
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
          });
          
          if (!tokenResponse.ok) {
            throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
          }
          
          const tokenData = await tokenResponse.json();
          const accessToken = tokenData.access_token;
          
          if (!accessToken) {
            throw new Error('No access token received from Twitch');
          }
          
          setTwitchAccessToken(accessToken);
          
          // Once we have the token, fetch streamers
          await fetchStreamersWithTwitchData(accessToken);
        } catch (error) {
          console.error('Error initializing Twitch auth:', error);
          toast.error(`Error connecting to Twitch: ${error.message}`);
        }
      };
      
      loadTwitchAuth();
    } else {
      // Reset state if user logs out
      setStreamers([]);
      setLoading(false);
    }
  }, [user]);

  const fetchStreamersWithTwitchData = async (accessToken) => {
    try {
      setLoading(true);
      toast.loading('Loading streamers...', { id: 'loading' });
      
      // Get only basic streamer info from database - just usernames and votes
      const { data: baseStreamers, error } = await supabase
        .from('twitch_streamers')
        .select('id, username, twitch_id, votes')
        .order('votes', { ascending: false })
        .limit(20);
        
      if (error) throw error;
      
      if (!baseStreamers || baseStreamers.length === 0) {
        toast.error('No streamers found in database.', { id: 'loading' });
        setLoading(false);
        return;
      }
      
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      if (!clientId || !accessToken) {
        throw new Error('Twitch API credentials or token missing');
      }
      
      // Extract Twitch login names for API call
      const twitchLogins = baseStreamers
        .map(streamer => streamer.username?.toLowerCase())
        .filter(Boolean);
        
      if (twitchLogins.length === 0) {
        throw new Error('No valid Twitch usernames found in database');
      }
      
      // Initialize streamers with database values (id, votes) but nothing else
      let streamersWithInfo = baseStreamers.map(streamer => ({
        ...streamer,
        is_live: false,
        view_count: 0,
        game_name: null,
        stream_title: null,
        thumbnail_url: null,
        display_name: streamer.username, // Default fallback
        profile_image_url: null,
        description: null
      }));
      
      // Create lookup maps
      const streamersByLogin = {};
      streamersWithInfo.forEach(streamer => {
        if (streamer.username) {
          streamersByLogin[streamer.username.toLowerCase()] = streamer;
        }
      });
      
      const streamersByTwitchId = {};
      streamersWithInfo.forEach(streamer => {
        if (streamer.twitch_id) {
          streamersByTwitchId[streamer.twitch_id] = streamer;
        }
      });
      
      // Get user profile info from Twitch
      try {
        // First get user data for all streamers directly from Twitch
        for (let i = 0; i < twitchLogins.length; i += 100) { // Twitch API limit
          const chunk = twitchLogins.slice(i, i + 100);
          const queryString = chunk.map(login => `login=${login}`).join('&');
          
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${queryString}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!usersResponse.ok) {
            console.error(`Error fetching user data: ${usersResponse.status}`);
            continue; // Try next chunk
          }
          
          const userData = await usersResponse.json();
          
          // Update streamers with user data from Twitch
          if (userData.data && Array.isArray(userData.data)) {
            userData.data.forEach(user => {
              const login = user.login?.toLowerCase();
              if (login && streamersByLogin[login]) {
                const streamer = streamersByLogin[login];
                
                // Update with Twitch data only
                streamer.twitch_id = user.id;
                streamer.display_name = user.display_name;
                streamer.profile_image_url = user.profile_image_url;
                streamer.description = user.description;
                
                // Also update twitch ID map
                streamersByTwitchId[user.id] = streamer;
              }
            });
          }
        }
        
        // Now get live stream data for all streamers from Twitch
        const twitchIds = Object.keys(streamersByTwitchId);
        
        if (twitchIds.length > 0) {
          for (let i = 0; i < twitchIds.length; i += 100) { // Twitch API limit
            const chunk = twitchIds.slice(i, i + 100);
            const queryString = chunk.map(id => `user_id=${id}`).join('&');
            
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryString}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (!streamsResponse.ok) {
              console.error(`Error fetching stream data: ${streamsResponse.status}`);
              continue; // Try next chunk
            }
            
            const streamsData = await streamsResponse.json();
            
            // Update streamers with real-time stream data from Twitch
            if (streamsData.data && Array.isArray(streamsData.data)) {
              streamsData.data.forEach(stream => {
                const userID = stream.user_id;
                if (userID && streamersByTwitchId[userID]) {
                  const streamer = streamersByTwitchId[userID];
                  
                  // Only if actually live - this data comes exclusively from Twitch
                  if (stream.type === 'live') {
                    streamer.is_live = true;
                    streamer.view_count = stream.viewer_count || 0;
                    streamer.game_name = stream.game_name || null;
                    streamer.stream_title = stream.title || null;
                    streamer.thumbnail_url = stream.thumbnail_url?.replace('{width}', '320').replace('{height}', '180') || null;
                  }
                }
              });
            }
          }
        }
        
        // Count actual live streamers
        const liveCount = streamersWithInfo.filter(s => s.is_live).length;
        
        // Update state with fully populated streamers from Twitch
        setStreamers(streamersWithInfo);
        setCurrentIndex(0);
        
        toast.success(`Loaded ${streamersWithInfo.length} streamers with ${liveCount} live!`, { id: 'loading' });
      } catch (twitchApiError) {
        console.error('Twitch API error:', twitchApiError);
        toast.error(`Error: ${twitchApiError.message}. Unable to load streamer data.`, { id: 'loading' });
        throw twitchApiError; // Re-throw to trigger fallback handling
      }
    } catch (error) {
      console.error('Error loading streamers:', error);
      toast.error(error.message || 'Failed to load streamers', { id: 'loading' });
      
      // Only attempt this as a last resort
      try {
        const { data: fallbackStreamers } = await supabase
          .from('twitch_streamers')
          .select('id, username, votes')
          .order('votes', { ascending: false })
          .limit(20);
          
        if (fallbackStreamers && fallbackStreamers.length > 0) {
          const minimalStreamers = fallbackStreamers.map(s => ({
            ...s, 
            is_live: false, // Don't trust stored data
            view_count: 0,  // Don't trust stored data
            display_name: s.username,
            game_name: null,
            stream_title: null
          }));
          
          setStreamers(minimalStreamers);
          setCurrentIndex(0);
          toast.warning('Limited data mode: Live status unavailable', { id: 'loading' });
        }
      } catch (fallbackError) {
        console.error('Complete failure:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamers = async () => {
    if (refreshing) return; // Prevent multiple clicks
    
    setRefreshing(true);
    toast.loading('Refreshing streamer data...', { id: 'refresh' });
    
    try {
      // Clear existing streamer data to avoid showing stale data
      setStreamers([]);
      
      if (twitchAccessToken) {
        // Use the existing token to refresh data from Twitch
        await fetchStreamersWithTwitchData(twitchAccessToken);
      } else {
        // Re-authenticate if token is missing
        const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
        const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          throw new Error('Twitch API credentials missing');
        }
        
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        if (!accessToken) {
          throw new Error('No access token received from Twitch');
        }
        
        setTwitchAccessToken(accessToken);
        await fetchStreamersWithTwitchData(accessToken);
      }
      
      toast.success('Streamer data refreshed!', { id: 'refresh' });
    } catch (error) {
      console.error('Error refreshing streamer data:', error);
      toast.error(`Failed to refresh data: ${error.message}`, { id: 'refresh' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSwipeRight = async () => {
    // Keep track of the streamer before showing auth modal
    const currentStreamer = streamers[currentIndex];
    
    if (!user) {
      toast.info('Sign in to save favorites & view them later!');
      setShowAuthModal(true);
      return;
    }

    // Store this value so we can use it even after moving to next card
    const streamerId = currentStreamer?.id;
    
    // Move to next card first to prevent UI freeze
    nextCard();

    // Now handle the database operations
    if (streamerId) {
      try {
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: streamerId 
          });
          
        // Record in history that user swiped right
        await supabase
          .from('user_history')
          .upsert({
            user_id: user.id,
            streamer_id: streamerId,
            interaction_type: 'swiped_right'
          });
          
        // Increment vote count
        const updatedVotes = (currentStreamer.votes || 0) + 1;
        await supabase
          .from('twitch_streamers')
          .update({ votes: updatedVotes })
          .eq('id', streamerId);
        
        toast.success('Added to favorites!');
        
        // Update local state
        setStreamers(prevStreamers => {
          const updatedStreamers = [...prevStreamers];
          const streamerIndex = updatedStreamers.findIndex(s => s.id === streamerId);
          if (streamerIndex >= 0) {
            updatedStreamers[streamerIndex].votes = updatedVotes;
          }
          return updatedStreamers;
        });
      } catch (error) {
        console.error('Error saving favorite:', error);
        toast.error('Failed to save favorite. Please try again.');
      }
    }
  };

  const handleSwipeLeft = async () => {
    // Record in history that user swiped left if they're logged in
    const currentStreamer = streamers[currentIndex];
    
    // Move to next card immediately to prevent UI freeze
    nextCard();
    
    // Only record this if user is logged in
    if (user && currentStreamer) {
      try {
        await supabase
          .from('user_history')
          .upsert({
            user_id: user.id,
            streamer_id: currentStreamer.id,
            interaction_type: 'swiped_left'
          });
      } catch (error) {
        console.error('Error recording swipe left:', error);
        // Don't show error to user, just log it
      }
    }
  };

  const nextCard = () => {
    // Reset animation
    controls.start({ x: 0, rotateZ: 0 });
    
    // Go to next card
    setCurrentIndex(prevIndex => prevIndex + 1);
  };

  const handleDragStart = (_, info) => {
    setDragStart({ x: info.point.x, y: info.point.y });
  };

  const handleDragEnd = (_, info) => {
    const dragEndX = info.point.x;
    const deltaX = dragEndX - dragStart.x;
    
    if (deltaX > 100) {
      // Swiped right
      controls.start({ x: window.innerWidth, rotateZ: 10 }).then(handleSwipeRight);
    } else if (deltaX < -100) {
      // Swiped left
      controls.start({ x: -window.innerWidth, rotateZ: -10 }).then(handleSwipeLeft);
    } else {
      // Reset if the swipe wasn't far enough
      controls.start({ x: 0, rotateZ: 0 });
    }
  };

  const toggleBio = (streamerId) => {
    setExpandedBios(prev => {
      const newSet = new Set(prev);
      if (newSet.has(streamerId)) {
        newSet.delete(streamerId);
      } else {
        newSet.add(streamerId);
      }
      return newSet;
    });
  };

  const renderNoMoreCards = () => {
    return (
      <div className={styles.noMoreCardsContainer}>
        <h2>All done!</h2>
        <p>Come back later for more streamers.</p>
        <div className={styles.noMoreCardsEmoji}>✨</div>
        <button 
          className={styles.refreshButton}
          onClick={fetchStreamers}
        >
          Refresh Streamers
        </button>
      </div>
    );
  };

  const renderCards = () => {
    if (loading) {
      return (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading streamers...</p>
        </div>
      );
    }

    if (!streamers.length) {
      return (
        <div className={styles.loadingContainer}>
          <p>No streamers found. Try refreshing.</p>
          <button 
            className={styles.refreshButton}
            onClick={fetchStreamers}
          >
            Refresh Streamers
          </button>
        </div>
      );
    }

    if (currentIndex >= streamers.length) {
      return renderNoMoreCards();
    }

    const streamer = streamers[currentIndex];
    
    // Ensure streamer data is valid
    if (!streamer) {
      return (
        <div className={styles.loadingContainer}>
          <p>Streamer data is missing. Try refreshing.</p>
          <button 
            className={styles.refreshButton}
            onClick={fetchStreamers}
          >
            Refresh Streamers
          </button>
        </div>
      );
    }
    
    return (
      <motion.div 
        className={styles.card}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        whileTap={{ scale: 0.98 }}
      >
        <div 
          className={styles.cardImageContainer}
          style={{ backgroundImage: `url(${streamer.profile_image_url || 'https://via.placeholder.com/300'})` }}
        >
          {streamer.is_live === true && (
            <div className={styles.liveIndicator}>
              LIVE
              <div className={styles.viewerCount}>
                {(streamer.view_count || 0).toLocaleString()} viewers
              </div>
            </div>
          )}
          
          <div className={styles.swipeOverlay}>
            <motion.div 
              className={styles.likeOverlay} 
              animate={{ opacity: controls.x > 50 ? 1 : 0 }}
            >
              FAVORITE
            </motion.div>
            <motion.div 
              className={styles.dislikeOverlay} 
              animate={{ opacity: controls.x < -50 ? 1 : 0 }}
            >
              PASS
            </motion.div>
          </div>
        </div>
        <div className={styles.cardContent}>
          <h2>{streamer.display_name || streamer.username}</h2>
          
          <div className={styles.contentScroll}>
            {streamer.stream_title && (
              <p className={styles.streamTitle}>
                {streamer.stream_title}
              </p>
            )}
            
            {streamer.game_name && (
              <div className={styles.gameTag}>Playing: {streamer.game_name}</div>
            )}
            
            {streamer.description && (
              <div className={styles.bioSection}>
                <button 
                  className={styles.bioToggle}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBio(streamer.id);
                  }}
                >
                  {expandedBios.has(streamer.id) ? '▼ Hide Bio' : '▶ Show Bio'}
                </button>
                {expandedBios.has(streamer.id) && (
                  <p className={styles.bio}>{streamer.description}</p>
                )}
              </div>
            )}
          </div>
          
          <div className={styles.statsContainer}>
            {streamer.is_live && streamer.view_count > 0 && (
              <span className={styles.viewCount}>👁️ {streamer.view_count.toLocaleString()} viewers</span>
            )}
            {streamer.votes > 0 && (
              <span className={styles.voteCount}>❤️ {streamer.votes} votes</span>
            )}
          </div>
          
          {streamer.is_live && (
            <Link 
              to={`/stream/${streamer.username}`} 
              className={styles.watchButton}
            >
              🔴 Watch Live
            </Link>
          )}
        </div>
      </motion.div>
    );
  };

  const renderButtons = () => {
    if (currentIndex >= streamers.length) return null;
    
    return (
      <div className={styles.actionButtons}>
        <button 
          className={`${styles.actionButton} ${styles.dislikeButton}`}
          onClick={() => controls.start({ x: -window.innerWidth, rotateZ: -10 }).then(handleSwipeLeft)}
        >
          👎
        </button>
        <button 
          className={`${styles.actionButton} ${styles.likeButton}`}
          onClick={() => controls.start({ x: window.innerWidth, rotateZ: 10 }).then(handleSwipeRight)}
        >
          ❤️
        </button>
      </div>
    );
  };

  const renderAuthSplash = () => {
    return (
      <div className={styles.authSplashContainer}>
        <div className={styles.authSplashContent}>
          <h1>Discover New Streamers</h1>
          <div className={styles.splashImageContainer}>
            <img 
              src="/dig-deeper-preview.png" 
              alt="Dig Deeper Preview"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/500x300?text=Dig+Deeper";
              }}
              className={styles.splashImage}
            />
          </div>
          <div className={styles.splashDescription}>
            <h2>Find Your Next Favorite Streamer</h2>
            <p>Browse through trending and up-and-coming streamers on Twitch.</p>
            <ul className={styles.featureList}>
              <li>See who's currently live</li>
              <li>Discover streamers based on popularity</li>
              <li>Save your favorites to watch later</li>
              <li>Support streamers with your votes</li>
            </ul>
          </div>
          
          <div className={styles.authButtons}>
            <button 
              onClick={() => navigate('/login')}
              className={styles.authButton}
            >
              Login to Continue
            </button>
            <button 
              onClick={() => navigate('/signup')}
              className={styles.authButtonSecondary}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Check if user is authenticated, if not show splash screen
  if (!user) {
    return renderAuthSplash();
  }

  return (
    <div className={styles.container}>
      <AuthModal 
        show={showAuthModal} 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)} 
        onLogin={() => window.location.href = '/login'}
        onSignup={() => window.location.href = '/signup'}
      />
      
      <div className={styles.header}>
        <h1>Dig Deeper</h1>
        <p>Discover and vote for your favorite Twitch streamers</p>
        
        <div className={styles.headerButtons}>
          <Link to="/leaderboard" className={styles.leaderboardLink}>
            View Leaderboard
          </Link>
          
          {user ? (
            <Link to="/favorites" className={styles.favoritesLink}>
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </Link>
          ) : (
            <button 
              onClick={() => {
                toast.info('Sign in to access your saved favorites!');
                setShowAuthModal(true);
              }}
              className={styles.favoritesLink}
            >
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </button>
          )}
          
          <button
            onClick={fetchStreamers}
            className={`${styles.refreshButton} ${refreshing ? styles.refreshing : ''}`}
            title="Refresh real-time data from Twitch"
            disabled={refreshing}
          >
            <span className={styles.refreshIcon}>🔄</span> 
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>
      
      <div className={styles.instructionsContainer}>
        <div className={styles.instruction}>
          <span>👈</span>
          <p>Swipe left to pass</p>
        </div>
        <div className={styles.instruction}>
          <span>👉</span>
          <p>Swipe right to favorite</p>
        </div>
      </div>
      
      <div className={styles.cardsContainer}>
        {renderCards()}
      </div>
      
      {renderButtons()}
    </div>
  );
};

export default DigDeeperPage;
