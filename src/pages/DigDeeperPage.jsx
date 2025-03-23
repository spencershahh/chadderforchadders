import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

// Add a useViewport hook to get current viewport size
const useViewport = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const [height, setHeight] = useState(window.innerHeight);
  
  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return { width, height };
};

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
  const { width: viewportWidth } = useViewport();
  const isMobile = viewportWidth < 768; // Check if viewport is mobile sized
  
  // Preference selector state
  const [showPreferenceSelector, setShowPreferenceSelector] = useState(false);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [hasSetPreferences, setHasSetPreferences] = useState(false);
  
  // Refs for measuring swipe distance on mobile
  const touchStartRef = useRef(null);
  const cardRef = useRef(null);
  
  // Category definitions with icons
  const streamCategories = [
    { id: '509658', name: 'Just Chatting', icon: '💬' },
    { id: '26936', name: 'Music', icon: '🎵' },
    { id: '33214', name: 'Fortnite', icon: '🔫' },
    { id: '27471', name: 'Minecraft', icon: '⛏️' },
    { id: '32982', name: 'Grand Theft Auto V', icon: '🚗' },
    { id: '21779', name: 'League of Legends', icon: '🧙' },
    { id: '516575', name: 'VALORANT', icon: '🎯' },
    { id: '509659', name: 'Art', icon: '🎨' },
    { id: '518203', name: 'Sports', icon: '⚽' },
    { id: '417752', name: 'Talk Shows', icon: '🎙️' },
    { id: '518248', name: 'Indie Games', icon: '🎮' }
  ];
  
  // Check if this is the first visit
  useEffect(() => {
    if (user) {
      // Check localStorage for previously saved preferences
      const savedPreferences = localStorage.getItem(`digdeeper_preferences_${user.id}`);
      if (savedPreferences) {
        try {
          const parsedPreferences = JSON.parse(savedPreferences);
          setSelectedPreferences(parsedPreferences);
          setHasSetPreferences(true);
        } catch (e) {
          console.error('Error parsing saved preferences', e);
          setShowPreferenceSelector(true);
        }
      } else {
        // First time, show selector
        setShowPreferenceSelector(true);
      }
    }
  }, [user]);

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
          
          // Once we have the token, fetch low-viewer streamers directly from Twitch
          await fetchLowViewerStreams(accessToken);
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

  // Add touch event handlers for better mobile swiping
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartRef.current = e.touches[0].clientX;
    };
    
    const handleTouchEnd = (e) => {
      if (!touchStartRef.current) return;
      
      const touchEnd = e.changedTouches[0].clientX;
      const diff = touchEnd - touchStartRef.current;
      
      // Make swipe detection more sensitive on mobile
      const threshold = viewportWidth * 0.15; // 15% of screen width as threshold
      
      if (diff > threshold) {
        // Swiped right
        controls.start({ x: viewportWidth, rotateZ: 10 }).then(handleSwipeRight);
      } else if (diff < -threshold) {
        // Swiped left
        controls.start({ x: -viewportWidth, rotateZ: -10 }).then(handleSwipeLeft);
      } else {
        // Reset if the swipe wasn't far enough
        controls.start({ x: 0, rotateZ: 0 });
      }
      
      touchStartRef.current = null;
    };
    
    const card = cardRef.current;
    if (card) {
      card.addEventListener('touchstart', handleTouchStart);
      card.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        card.removeEventListener('touchstart', handleTouchStart);
        card.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [cardRef.current, viewportWidth, controls, handleSwipeRight, handleSwipeLeft]);
  
  // Rest of the existing functions...
  const fetchLowViewerStreams = async (accessToken) => {
    // ... existing code ...
  };

  const fetchStreamers = async () => {
    // ... existing code ...
  };

  const handleSwipeRight = async () => {
    // Keep track of the streamer before showing auth modal
    const currentStreamer = streamers[currentIndex];
    
    if (!user) {
      toast.info('Sign in to save favorites & view them later!');
      setShowAuthModal(true);
      return;
    }

    // Learn from user preference - they liked this streamer's category
    if (currentStreamer?.category_id && hasSetPreferences) {
      learnFromInteraction(currentStreamer.category_id, true);
    }

    // Move to next card first to prevent UI freeze
    nextCard();

    // Now handle the database operations if needed
    if (currentStreamer?.twitch_id) {
      try {
        // First check if this streamer already exists in our database
        const { data: existingStreamer } = await supabase
          .from('twitch_streamers')
          .select('id')
          .eq('twitch_id', currentStreamer.twitch_id)
          .single();
          
        let streamerId;
        
        if (existingStreamer) {
          // Use existing record
          streamerId = existingStreamer.id;
          
          // Update votes
          await supabase
            .from('twitch_streamers')
            .update({ votes: currentStreamer.votes + 1 })
            .eq('id', streamerId);
        } else {
          // Insert new streamer into database
          const { data: newStreamer, error } = await supabase
            .from('twitch_streamers')
            .insert({
              username: currentStreamer.username,
              twitch_id: currentStreamer.twitch_id,
              votes: 1
            })
            .select()
            .single();
            
          if (error) throw error;
          streamerId = newStreamer.id;
        }
        
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: streamerId 
          });
          
        // Record in history
        await supabase
          .from('user_history')
          .upsert({
            user_id: user.id,
            streamer_id: streamerId,
            interaction_type: 'swiped_right'
          });
          
        toast.success('Added to favorites!');
      } catch (error) {
        console.error('Error saving favorite:', error);
        toast.error('Failed to save favorite. Please try again.');
      }
    }
  };

  const handleSwipeLeft = async () => {
    // ... existing code ...
  };

  const nextCard = () => {
    // ... existing code ...
  };

  const handleDragStart = (_, info) => {
    setDragStart({ x: info.point.x, y: info.point.y });
  };

  const handleDragEnd = (_, info) => {
    const dragEndX = info.point.x;
    const deltaX = dragEndX - dragStart.x;
    
    // Make swipe detection more sensitive on mobile
    const threshold = isMobile ? viewportWidth * 0.15 : 100;
    
    if (deltaX > threshold) {
      // Swiped right
      controls.start({ x: viewportWidth, rotateZ: 10 }).then(handleSwipeRight);
    } else if (deltaX < -threshold) {
      // Swiped left
      controls.start({ x: -viewportWidth, rotateZ: -10 }).then(handleSwipeLeft);
    } else {
      // Reset if the swipe wasn't far enough
      controls.start({ x: 0, rotateZ: 0 });
    }
  };

  const toggleBio = (streamerId) => {
    // ... existing code ...
  };

  const renderNoMoreCards = () => {
    return (
      <div className={styles.noMoreCardsContainer}>
        <h2>Loading more streamers...</h2>
        <div className={styles.spinner}></div>
        <p>Finding more small streamers for you...</p>
      </div>
    );
  };

  // Auto-load more streamers when user reaches the end
  useEffect(() => {
    if (currentIndex >= streamers.length && streamers.length > 0 && !loading) {
      // We've reached the end of the current batch, load more
      fetchMoreStreamers();
    }
  }, [currentIndex, streamers.length]);

  const fetchMoreStreamers = async () => {
    // ... existing code ...
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
    
    // Add inline styles for better mobile adaptation
    const cardStyle = isMobile ? {
      maxWidth: '95vw',
      width: '95vw',
      maxHeight: '70vh',
      margin: '0 auto'
    } : {};
    
    const imageContainerStyle = isMobile ? {
      height: '40vh',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    } : {};
    
    const contentStyle = isMobile ? {
      maxHeight: '30vh',
      padding: '10px'
    } : {};
    
    return (
      <motion.div 
        ref={cardRef}
        className={styles.card}
        style={cardStyle}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        whileTap={{ scale: 0.98 }}
      >
        <div 
          className={styles.cardImageContainer}
          style={{ 
            backgroundImage: `url(${streamer.thumbnail_url || streamer.profile_image_url || 'https://via.placeholder.com/300'})`,
            ...imageContainerStyle
          }}
        >
          <div className={styles.streamerOverlay}>
            <span className={styles.streamerNameOverlay}>{streamer.display_name || streamer.username}</span>
          </div>
          
          {streamer.is_live === true && (
            <div className={styles.liveIndicator}>
              LIVE
              <div className={styles.viewerCount}>
                {(streamer.view_count || 0).toLocaleString()} viewers
              </div>
            </div>
          )}
          
          {streamer.isWildcard && (
            <div className={styles.wildcardIndicator}>
              WILDCARD
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
        <div className={styles.cardContent} style={contentStyle}>
          <h2 className={styles.streamerName}>{streamer.display_name || streamer.username}</h2>
          
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
          
          <div className={styles.cardFooter}>
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
        </div>
      </motion.div>
    );
  };

  const renderButtons = () => {
    if (currentIndex >= streamers.length) return null;
    
    // Adjust button size and positioning for mobile
    const buttonStyle = isMobile ? {
      width: '60px',
      height: '60px',
      fontSize: '24px'
    } : {};
    
    const containerStyle = isMobile ? {
      padding: '10px 0',
      justifyContent: 'space-around'
    } : {};
    
    return (
      <div className={styles.actionButtons} style={containerStyle}>
        <button 
          className={`${styles.actionButton} ${styles.dislikeButton}`}
          style={buttonStyle}
          onClick={() => controls.start({ x: -viewportWidth, rotateZ: -10 }).then(handleSwipeLeft)}
        >
          👎
        </button>
        <button 
          className={`${styles.actionButton} ${styles.likeButton}`}
          style={buttonStyle}
          onClick={() => controls.start({ x: viewportWidth, rotateZ: 10 }).then(handleSwipeRight)}
        >
          ❤️
        </button>
      </div>
    );
  };

  const renderAuthSplash = () => {
    return (
      <div className={styles.authSplashContainer}>
        <div className={styles.authSplashContent} style={isMobile ? { padding: '15px', maxWidth: '100%' } : {}}>
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
              style={isMobile ? { maxWidth: '100%', height: 'auto' } : {}}
            />
          </div>
          <div className={styles.splashDescription}>
            <h2>Find Your Next Favorite Streamer</h2>
            <p>Browse through trending and up-and-coming streamers on Twitch.</p>
            <ul className={styles.featureList} style={isMobile ? { padding: '0 0 0 20px' } : {}}>
              <li>See who's currently live</li>
              <li>Discover streamers based on popularity</li>
              <li>Save your favorites to watch later</li>
              <li>Support streamers with your votes</li>
            </ul>
          </div>
          
          <div className={styles.authButtons} style={isMobile ? { flexDirection: 'column', gap: '15px' } : {}}>
            <button 
              onClick={() => navigate('/login')}
              className={styles.authButton}
              style={isMobile ? { width: '100%', padding: '15px 0' } : {}}
            >
              Login to Continue
            </button>
            <button 
              onClick={() => navigate('/signup')}
              className={styles.authButtonSecondary}
              style={isMobile ? { width: '100%', padding: '15px 0' } : {}}
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

  // Preference handling functions
  const togglePreference = (categoryId) => {
    setSelectedPreferences(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        // Limit to 3 selections
        if (prev.length >= 3) {
          return [...prev.slice(1), categoryId]; // Remove oldest, add new
        }
        return [...prev, categoryId];
      }
    });
  };
  
  const savePreferences = () => {
    if (user) {
      localStorage.setItem(`digdeeper_preferences_${user.id}`, JSON.stringify(selectedPreferences));
    }
    setHasSetPreferences(true);
    setShowPreferenceSelector(false);
    // Now fetch streamers with new preferences
    if (twitchAccessToken) {
      fetchLowViewerStreams(twitchAccessToken);
    }
  };
  
  const skipPreferences = () => {
    // If user has already set preferences before, this is a cancel action
    if (hasSetPreferences) {
      // Just close the modal without changing preferences
      setShowPreferenceSelector(false);
      
      // Reset to their previous preferences
      if (user) {
        const savedPreferences = localStorage.getItem(`digdeeper_preferences_${user.id}`);
        if (savedPreferences) {
          try {
            const parsedPreferences = JSON.parse(savedPreferences);
            setSelectedPreferences(parsedPreferences);
          } catch (e) {
            console.error('Error parsing saved preferences', e);
          }
        }
      }
      return;
    }
    
    // This is initial setup - user is skipping preference selection
    setSelectedPreferences([]); // Empty preferences = show all
    setHasSetPreferences(true);
    setShowPreferenceSelector(false);
    // Fetch streamers with default settings
    if (twitchAccessToken) {
      fetchLowViewerStreams(twitchAccessToken);
    }
  };
  
  // Render the preference selector
  const renderPreferenceSelector = () => {
    const isUpdate = hasSetPreferences;
    
    // Full-screen fixed position overlay for mobile
    const mobileOverlayStyle = isMobile ? {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 9999, // Ensure it's above everything
      touchAction: 'none' // Prevent scroll on mobile
    } : {};
    
    // Compact modal for mobile
    const mobileSelectorStyle = isMobile ? { 
      width: '85%', 
      maxWidth: '400px',
      maxHeight: '75vh',
      padding: '20px 15px',
      overflow: 'auto',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      position: 'relative',
      backgroundColor: '#2a2a2a',
      touchAction: 'auto' // Enable touch actions inside the modal
    } : {};
    
    // Better sized category grid for mobile
    const mobileCategoryGridStyle = isMobile ? { 
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '10px',
      margin: '15px 0',
      touchAction: 'auto'
    } : {};
    
    // Improved category card style for mobile
    const mobileCategoryCardStyle = (isSelected) => isMobile ? {
      padding: '12px 8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70px',
      position: 'relative',
      borderRadius: '12px',
      backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.5)' : 'rgba(50, 50, 50, 0.5)',
      border: isSelected ? '2px solid #a855f7' : '2px solid transparent',
      overflow: 'hidden'
    } : {};
    
    // Mobile-optimized button styles
    const mobileButtonStyle = (isPrimary) => isMobile ? {
      width: '100%',
      padding: '16px',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: isPrimary ? 'bold' : 'normal',
      marginBottom: '10px',
      border: 'none',
      backgroundColor: isPrimary ? '#a855f7' : '#3a3a3a',
      color: 'white',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
    } : {};
    
    // Handler to close when clicking outside the modal
    const handleOverlayClick = (e) => {
      if (e.target === e.currentTarget) {
        skipPreferences();
      }
    };

    return (
      <div 
        className={styles.preferenceSelectorOverlay} 
        style={mobileOverlayStyle}
        onClick={handleOverlayClick}
      >
        <div 
          className={styles.preferenceSelector} 
          style={mobileSelectorStyle}
          onClick={e => e.stopPropagation()} // Prevent clicks from bubbling up
        >
          {/* Close button for easy dismissal */}
          <button 
            onClick={skipPreferences}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(80, 80, 80, 0.5)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 10
            }}
            aria-label="Close preferences"
          >
            ✕
          </button>

          <h2 style={{ fontSize: isMobile ? '22px' : '24px', margin: '0 0 15px 0', textAlign: 'center' }}>
            {isUpdate ? 'Update Preferences' : 'Choose Stream Categories'}
          </h2>
          
          <p style={{ 
            fontSize: isMobile ? '14px' : '16px', 
            margin: '0 0 20px 0',
            textAlign: 'center',
            maxWidth: '90%',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            {isUpdate 
              ? 'Select up to 3 categories to update your recommendations' 
              : 'Pick up to 3 categories to see streamers you\'ll enjoy'}
          </p>
          
          <div style={mobileCategoryGridStyle}>
            {streamCategories.map(category => {
              const isSelected = selectedPreferences.includes(category.id);
              return (
                <div 
                  key={category.id}
                  onClick={() => togglePreference(category.id)}
                  style={{
                    ...mobileCategoryCardStyle(isSelected),
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                    {category.icon}
                  </div>
                  <div style={{ 
                    fontSize: isMobile ? '12px' : '14px',
                    textAlign: 'center',
                    fontWeight: isSelected ? 'bold' : 'normal'
                  }}>
                    {category.name}
                  </div>
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '5px',
                      right: '5px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#a855f7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: 'white'
                    }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '20px'
          }}>
            {selectedPreferences.length > 0 ? (
              <button 
                onClick={savePreferences}
                style={mobileButtonStyle(true)}
              >
                {isUpdate ? 'Update Preferences' : 'Save Preferences'} ({selectedPreferences.length}/3)
              </button>
            ) : (
              <button 
                onClick={skipPreferences}
                style={mobileButtonStyle(true)}
              >
                Skip / Show Everything
              </button>
            )}
            
            {selectedPreferences.length > 0 && (
              <button 
                onClick={skipPreferences}
                style={mobileButtonStyle(false)}
              >
                {isUpdate ? 'Cancel' : 'Skip / Show Everything'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Learning algorithm to refine preferences based on user interactions
  const learnFromInteraction = (categoryId, isLiked) => {
    // ... existing code ...
  };
  
  // Automatically update preferences based on interaction history
  const recalculatePreferences = (categoryStats) => {
    // ... existing code ...
  };
  
  // Update preferences based on learned preferences
  const updatePreferences = (newPreferences) => {
    // ... existing code ...
  };
  
  // Helper function to compare arrays
  const arraysEqual = (a, b) => {
    // ... existing code ...
  };

  // Mobile-optimized container styles
  const containerStyle = isMobile ? {
    padding: '10px 5px'
  } : {};
  
  // Mobile-optimized header styles
  const headerStyle = isMobile ? {
    padding: '5px'
  } : {};
  
  const headerButtonsStyle = isMobile ? {
    flexDirection: 'column',
    gap: '8px'
  } : {};
  
  return (
    <div className={styles.container} style={containerStyle}>
      <AuthModal 
        show={showAuthModal} 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)} 
        onLogin={() => window.location.href = '/login'}
        onSignup={() => window.location.href = '/signup'}
      />
      
      <div className={styles.header} style={headerStyle}>
        <h1>Dig Deeper</h1>
        <p>Discover and vote for your favorite Twitch streamers</p>
        
        <div className={styles.headerButtons} style={headerButtonsStyle}>
          <Link to="/leaderboard" className={styles.leaderboardLink} style={isMobile ? { width: '100%', textAlign: 'center' } : {}}>
            View Leaderboard
          </Link>
          
          {user ? (
            <Link to="/favorites" className={styles.favoritesLink} style={isMobile ? { width: '100%', textAlign: 'center' } : {}}>
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </Link>
          ) : (
            <button 
              onClick={() => {
                toast.info('Sign in to access your saved favorites!');
                setShowAuthModal(true);
              }}
              className={styles.favoritesLink}
              style={isMobile ? { width: '100%', textAlign: 'center' } : {}}
            >
              <span className={styles.heartIcon}>❤️</span> My Favorites
            </button>
          )}
          
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            width: isMobile ? '100%' : 'auto',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => setShowPreferenceSelector(true)}
              className={styles.preferencesButton}
              title="Update your content preferences"
              style={isMobile ? { flex: '1' } : {}}
            >
              <span className={styles.prefIcon}>⚙️</span> Preferences
            </button>
            
            <button
              onClick={fetchStreamers}
              className={`${styles.refreshButton} ${refreshing ? styles.refreshing : ''}`}
              title="Refresh real-time data from Twitch"
              disabled={refreshing}
              style={isMobile ? { flex: '1' } : {}}
            >
              <span className={styles.refreshIcon}>🔄</span> 
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
      
      <div className={styles.instructionsContainer} style={isMobile ? { margin: '5px 0' } : {}}>
        <div className={styles.instruction}>
          <span>👈</span>
          <p>Swipe left to pass</p>
        </div>
        <div className={styles.instruction}>
          <span>👉</span>
          <p>Swipe right to favorite</p>
        </div>
      </div>
      
      <div className={styles.cardsContainer} style={isMobile ? { 
        height: 'calc(65vh - 20px)',
        maxHeight: 'calc(65vh - 20px)'  
      } : {}}>
        {renderCards()}
      </div>
      
      {renderButtons()}
      
      {showPreferenceSelector && renderPreferenceSelector()}
    </div>
  );
};

export default DigDeeperPage; 