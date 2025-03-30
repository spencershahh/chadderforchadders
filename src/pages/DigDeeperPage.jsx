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

// Preloader component that silently loads the Twitch player for the next card
const StreamPreviewPreloader = ({ streamer }) => {
  const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
  
  if (!streamer || !streamer.username || !streamer.is_live) {
    return null;
  }
  
  // This iframe is not displayed, just preloaded in the DOM
  return (
    <div style={{ display: 'none', position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <iframe
        src={`https://player.twitch.tv/?channel=${streamer.username}&parent=${hostname}&muted=true&autoplay=false`}
        height="10"
        width="10"
        allowFullScreen={false}
        title={`Preload ${streamer.display_name} stream`}
      ></iframe>
    </div>
  );
};

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
  
  // Auto-playing preview state
  const [previewPlaying, setPreviewPlaying] = useState(null);
  const previewTimeoutRef = useRef(null);
  const preloadedStreamersRef = useRef(new Set());
  
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
  
  // Define the ASMR category ID for filtering
  const ASMR_CATEGORY_ID = '509659'; // ASMR category ID from Twitch
  
  // Helper function to check if a stream is ASMR content
  const isASMRContent = (stream) => {
    // Check if the game name or title contains ASMR (case insensitive)
    return (
      (stream.game_name && stream.game_name.toUpperCase().includes('ASMR')) || 
      (stream.title && stream.title.toUpperCase().includes('ASMR')) ||
      (stream.stream_title && stream.stream_title.toUpperCase().includes('ASMR'))
    );
  };
  
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
          
          // Apply ASMR filter after loading streams
          if (!selectedPreferences.includes(ASMR_CATEGORY_ID)) {
            setStreamers(current => current.filter(streamer => !isASMRContent(streamer)));
          }
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

  // Auto-start preview for current streamer
  useEffect(() => {
    if (streamers.length > 0 && currentIndex < streamers.length) {
      const currentStreamer = streamers[currentIndex];
      
      if (currentStreamer?.is_live) {
        // Preload the thumbnail image
        if (currentStreamer.thumbnail_url || currentStreamer.profile_image_url) {
          const img = new Image();
          img.src = currentStreamer.thumbnail_url || currentStreamer.profile_image_url;
        }
        
        // Auto-start preview after a very short delay
        previewTimeoutRef.current = setTimeout(() => {
          setPreviewPlaying(currentStreamer.twitch_id);
        }, 500); // Reduced delay for faster auto-playing
        
        // Preload the next 2 streams
        for (let i = 1; i <= 2; i++) {
          const nextIndex = currentIndex + i;
          if (nextIndex < streamers.length) {
            const nextStreamer = streamers[nextIndex];
            if (nextStreamer?.is_live) {
              preloadedStreamersRef.current.add(nextStreamer.twitch_id);
            }
          }
        }
      }
    }
    
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [currentIndex, streamers]);

  // Create a component for stream preview (defined inside main component to avoid hook errors)
  const StreamPreview = ({ streamer, onClose }) => {
    const [iframeLoading, setIframeLoading] = useState(true);
    const [iframeError, setIframeError] = useState(false);
    const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
    const wasPreloaded = preloadedStreamersRef.current.has(streamer.twitch_id);
    
    // Handle iframe load error
    const handleIframeError = () => {
      setIframeError(true);
      setIframeLoading(false);
    };
    
    // If this was preloaded, reduce the loading timeout
    useEffect(() => {
      const timeoutId = setTimeout(() => {
        if (iframeLoading) {
          console.log('Iframe loading timeout - forcing completion');
          setIframeLoading(false);
        }
      }, wasPreloaded ? 3000 : 8000); // Shorter timeout for preloaded streams
      
      return () => clearTimeout(timeoutId);
    }, [iframeLoading, wasPreloaded]);
    
    return (
      <div className={styles.previewContainer}>
        <div className={styles.previewHeader}>
          <span>🔴 LIVE PREVIEW</span>
          <button 
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        {(iframeLoading || iframeError) && (
          <div className={styles.previewLoading}>
            {!iframeError ? (
              <>
                <div className={styles.previewLoadingSpinner}></div>
                <div className={styles.previewLoadingText}>Loading stream{wasPreloaded ? '...' : ' (this may take a moment)...'}</div>
              </>
            ) : (
              <div className={styles.previewLoadingText}>Unable to load stream preview</div>
            )}
            <img 
              src={streamer.thumbnail_url || streamer.profile_image_url} 
              alt={`${streamer.display_name} thumbnail`}
              className={styles.previewPlaceholder}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/320x180/0e0e10/FFFFFF?text=Loading+Stream";
              }}
            />
            {iframeError && (
              <a 
                href={`https://twitch.tv/${streamer.username}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className={styles.previewExternalLink}
              >
                Watch on Twitch
              </a>
            )}
          </div>
        )}
        
        <iframe
          src={`https://player.twitch.tv/?channel=${streamer.username}&parent=${hostname}&muted=true&autoplay=true`}
          height="100%"
          width="100%"
          allowFullScreen={false}
          title={`${streamer.display_name} stream preview`}
          className={`${styles.previewFrame} ${iframeLoading ? styles.previewFrameLoading : ''}`}
          onLoad={() => setIframeLoading(false)}
          onError={handleIframeError}
        ></iframe>
      </div>
    );
  };

  // Render the streamer cards
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

        {/* Preload next streams for faster loading */}
        {streamers.length > 0 && currentIndex + 1 < streamers.length && (
          <StreamPreviewPreloader streamer={streamers[currentIndex + 1]} />
        )}
        {streamers.length > 0 && currentIndex + 2 < streamers.length && (
          <StreamPreviewPreloader streamer={streamers[currentIndex + 2]} />
        )}
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
    
    // Handle choosing a preference category
    const handleCategoryClick = (categoryId, event) => {
      // Ensure the click doesn't bubble up to the parent
      if (event) event.stopPropagation();
      togglePreference(categoryId);
    };
    
    // Handle saving preferences
    const handleSavePreferences = (e) => {
      if (e) e.stopPropagation();
      savePreferences();
    };
    
    // Handle skipping/canceling the preferences modal
    const handleSkip = (e) => {
      if (e) e.stopPropagation();
      skipPreferences();
    };
    
    // Handle clicking the overlay (outside the modal)
    const handleOverlayClick = (e) => {
      // Only close if clicking the actual overlay, not its children
      if (e.target === e.currentTarget) {
        skipPreferences();
      }
    };
    
    // Create preference selector component directly with optimized styles for mobile
    return (
      <div 
        className={styles.preferenceSelectorOverlay}
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div
          style={{
            backgroundColor: '#2a2a2a',
            borderRadius: '12px',
            padding: '12px 10px',
            width: isMobile ? '85%' : '500px',
            maxWidth: '400px',
            maxHeight: isMobile ? '70%' : '80vh',
            position: 'relative',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
            overflowY: 'auto',
            overflowX: 'hidden',
            touchAction: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button - made larger for easier tapping */}
          <button
            onClick={handleSkip}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(80, 80, 80, 0.6)',
              border: 'none',
              color: 'white',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 11,
              touchAction: 'manipulation'
            }}
          >
            ✕
          </button>
          
          <h2 style={{
            fontSize: isMobile ? '18px' : '22px',
            textAlign: 'center',
            marginTop: '0',
            marginBottom: '6px',
            paddingRight: '25px',
            color: '#fff'
          }}>
            {isUpdate ? 'Update Preferences' : 'Choose Categories'}
          </h2>
          
          <p style={{
            fontSize: isMobile ? '13px' : '15px',
            textAlign: 'center',
            marginBottom: '8px',
            color: 'rgba(255, 255, 255, 0.7)',
            maxWidth: '90%',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            Select up to 3 categories
          </p>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            marginBottom: '10px',
            marginTop: '8px',
            touchAction: 'auto'
          }}>
            {streamCategories.map(category => {
              const isSelected = selectedPreferences.includes(category.id);
              return (
                <div
                  key={category.id}
                  onClick={(event) => handleCategoryClick(category.id, event)}
                  style={{
                    padding: '6px 2px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? 'rgba(169, 112, 255, 0.3)' : 'rgba(50, 50, 50, 0.5)',
                    border: isSelected ? '2px solid #a970ff' : '2px solid transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '48px',
                    position: 'relative',
                    cursor: 'pointer',
                    touchAction: 'manipulation'
                  }}
                >
                  <div style={{ fontSize: '18px', marginBottom: '2px' }}>
                    {category.icon}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    textAlign: 'center',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    color: '#fff',
                    lineHeight: '1.1'
                  }}>
                    {category.name}
                  </div>
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      width: '14px',
                      height: '14px',
                      backgroundColor: '#a970ff',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      color: 'white'
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '8px'
          }}>
            {/* Primary button - save/update preferences or skip */}
            {selectedPreferences.length > 0 ? (
              <button
                onClick={handleSavePreferences}
                style={{
                  backgroundColor: '#a970ff',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                {isUpdate ? 'Update' : 'Save'} ({selectedPreferences.length}/3)
              </button>
            ) : (
              <button
                onClick={handleSkip}
                style={{
                  backgroundColor: '#3a3a3a',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                Skip
              </button>
            )}
            
            {/* Secondary button - only show if categories are selected */}
            {selectedPreferences.length > 0 && (
              <button
                onClick={handleSkip}
                style={{
                  backgroundColor: '#3a3a3a', 
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                {isUpdate ? 'Cancel' : 'Skip'}
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
  
  // Render stream preview
  const renderStreamPreview = (streamer) => {
    if (previewPlaying === streamer.twitch_id) {
      return <StreamPreview streamer={streamer} onClose={() => setPreviewPlaying(null)} />;
    }
    
    return (
      <button
        className={styles.previewButton}
        onClick={() => setPreviewPlaying(streamer.twitch_id)}
      >
        ▶️ Watch Preview
      </button>
    );
  };

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