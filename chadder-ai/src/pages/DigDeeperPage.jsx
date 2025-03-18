import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

const DigDeeperPage = () => {
  const { user } = useAuth();
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const controls = useAnimation();
  const [expandedBios, setExpandedBios] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchTwitchDataDirectly();
  }, []);

  const fetchTwitchDataDirectly = async () => {
    try {
      setLoading(true);
      toast.loading('Loading streamers...', { id: 'loading' });
      
      // Get streamers from database
      const { data: streamers, error } = await supabase
        .from('twitch_streamers')
        .select('*')
        .order('votes', { ascending: false })
        .limit(20);
        
      if (error) throw error;
      
      if (!streamers || streamers.length === 0) {
        toast.error('No streamers found.', { id: 'loading' });
        setLoading(false);
        return;
      }
      
      // Debug environment variables
      console.log('Environment check:');
      console.log('isDevelopment:', isDevelopment);
      console.log('import.meta.env.VITE_TWITCH_CLIENT_ID exists:', !!import.meta.env.VITE_TWITCH_CLIENT_ID);
      console.log('import.meta.env.VITE_TWITCH_CLIENT_SECRET exists:', !!import.meta.env.VITE_TWITCH_CLIENT_SECRET);
      console.log('First few chars of Client ID:', import.meta.env.VITE_TWITCH_CLIENT_ID ? import.meta.env.VITE_TWITCH_CLIENT_ID.substring(0, 3) + '...' : 'undefined');
      
      // Try accessing environment variables (without hardcoded fallbacks)
      const twitchClientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      const twitchClientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;

      console.log('Using client ID:', twitchClientId ? twitchClientId.substring(0, 3) + '...' : 'undefined');

      if (!twitchClientId || !twitchClientSecret) {
        let errorMsg = 'Twitch API credentials are missing.';
        if (isDevelopment) {
          errorMsg += ' Make sure VITE_TWITCH_CLIENT_ID and VITE_TWITCH_CLIENT_SECRET are set in your .env file.';
          console.error('Missing Twitch API credentials. Check your .env file for:');
          console.error('VITE_TWITCH_CLIENT_ID=your_client_id');
          console.error('VITE_TWITCH_CLIENT_SECRET=your_client_secret');
        } else {
          errorMsg += ' Please make sure these are properly set in your Vercel environment variables.';
        }
        throw new Error(errorMsg);
      }
      
      console.log('Attempting to fetch Twitch data with client ID:', twitchClientId);
      
      try {
        console.log('Attempting to fetch Twitch token...');
        
        // Get Twitch OAuth token
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`
        });
        
        // Handle non-OK responses
        if (!tokenResponse.ok) {
          // Try to get the error body
          let errorText = 'Unknown error';
          try {
            errorText = await tokenResponse.text();
          } catch (e) {
            console.error('Could not get error details:', e);
          }
          
          console.error(`Twitch token request failed with status ${tokenResponse.status}:`, errorText);
          
          // Provide specific error message based on status code
          if (tokenResponse.status === 401 || tokenResponse.status === 403) {
            throw new Error(`Invalid Twitch API credentials. Status: ${tokenResponse.status}. This likely means your Client ID or Secret is incorrect.`);
          } else {
            throw new Error(`Error getting Twitch token: ${tokenResponse.status}. Details: ${errorText}`);
          }
        }
        
        // Process successful response
        console.log('Twitch token request successful!');
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        if (!accessToken) {
          throw new Error('Received token response but no access_token found in the response.');
        }
        
        console.log('Successfully obtained Twitch access token!');
        
        // Extract Twitch IDs
        const twitchIds = streamers.map(streamer => streamer.twitch_id);
        
        // Split into chunks of 100 (Twitch API limit)
        const chunks = [];
        for (let i = 0; i < twitchIds.length; i += 100) {
          chunks.push(twitchIds.slice(i, i + 100));
        }
        
        // Get live streams data
        let allStreams = [];
        for (const chunk of chunks) {
          const queryString = chunk.map(id => `user_id=${id}`).join('&');
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryString}`, {
            headers: {
              'Client-ID': twitchClientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!streamsResponse.ok) {
            throw new Error(`Error fetching streams: ${streamsResponse.status}`);
          }
          
          const streamsData = await streamsResponse.json();
          allStreams.push(...streamsData.data);
        }
        
        // Create a map of user_id to stream data
        const streamMap = {};
        allStreams.forEach(stream => {
          streamMap[stream.user_id] = {
            is_live: true,
            view_count: stream.viewer_count,
            game_name: stream.game_name,
            stream_title: stream.title
          };
        });
        
        // Update streamer data with live status
        const updatedStreamers = streamers.map(streamer => {
          const streamData = streamMap[streamer.twitch_id];
          const isLive = !!streamData;
          
          return {
            ...streamer,
            is_live: isLive,
            view_count: isLive ? streamData.view_count : 0,
            game_name: isLive ? streamData.game_name : null,
            stream_title: isLive ? streamData.stream_title : null
          };
        });
        
        // Update the database with the new information
        const updates = updatedStreamers.map(async (streamer) => {
          return supabase
            .from('twitch_streamers')
            .update({
              is_live: streamer.is_live,
              view_count: streamer.is_live ? streamer.view_count : 0,
              game_name: streamer.game_name,
              stream_title: streamer.stream_title,
              updated_at: new Date().toISOString()
            })
            .eq('id', streamer.id);
        });
        
        await Promise.all(updates);
        
        // Set state with updated streamers
        setStreamers(updatedStreamers);
        setCurrentIndex(0);
        toast.success('Streamers loaded with live data!', { id: 'loading' });
      } catch (twitchApiError) {
        console.error('Error with Twitch API:', twitchApiError);
        // Fall back to database only if Twitch API fails
        setStreamers(streamers);
        setCurrentIndex(0);
        toast.error(`Twitch API error: ${twitchApiError.message}`, { id: 'loading' });
      }
    } catch (error) {
      console.error('Error in fetchTwitchDataDirectly:', error);
      toast.error(`Failed to load streamers: ${error.message}`, { id: 'loading' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamers = async () => {
    if (refreshing) return; // Prevent multiple clicks
    
    setRefreshing(true);
    toast.loading('Refreshing streamer data...', { id: 'refresh' });
    
    try {
      await fetchTwitchDataDirectly();
      toast.success('Streamer data refreshed!', { id: 'refresh' });
    } catch (error) {
      console.error('Error refreshing streamer data:', error);
      toast.error('Failed to refresh streamer data', { id: 'refresh' });
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

    try {
      if (currentStreamer) {
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: currentStreamer.id 
          });
          
        // Record in history that user swiped right
        await supabase
          .from('user_history')
          .upsert({
            user_id: user.id,
            streamer_id: currentStreamer.id,
            interaction_type: 'swiped_right'
          });
          
        // Increment vote count
        const updatedVotes = (currentStreamer.votes || 0) + 1;
        await supabase
          .from('twitch_streamers')
          .update({ votes: updatedVotes })
          .eq('id', currentStreamer.id);
        
        toast.success('Added to favorites!');
        
        // Update local state
        const updatedStreamers = [...streamers];
        updatedStreamers[currentIndex].votes = updatedVotes;
        setStreamers(updatedStreamers);
      }
    } catch (error) {
      console.error('Error saving favorite:', error);
      toast.error('Failed to save favorite. Please try again.');
    } finally {
      // Move to next card
      nextCard();
    }
  };

  const handleSwipeLeft = async () => {
    // Record in history that user swiped left if they're logged in
    const currentStreamer = streamers[currentIndex];
    
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
    
    // Simply move to the next card
    nextCard();
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

    if (currentIndex >= streamers.length) {
      return renderNoMoreCards();
    }

    const streamer = streamers[currentIndex];
    
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
          {streamer.is_live && (
            <div className={styles.liveIndicator}>
              LIVE
              <div className={styles.viewerCount}>{streamer.view_count.toLocaleString()} viewers</div>
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
            {streamer.view_count > 0 && (
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
