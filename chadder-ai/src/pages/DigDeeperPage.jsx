import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

const DigDeeperPage = () => {
  const { user } = useAuth();
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const controls = useAnimation();
  const [expandedBios, setExpandedBios] = useState(new Set());

  useEffect(() => {
    // Add a timestamp parameter to force a fresh API request rather than using a cached response
    const fetchWithCache = async () => {
      const timestamp = new Date().getTime();
      try {
        setLoading(true);
        const response = await fetch(`/api/twitch/getStreamers?_t=${timestamp}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.streamers && result.streamers.length > 0) {
            console.log('Loaded streamers with real-time Twitch data:', result.streamers.length);
            setStreamers(result.streamers);
            setCurrentIndex(0);
          } else {
            console.warn('API returned no streamers, falling back to database');
            await fetchStreamersFromDatabase();
          }
        } else {
          console.warn('API call failed, falling back to database');
          await fetchStreamersFromDatabase();
        }
      } catch (error) {
        console.error('Error fetching streamers:', error);
        await fetchStreamersFromDatabase();
      } finally {
        setLoading(false);
      }
    };

    const fetchStreamersFromDatabase = async () => {
      try {
        const { data, error } = await supabase
          .from('twitch_streamers')
          .select('*')
          .order('votes', { ascending: false })
          .limit(20);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          console.log('Loaded streamers from database:', data.length);
          setStreamers(data);
          setCurrentIndex(0);
        } else {
          toast.error('No streamers found. Try again later.');
        }
      } catch (error) {
        console.error('Error fetching streamers from database:', error);
        toast.error('Failed to load streamers. Please try again.');
      }
    };

    fetchWithCache();
  }, []);

  const fetchStreamers = async () => {
    const timestamp = new Date().getTime();
    toast.loading('Refreshing streamer data...', { id: 'refresh' });
    
    try {
      setLoading(true);
      const response = await fetch(`/api/twitch/getStreamers?_t=${timestamp}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.streamers && result.streamers.length > 0) {
          console.log('Refreshed streamers with real-time Twitch data:', result.streamers.length);
          setStreamers(result.streamers);
          setCurrentIndex(0);
          toast.success('Streamer data refreshed!', { id: 'refresh' });
          return;
        }
      }
      
      toast.error('Failed to refresh streamer data', { id: 'refresh' });
      // Don't fall back to database on manual refresh - show error instead
    } catch (error) {
      console.error('Error refreshing streamers:', error);
      toast.error('Failed to refresh streamer data', { id: 'refresh' });
    } finally {
      setLoading(false);
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
            className={styles.refreshButton}
            title="Refresh real-time data from Twitch"
          >
            <span className={styles.refreshIcon}>🔄</span> Refresh Data
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
