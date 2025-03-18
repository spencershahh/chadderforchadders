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

  const fetchLowViewerStreams = async (accessToken) => {
    try {
      setLoading(true);
      toast.loading('Looking for small streamers...', { id: 'loading' });
      
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      if (!clientId || !accessToken) {
        throw new Error('Twitch API credentials or token missing');
      }
      
      let allStreamers = [];
      
      // Use a simple query to get English-speaking streamers
      const queryParams = new URLSearchParams({
        first: 100,
        language: 'en'
      });
      
      const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!streamsResponse.ok) {
        throw new Error(`Error fetching streams: ${streamsResponse.status}`);
      }
      
      const streamsData = await streamsResponse.json();
      
      // Filter for streams with less than 10 viewers
      const lowViewerStreams = [];
      
      if (streamsData && streamsData.data && Array.isArray(streamsData.data)) {
        for (let i = 0; i < streamsData.data.length; i++) {
          const stream = streamsData.data[i];
          if (stream && typeof stream.viewer_count === 'number' && stream.viewer_count < 10) {
            lowViewerStreams.push({
              id: stream.user_id,
              twitch_id: stream.user_id,
              username: stream.user_login,
              display_name: stream.user_name,
              is_live: true,
              view_count: stream.viewer_count,
              game_name: stream.game_name || "",
              stream_title: stream.title || "",
              thumbnail_url: stream.thumbnail_url ? 
                stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                null,
              votes: 0
            });
          }
        }
      }
      
      allStreamers = lowViewerStreams;
      
      // If we have streamers, get their profile data
      if (allStreamers.length > 0) {
        // Extract unique user IDs for profile lookup
        const userIds = [];
        for (let i = 0; i < allStreamers.length; i++) {
          if (allStreamers[i].twitch_id) {
            userIds.push(allStreamers[i].twitch_id);
          }
        }
        
        // Remove duplicates
        const uniqueUserIds = [...new Set(userIds)];
        
        // Fetch user profiles in batches of 100
        for (let i = 0; i < uniqueUserIds.length; i += 100) {
          const idBatch = uniqueUserIds.slice(i, i + 100);
          const userQueryParams = [];
          
          for (let j = 0; j < idBatch.length; j++) {
            userQueryParams.push(`id=${idBatch[j]}`);
          }
          
          const userQueryString = userQueryParams.join('&');
          
          try {
            const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${userQueryString}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (!usersResponse.ok) {
              console.error(`Error fetching user data: ${usersResponse.status}`);
              continue;
            }
            
            const userData = await usersResponse.json();
            
            // Create a lookup map for easier access
            const userDataMap = {};
            if (userData && userData.data && Array.isArray(userData.data)) {
              for (let j = 0; j < userData.data.length; j++) {
                const user = userData.data[j];
                if (user && user.id) {
                  userDataMap[user.id] = user;
                }
              }
            }
            
            // Enhance streamer data with profile information
            allStreamers = allStreamers.map(streamer => {
              if (!streamer || !streamer.twitch_id) return streamer;
              
              const profile = userDataMap[streamer.twitch_id];
              if (profile) {
                return {
                  ...streamer,
                  profile_image_url: profile.profile_image_url || null,
                  description: profile.description || null
                };
              }
              return streamer;
            });
          } catch (profileError) {
            console.error('Error fetching user profiles:', profileError);
            // Continue with what we have
          }
        }
      }
      
      if (allStreamers.length === 0) {
        toast.error('No small streamers found right now. Try again later.', { id: 'loading' });
      } else {
        setStreamers(allStreamers);
        setCurrentIndex(0);
        toast.success(`Found ${allStreamers.length} small streamers!`, { id: 'loading' });
      }
    } catch (error) {
      console.error('Error fetching low-viewer streams:', error);
      toast.error(error.message || 'Failed to load streamers', { id: 'loading' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamers = async () => {
    if (refreshing) return; // Prevent multiple clicks
    
    setRefreshing(true);
    toast.loading('Finding small streamers...', { id: 'refresh' });
    
    try {
      // Clear existing streamer data to avoid showing stale data
      setStreamers([]);
      
      if (twitchAccessToken) {
        // Use the existing token to refresh data from Twitch
        await fetchLowViewerStreams(twitchAccessToken);
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
        await fetchLowViewerStreams(accessToken);
      }
      
      toast.success('Found new small streamers!', { id: 'refresh' });
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
    // Record in history that user swiped left if they're logged in
    const currentStreamer = streamers[currentIndex];
    
    // Move to next card immediately to prevent UI freeze
    nextCard();
    
    // Only record this if user is logged in and we have the streamer in our database
    if (user && currentStreamer?.twitch_id) {
      try {
        // Check if streamer exists in our database
        const { data: existingStreamer } = await supabase
          .from('twitch_streamers')
          .select('id')
          .eq('twitch_id', currentStreamer.twitch_id)
          .single();
          
        // Only record if we have this streamer in our database
        if (existingStreamer) {
          await supabase
            .from('user_history')
            .upsert({
              user_id: user.id,
              streamer_id: existingStreamer.id,
              interaction_type: 'swiped_left'
            });
        }
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
    if (loading || !twitchAccessToken) return;
    
    try {
      setLoading(true);
      
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      
      // Use a simple query to get more English-speaking streamers
      const queryParams = new URLSearchParams({
        first: 100,
        language: 'en'
      });
      
      const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${twitchAccessToken}`
        }
      });
      
      if (!streamsResponse.ok) {
        throw new Error(`Error fetching streams: ${streamsResponse.status}`);
      }
      
      const streamsData = await streamsResponse.json();
      
      // Filter for streams with less than 10 viewers
      const newLowViewerStreams = [];
      
      if (streamsData && streamsData.data && Array.isArray(streamsData.data)) {
        for (let i = 0; i < streamsData.data.length; i++) {
          const stream = streamsData.data[i];
          if (stream && typeof stream.viewer_count === 'number' && stream.viewer_count < 10) {
            newLowViewerStreams.push({
              id: stream.user_id,
              twitch_id: stream.user_id,
              username: stream.user_login,
              display_name: stream.user_name,
              is_live: true,
              view_count: stream.viewer_count,
              game_name: stream.game_name || "",
              stream_title: stream.title || "",
              thumbnail_url: stream.thumbnail_url ? 
                stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
                null,
              votes: 0
            });
          }
        }
      }
      
      if (newLowViewerStreams.length > 0) {
        // Get profile data for new streamers
        const userIds = [];
        for (let i = 0; i < newLowViewerStreams.length; i++) {
          if (newLowViewerStreams[i].twitch_id) {
            userIds.push(newLowViewerStreams[i].twitch_id);
          }
        }
        
        // Remove duplicates
        const uniqueUserIds = [...new Set(userIds)];
        
        if (uniqueUserIds.length > 0) {
          try {
            const userQueryParams = [];
            for (let i = 0; i < uniqueUserIds.length; i++) {
              userQueryParams.push(`id=${uniqueUserIds[i]}`);
            }
            
            const userQueryString = userQueryParams.join('&');
            
            const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${userQueryString}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${twitchAccessToken}`
              }
            });
            
            if (usersResponse.ok) {
              const userData = await usersResponse.json();
              
              // Create a lookup map
              const userDataMap = {};
              if (userData && userData.data && Array.isArray(userData.data)) {
                for (let i = 0; i < userData.data.length; i++) {
                  const user = userData.data[i];
                  if (user && user.id) {
                    userDataMap[user.id] = user;
                  }
                }
              }
              
              // Add profile data
              for (let i = 0; i < newLowViewerStreams.length; i++) {
                const streamer = newLowViewerStreams[i];
                if (streamer && streamer.twitch_id && userDataMap[streamer.twitch_id]) {
                  const profile = userDataMap[streamer.twitch_id];
                  newLowViewerStreams[i] = {
                    ...streamer,
                    profile_image_url: profile.profile_image_url || null,
                    description: profile.description || null
                  };
                }
              }
            }
          } catch (profileError) {
            console.error('Error fetching profiles for new batch:', profileError);
            // Continue with what we have
          }
        }
        
        // Append new streamers to the existing list
        setStreamers(prev => [...prev, ...newLowViewerStreams]);
        
        // Don't advance the currentIndex, just add to the list
        toast.success(`Found ${newLowViewerStreams.length} more streamers!`, { duration: 2000 });
      } else {
        // If no new streamers found, try again with different params later
        setTimeout(() => fetchMoreStreamers(), 1000);
      }
    } catch (error) {
      console.error('Error fetching more streamers:', error);
      toast.error('Error loading more streamers', { duration: 3000 });
    } finally {
      setLoading(false);
    }
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
