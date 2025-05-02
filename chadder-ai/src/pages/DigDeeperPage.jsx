import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useActivityTracker } from '../hooks/useActivityTracker';
import styles from './DigDeeperPage.module.css';
import AuthModal from '../components/AuthModal';

const isDevelopment = typeof import.meta !== 'undefined' && 
  import.meta.env && 
  (import.meta.env.DEV || window.location.hostname === 'localhost');

// Stream preview player with improved rendering
const StreamPreview = ({ streamer, onClose }) => {
  if (!streamer || !streamer.username) {
    return (
      <div className={styles.previewContainer}>
        <div className={styles.previewHeader}>
          <span>🔴 LIVE PREVIEW</span>
          <button className={styles.previewCloseButton} onClick={onClose}>✕</button>
        </div>
        <div className={styles.previewLoading}>
          <div className={styles.previewLoadingText}>Streamer data unavailable</div>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  
  // Get hostname safely
  let hostname = 'localhost';
  try {
    hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
  } catch (e) {
    console.error('Error getting hostname:', e);
  }
  
  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <span>🔴 LIVE PREVIEW</span>
        <button className={styles.previewCloseButton} onClick={onClose}>✕</button>
      </div>
      
      {loading && (
        <div className={styles.previewLoading}>
          <div className={styles.previewLoadingSpinner}></div>
          <div className={styles.previewLoadingText}>Loading stream...</div>
        </div>
      )}
      
      <iframe
        src={`https://player.twitch.tv/?channel=${streamer.username}&parent=${hostname}&muted=true&autoplay=true`}
        height="100%"
        width="100%"
        allowFullScreen={false}
        title={`${streamer.display_name || streamer.username} stream preview`}
        className={`${styles.previewFrame} ${loading ? styles.previewFrameLoading : ''}`}
        onLoad={() => setLoading(false)}
      ></iframe>
    </div>
  );
};

// Advanced preloader component that preloads actual iframes for streams
const AdvancedStreamerPreloader = ({ streamers, currentIndex }) => {
  if (!streamers || streamers.length === 0) return null;
  
  // Get hostname safely
  let hostname = 'localhost';
  try {
    hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
  } catch (e) {
    console.error('Error getting hostname:', e);
  }
  
  // Only preload the next streamer (to avoid excessive resource usage)
  const nextIndex = currentIndex + 1;
  if (nextIndex >= streamers.length) return null;
  
  const nextStreamer = streamers[nextIndex];
  if (!nextStreamer || !nextStreamer.username || !nextStreamer.is_live) return null;
  
  return (
    <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', overflow: 'hidden', width: 0, height: 0 }}>
      <iframe
        key={`preload-iframe-${nextStreamer.twitch_id}`}
        src={`https://player.twitch.tv/?channel=${nextStreamer.username}&parent=${hostname}&muted=true&autoplay=false`}
        height="1px"
        width="1px"
        title={`Preload ${nextStreamer.display_name || nextStreamer.username}`}
        tabIndex="-1"
        aria-hidden="true"
      ></iframe>
    </div>
  );
};

// Main component
const DigDeeperPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [twitchAccessToken, setTwitchAccessToken] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [currentChatStreamer, setCurrentChatStreamer] = useState(null);
  const [preloadedStreamers, setPreloadedStreamers] = useState(new Set());
  const [autoPlayDelay, setAutoPlayDelay] = useState(500);
  const [authChecked, setAuthChecked] = useState(false);
  
  // Activity tracking
  const { trackDigDeeper } = useActivityTracker();
  
  // Debug auth state
  useEffect(() => {
    console.log('Auth state:', { user, authChecked, showAuthModal });
  }, [user, authChecked, showAuthModal]);
  
  // Authentication check - only run when user state changes
  useEffect(() => {
    const checkAuth = async () => {
      // Check for active session directly from supabase
      const { data: session } = await supabase.auth.getSession();
      
      // If we have an active session or user object, user is logged in
      if (session?.session || user) {
        setShowAuthModal(false);
        setAuthChecked(true);
        return;
      }
      
      // If we've confirmed there's no user AND we've verified no active session, show auth modal
      if (user === null && !session?.session) {
        setShowAuthModal(true);
        setAuthChecked(true);
        return;
      }
      
      // If we're still loading auth state (user is undefined), don't show modal yet
      setAuthChecked(false);
    };
    
    checkAuth();
  }, [user]);

  // Ensure auth modal state is reset when component unmounts
  useEffect(() => {
    return () => {
      setShowAuthModal(false);
      setAuthChecked(false);
    };
  }, []);
  
  // Immediately check auth status on component mount
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // Get the current session
        const { data } = await supabase.auth.getSession();
        
        // If we have a session but no user object yet, keep modal closed
        if (data?.session?.user) {
          setShowAuthModal(false);
          setAuthChecked(true);
        }
      } catch (err) {
        console.error('Error verifying auth:', err);
      }
    };
    
    verifyAuth();
  }, []);
  
  // Preference selector state
  const [showPreferenceSelector, setShowPreferenceSelector] = useState(false);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [showASMR, setShowASMR] = useState(false);
  
  // State for dynamic categories
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // Set up animation controls
  const controls = useAnimation();
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Get viewport width for responsive behavior
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const isMobile = viewportWidth < 768;
  
  // Update viewport width on resize
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Track user's swipe history
  const getSwiped = useCallback(() => {
    try {
      const swipedHistory = localStorage.getItem('swipedStreamers');
      return swipedHistory ? JSON.parse(swipedHistory) : { left: {}, right: {} };
    } catch (error) {
      console.error('Error getting swiped history:', error);
      return { left: {}, right: {} };
    }
  }, []);
  
  const addToSwiped = useCallback((streamerId, direction) => {
    try {
      const swiped = getSwiped();
      swiped[direction][streamerId] = Date.now();
      localStorage.setItem('swipedStreamers', JSON.stringify(swiped));
    } catch (error) {
      console.error('Error adding to swiped history:', error);
    }
  }, [getSwiped]);
  
  // Fetch streamers with existing votes from database
  const fetchVotedStreamers = useCallback(async (twitchToken, clientId) => {
    try {
      // Get streamers sorted by vote count (highest first)
      const { data: votedData, error: votedError } = await supabase
        .from('votes')
        .select('streamer, count(*)')
        .group('streamer')
        .order('count', { ascending: false })
        .limit(20);
      
      if (votedError) {
        console.error('Error fetching voted streamers:', votedError);
        return [];
      }
      
      if (!votedData || votedData.length === 0) {
        return [];
      }
      
      // Extract unique streamer usernames
      const uniqueStreamers = Array.from(new Set(votedData.map(item => item.streamer)))
        .filter(streamer => Boolean(streamer));
      
      if (uniqueStreamers.length === 0) {
        return [];
      }
      
      // Create a map for quick lookup of vote counts
      const voteCountMap = {};
      votedData.forEach(item => {
        if (item.streamer) {
          voteCountMap[item.streamer] = item.count;
        }
      });
      
      // Get streamer data from Twitch API
      const streamerQueryParams = uniqueStreamers.map(login => `login=${login}`).join('&');
      const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${streamerQueryParams}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${twitchToken}`
        }
      });
      
      if (!usersResponse.ok) {
        console.error('Error fetching user data from Twitch:', usersResponse.status);
        return [];
      }
      
      const userData = await usersResponse.json();
      
      if (!userData?.data || !Array.isArray(userData.data)) {
        return [];
      }
      
      // Get live status for these streamers
      const userIds = userData.data.map(user => user.id).filter(Boolean);
      
      if (userIds.length === 0) {
        return [];
      }
      
      const streamsQueryParams = userIds.map(id => `user_id=${id}`).join('&');
      const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${streamsQueryParams}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${twitchToken}`
        }
      });
      
      let liveStreams = [];
      
      if (streamsResponse.ok) {
        const streamsData = await streamsResponse.json();
        liveStreams = streamsData?.data || [];
      }
      
      // Create a map for live stream data
      const liveStreamMap = {};
      liveStreams.forEach(stream => {
        if (stream.user_id) {
          liveStreamMap[stream.user_id] = stream;
        }
      });
      
      // Format streamer data
      const formattedStreamers = userData.data.map(user => {
        const liveStream = liveStreamMap[user.id];
        const voteCount = voteCountMap[user.login] || 0;
        
        return {
          id: user.id,
          twitch_id: user.id,
          username: user.login,
          display_name: user.display_name,
          is_live: Boolean(liveStream),
          view_count: liveStream ? liveStream.viewer_count : 0,
          game_name: liveStream ? liveStream.game_name : "",
          stream_title: liveStream ? liveStream.title : "",
          thumbnail_url: liveStream ? 
            liveStream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : 
            null,
          profile_image_url: user.profile_image_url,
          description: user.description,
          vote_count: voteCount,
          category_id: liveStream ? liveStream.game_id : null
        };
      });
      
      // Filter for small streamers (5-50 viewers) who are live
      return formattedStreamers
        .filter(streamer => 
          streamer.is_live && 
          typeof streamer.view_count === 'number' && 
          streamer.view_count >= 5 && 
          streamer.view_count <= 50
        )
        .sort((a, b) => b.vote_count - a.vote_count);
        
    } catch (error) {
      console.error('Error in fetchVotedStreamers:', error);
      return [];
    }
  }, []);
  
  // Define some quick chat messages
  const [quickMessages, setQuickMessages] = useState([
    { id: 1, text: "Hi there! Just discovered your stream!" },
    { id: 2, text: "Love the content! How long have you been streaming?" },
    { id: 3, text: "What game/content are you planning next?" }
  ]);
  
  // Stream categories with icons (fallback/default)
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
    { id: '498506', name: 'ASMR', icon: '🎧' }
  ];
  
  // Get active categories - either dynamic or fallback
  const activeCategories = useMemo(() => {
    return dynamicCategories.length > 0 ? dynamicCategories : streamCategories;
  }, [dynamicCategories, streamCategories]);
  
  // Fetch top game categories from Twitch
  const fetchTopCategories = useCallback(async () => {
    if (loadingCategories) return;
    
    try {
      setLoadingCategories(true);
      
      // Check localStorage cache first (cache for 24 hours)
      const cachedData = localStorage.getItem('twitch_top_categories');
      const cacheTimestamp = localStorage.getItem('twitch_top_categories_timestamp');
      const cacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : null;
      const cacheValid = cachedData && cacheAge && cacheAge < 24 * 60 * 60 * 1000;
      
      if (cacheValid) {
        try {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('Using cached top categories', parsed.length);
            setDynamicCategories(parsed);
            setLoadingCategories(false);
            return;
          }
        } catch (e) {
          console.error('Error parsing cached categories', e);
        }
      }
      
      // Get Twitch credentials
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Twitch API credentials missing');
      }
      
      // Get Twitch access token if needed
      let accessToken = twitchAccessToken;
      
      if (!accessToken) {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
        }
        
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        
        if (!accessToken) {
          throw new Error('No access token received from Twitch');
        }
        
        setTwitchAccessToken(accessToken);
      }
      
      // Fetch top games from Twitch
      const gamesResponse = await fetch('https://api.twitch.tv/helix/games/top?first=15', {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!gamesResponse.ok) {
        throw new Error(`Error fetching top games: ${gamesResponse.status}`);
      }
      
      const gamesData = await gamesResponse.json();
      
      if (!gamesData?.data || !Array.isArray(gamesData.data)) {
        throw new Error('Invalid response format for top games');
      }
      
      // Map to our format and assign emojis
      const categoryEmojis = {
        'Just Chatting': '💬',
        'Music': '🎵',
        'Art': '🎨',
        'Sports': '⚽',
        'ASMR': '🎧',
        'IRL': '📱',
        'Fortnite': '🔫',
        'VALORANT': '🎯',
        'Minecraft': '⛏️',
        'League of Legends': '🧙',
        'Grand Theft Auto V': '🚗',
        'Call of Duty': '🎖️',
        'Apex Legends': '🦊',
        'Counter-Strike': '🔫',
        'Dota 2': '🧙‍♂️',
        'Overwatch': '🦸',
        'Slots': '🎰',
        'World of Warcraft': '⚔️',
        'Dead by Daylight': '🔪',
        'Escape from Tarkov': '🧪'
      };
      
      // Generic emojis for games without specific ones
      const genericEmojis = ['🎮', '🕹️', '👾', '🎯', '⚔️', '🏆', '🎲', '🔥'];
      
      // Helper to get an emoji for a game
      const getEmojiForGame = (gameName) => {
        // Try exact match first
        if (categoryEmojis[gameName]) return categoryEmojis[gameName];
        
        // Try partial match
        for (const [key, emoji] of Object.entries(categoryEmojis)) {
          if (gameName.includes(key) || key.includes(gameName)) {
            return emoji;
          }
        }
        
        // Use generic emoji based on game name length as a consistent hash
        return genericEmojis[gameName.length % genericEmojis.length];
      };
      
      const mappedCategories = gamesData.data.map(game => ({
        id: game.id,
        name: game.name,
        icon: getEmojiForGame(game.name)
      }));
      
      // Always include Just Chatting, IRL & ASMR if not already in the list
      const justChatting = { id: '509658', name: 'Just Chatting', icon: '💬' };
      const irl = { id: '509673', name: 'IRL', icon: '📱' };
      const asmr = { id: '498506', name: 'ASMR', icon: '🎧' };
      
      const hasJustChatting = mappedCategories.some(cat => cat.id === justChatting.id);
      const hasIRL = mappedCategories.some(cat => cat.id === irl.id);
      const hasASMR = mappedCategories.some(cat => cat.id === asmr.id);
      
      if (!hasJustChatting) mappedCategories.unshift(justChatting);
      if (!hasIRL) mappedCategories.push(irl);
      if (!hasASMR) mappedCategories.push(asmr);
      
      // Set the dynamic categories
      setDynamicCategories(mappedCategories);
      
      // Cache the results
      localStorage.setItem('twitch_top_categories', JSON.stringify(mappedCategories));
      localStorage.setItem('twitch_top_categories_timestamp', Date.now().toString());
      
    } catch (error) {
      console.error('Error fetching top categories:', error);
      // Fallback to static categories
      setDynamicCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  }, [twitchAccessToken, loadingCategories]);
  
  // Fetch top categories when component mounts
  useEffect(() => {
    fetchTopCategories();
  }, [fetchTopCategories]);
  
  // Function to go to next card
  const nextCard = useCallback(() => {
    if (previewPlaying) {
      setPreviewPlaying(null);
    }
    
    controls.set({ x: 0, rotateZ: 0 });
    setCurrentIndex(prev => prev + 1);
  }, [controls, previewPlaying]);
  
  // Save vote to database
  const saveVote = useCallback(async (streamer) => {
    if (!user) return;
    
    try {
      // Save vote to database
      const { error } = await supabase
        .from('votes')
        .insert([
          { 
            streamer: streamer.username,
            user_id: user.id,
            amount: 1
          }
        ]);
      
      if (error) {
        console.error('Error saving vote:', error);
        toast.error('Failed to save your vote.');
      } else {
        console.log('Vote saved successfully for', streamer.username);
      }
    } catch (err) {
      console.error('Exception saving vote:', err);
    }
  }, [user]);
  
  // Save favorite to database
  const saveFavorite = useCallback(async (streamer) => {
    if (!user) return;
    
    try {
      // Check if already favorited
      const { data: existingFavorite, error: checkError } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .eq('streamer_id', streamer.twitch_id);
      
      if (checkError) {
        console.error('Error checking for existing favorite:', checkError);
        return;
      }
      
      // If already favorited, don't add again
      if (existingFavorite && existingFavorite.length > 0) {
        console.log('Streamer already in favorites');
        return;
      }
      
      // Save to favorites table
      const { error } = await supabase
        .from('favorites')
        .insert([
          { 
            user_id: user.id,
            streamer_id: streamer.twitch_id,
            streamer_username: streamer.username,
            streamer_display_name: streamer.display_name || streamer.username,
            profile_image_url: streamer.profile_image_url,
            added_at: new Date().toISOString()
          }
        ]);
      
      if (error) {
        console.error('Error saving favorite:', error);
        toast.error('Failed to add to favorites.');
      } else {
        console.log('Favorite saved successfully for', streamer.username);
        toast.success('Added to favorites!');
      }
    } catch (err) {
      console.error('Exception saving favorite:', err);
    }
  }, [user]);
  
  // Handle swipe events
  const handleSwipeRight = useCallback((streamer) => {
    const currentStreamer = streamers[currentIndex];
    
    if (!user) {
      // Check for session before showing auth modal
      supabase.auth.getSession().then(({ data }) => {
        if (!data?.session) {
          toast.info('Sign in to save favorites!');
          setShowAuthModal(true);
        } else {
          // We have a session but user object might not be loaded yet
          // Still save the favorite
          saveVote(currentStreamer);
          saveFavorite(currentStreamer);
          addToSwiped(currentStreamer.twitch_id, 'right');
        }
      });
    } else if (currentStreamer) {
      // Save vote to database
      saveVote(currentStreamer);
      
      // Save to favorites
      saveFavorite(currentStreamer);
      
      // Track this swipe in history
      addToSwiped(currentStreamer.twitch_id, 'right');
    }
    
    nextCard();
  }, [nextCard, currentIndex, streamers, user, saveVote, addToSwiped, saveFavorite]);
  
  const handleSwipeLeft = useCallback(() => {
    // Track this swipe in history
    const currentStreamer = streamers[currentIndex];
    if (currentStreamer) {
      addToSwiped(currentStreamer.twitch_id, 'left');
    }
    nextCard();
  }, [nextCard, streamers, currentIndex, addToSwiped]);
  
  // Handle drag events
  const handleDragStart = useCallback((event, info) => {
    setDragStart({ x: info.point.x, y: info.point.y });
  }, []);
  
  const handleDragEnd = useCallback((event, info) => {
    const dragEndX = info.point.x;
    const deltaX = dragEndX - dragStart.x;
    const threshold = isMobile ? viewportWidth * 0.15 : 100;
    
    if (deltaX > threshold) {
      // Swiped right - favorite
      controls.start({ 
        x: viewportWidth, 
        rotateZ: 10, 
        transition: { duration: 0.3 } 
      }).then(() => {
        const currentStreamer = streamers[currentIndex];
        handleSwipeRight(currentStreamer);
      });
    } else if (deltaX < -threshold) {
      // Swiped left - pass
      controls.start({ 
        x: -viewportWidth, 
        rotateZ: -10, 
        transition: { duration: 0.3 } 
      }).then(() => {
        handleSwipeLeft();
      });
    } else {
      // Reset if not swiped far enough
      controls.start({ 
        x: 0, 
        rotateZ: 0, 
        transition: { type: 'spring', stiffness: 300, damping: 20 } 
      });
    }
  }, [controls, dragStart, handleSwipeLeft, handleSwipeRight, isMobile, viewportWidth, streamers, currentIndex]);
  
  // Auto-play with optimized timing based on preloaded status
  useEffect(() => {
    if (!streamers || streamers.length === 0 || currentIndex >= streamers.length) {
      return;
    }
    
    const currentStreamer = streamers[currentIndex];
    
    // Only auto-play if the streamer is live
    if (currentStreamer && currentStreamer.is_live) {
      // Use a shorter delay if already preloaded
      const delay = preloadedStreamers.has(currentStreamer.twitch_id) ? 300 : autoPlayDelay;
      
      const autoPlayTimeout = setTimeout(() => {
        setPreviewPlaying(currentStreamer.twitch_id);
      }, delay);
      
      return () => clearTimeout(autoPlayTimeout);
    }
  }, [currentIndex, streamers, preloadedStreamers, autoPlayDelay]);
  
  // Enhanced preloading effect - mark streamers as preloaded
  useEffect(() => {
    if (!streamers || streamers.length === 0) return;
    
    // Preload thumbnails
    const preloadCount = Math.min(5, streamers.length);
    const newPreloadedStreamers = new Set(preloadedStreamers);
    
    for (let i = 0; i < preloadCount; i++) {
      const streamer = streamers[i];
      if (!streamer) continue;
      
      // Preload thumbnail
      if (streamer.thumbnail_url || streamer.profile_image_url) {
        const img = new Image();
        img.src = streamer.thumbnail_url || streamer.profile_image_url;
        
        // Mark as preloaded
        newPreloadedStreamers.add(streamer.twitch_id);
      }
    }
    
    setPreloadedStreamers(newPreloadedStreamers);
  }, [streamers]);
  
  // Simplified fetch streamers function with immediate preloading
  const fetchStreamers = useCallback(async () => {
    if (loading || refreshing) return;
    
    setLoading(true);
    setRefreshing(true);
    
    try {
      // Get Twitch credentials
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Twitch API credentials missing');
      }
      
      // Get Twitch access token
      let accessToken = twitchAccessToken;
      
      if (!accessToken) {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
        }
        
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        
        if (!accessToken) {
          throw new Error('No access token received from Twitch');
        }
        
        setTwitchAccessToken(accessToken);
      }
      
      // Get swipe history to avoid showing streamers the user has already seen
      const swipeHistory = getSwiped();
      const alreadySeen = new Set([
        ...Object.keys(swipeHistory.left),
        ...Object.keys(swipeHistory.right)
      ]);
      
      // 1. First fetch streamers with existing votes (30-40% of total)
      const votedStreamers = await fetchVotedStreamers(accessToken, clientId);
      
      // Choose categories based on preferences or select randomly
      let categoriesToSearch = [];
      if (selectedPreferences.length > 0) {
        categoriesToSearch = selectedPreferences;
      } else {
        // Filter out ASMR if not specifically selected
        const categoriesWithoutASMR = activeCategories
          .filter(cat => showASMR || cat.id !== '498506') // Filter out ASMR unless showASMR is true
          .map(cat => cat.id);
        
        categoriesToSearch = [...categoriesWithoutASMR]
          .sort(() => 0.5 - Math.random())
          .slice(0, 5);
      }
      
      let randomStreamers = [];
      
      // Try different game categories to find small streamers
      for (const gameId of categoriesToSearch) {
        if (randomStreamers.length >= 20) break; // Stop if we have enough
        
        try {
          // Get streams for this game
          const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?first=100&game_id=${gameId}&language=en`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!streamsResponse.ok) continue;
          
          const streamsData = await streamsResponse.json();
          
          // Filter for small streams (5-50 viewers)
          if (streamsData?.data && Array.isArray(streamsData.data)) {
            // Sort by viewer count (lowest first)
            const sortedStreams = [...streamsData.data]
              .sort((a, b) => (a.viewer_count || 999) - (b.viewer_count || 999))
              .filter(stream => 
                stream && 
                typeof stream.viewer_count === 'number' && 
                stream.viewer_count >= 5 && 
                stream.viewer_count <= 50
              )
              .slice(0, 4); // Take just a few from each category
            
            // Map to our format
            const formattedStreams = sortedStreams.map(stream => ({
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
              category_id: gameId,
              vote_count: 0
            }));
            
            // Add new streamers to our list
            randomStreamers = [...randomStreamers, ...formattedStreams];
          }
        } catch (error) {
          console.error(`Error processing game ${gameId}:`, error);
        }
      }
      
      // Combine voted and random streamers, with a cap on percentage of voted streamers
      // Filter out streamers the user has already seen
      const filteredVotedStreamers = votedStreamers
        .filter(streamer => streamer && streamer.twitch_id && !alreadySeen.has(streamer.twitch_id));
      
      const filteredRandomStreamers = randomStreamers
        .filter(streamer => streamer && streamer.twitch_id && !alreadySeen.has(streamer.twitch_id));
      
      // Calculate how many voted streamers to include (aim for 30-40% of total)
      const totalStreamers = 20; // Target total number of streamers
      const maxVotedStreamers = Math.floor(totalStreamers * 0.4); // 40% max
      
      // Take only the number needed from voted streamers
      const selectedVotedStreamers = filteredVotedStreamers.slice(0, maxVotedStreamers);
      
      // Fill the rest with random streamers
      const remainingSlots = totalStreamers - selectedVotedStreamers.length;
      const selectedRandomStreamers = filteredRandomStreamers.slice(0, remainingSlots);
      
      // Combine lists with voted streamers first
      let allStreamers = [...selectedVotedStreamers, ...selectedRandomStreamers];
      
      // Get unique streamers
      const uniqueStreamers = [];
      const seenIds = new Set();
      
      for (const streamer of allStreamers) {
        if (!seenIds.has(streamer.twitch_id)) {
          seenIds.add(streamer.twitch_id);
          uniqueStreamers.push(streamer);
        }
      }
      
      // Filter out ASMR streamers based on title unless specifically chosen
      let filteredStreamers = uniqueStreamers;
      if (!showASMR) {
        filteredStreamers = uniqueStreamers.filter(streamer => {
          // Filter out streams with ASMR in the title or category
          const hasASMRTitle = streamer.stream_title && 
                             streamer.stream_title.toUpperCase().includes('ASMR');
          const isASMRCategory = streamer.category_id === '498506';
          return !(hasASMRTitle || isASMRCategory);
        });
      }
      
      // Get profile data for streamers that need it
      const streamersNeedingProfiles = filteredStreamers.filter(
        streamer => !streamer.profile_image_url && streamer.twitch_id
      );
      
      if (streamersNeedingProfiles.length > 0) {
        try {
          const userIds = streamersNeedingProfiles.map(streamer => streamer.twitch_id).filter(Boolean);
          
          if (userIds.length > 0) {
            const userQueryParams = userIds.map(id => `id=${id}`).join('&');
            
            const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${userQueryParams}`, {
              headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (usersResponse.ok) {
              const userData = await usersResponse.json();
              
              // Create a lookup map
              const userDataMap = {};
              if (userData?.data && Array.isArray(userData.data)) {
                userData.data.forEach(user => {
                  if (user && user.id) {
                    userDataMap[user.id] = user;
                  }
                });
              }
              
              // Add profile info
              allStreamers = filteredStreamers.map(streamer => {
                if (!streamer || !streamer.twitch_id || streamer.profile_image_url) return streamer;
                
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
            }
          }
        } catch (error) {
          console.error('Error fetching user profiles:', error);
          allStreamers = filteredStreamers;
        }
      } else {
        allStreamers = filteredStreamers;
      }
      
      // When updating streamers, mark the first few as preloaded
      if (allStreamers.length > 0) {
        // Start preloading thumbnails immediately
        const newPreloadedStreamers = new Set();
        allStreamers.slice(0, 5).forEach(streamer => {
          if (streamer.thumbnail_url) {
            const img = new Image();
            img.src = streamer.thumbnail_url;
            newPreloadedStreamers.add(streamer.twitch_id);
          }
        });
        
        setPreloadedStreamers(newPreloadedStreamers);
        setStreamers(allStreamers);
        setCurrentIndex(0);
        toast.success(`Found ${allStreamers.length} small streamers!`);
      } else {
        toast.error('No small streamers found right now. Try again later.');
      }
    } catch (error) {
      console.error('Error fetching streamers:', error);
      toast.error('Failed to load streamers: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loading, refreshing, twitchAccessToken, activeCategories, selectedPreferences, showASMR, fetchVotedStreamers, getSwiped]);
  
  // Load streamers on initial mount
  useEffect(() => {
    if (streamers.length === 0 && !loading) {
      fetchStreamers();
    }
  }, [fetchStreamers, streamers.length, loading]);
  
  // Render stream preview
  const renderStreamPreview = useCallback((streamer) => {
    if (!streamer || !streamer.is_live) return null;
    
    if (previewPlaying === streamer.twitch_id) {
      return <StreamPreview streamer={streamer} onClose={() => setPreviewPlaying(null)} />;
    } else {
      return (
        <button 
          className={styles.previewButton}
          onClick={() => setPreviewPlaying(streamer.twitch_id)}
        >
          ▶️ Watch Preview
        </button>
      );
    }
  }, [previewPlaying]);
  
  // Function to generate new quick message options
  const generateNewMessageOptions = useCallback(() => {
    const allQuickMessages = [
      { id: 1, text: "Hi there! Just discovered your stream on Chadder!" },
      { id: 2, text: "Love the content! How long have you been streaming?" },
      { id: 3, text: "What game/content are you planning next?" },
      { id: 4, text: "Your stream setup looks amazing!" },
      { id: 5, text: "Just followed! Looking forward to more streams" },
      { id: 6, text: "Any tips for someone new to this game?" },
      { id: 7, text: "That was an awesome play!" },
      { id: 8, text: "What's your streaming schedule like?" },
      { id: 9, text: "Found you through the Dig Deeper feature - glad I did!" },
      { id: 10, text: "How did you first get into streaming?" },
      { id: 11, text: "What's been your favorite game to stream so far?" },
      { id: 12, text: "Any game recommendations for someone who enjoys this type of content?" },
      { id: 13, text: "Your community seems really cool!" },
      { id: 14, text: "What's the story behind your username/channel name?" },
      { id: 15, text: "Do you have any channel emotes in the works?" },
      { id: 16, text: "Just raided in - excited to catch your stream!" },
      { id: 17, text: "That was hilarious! Your reactions are the best" },
      { id: 18, text: "I'm learning a lot watching your gameplay! Thanks for the tips" },
      { id: 19, text: "What other streamers do you enjoy watching?" },
      { id: 20, text: "How do you balance streaming with your other life commitments?" },
      { id: 21, text: "Any memorable moments from your streams you'd like to share?" },
      { id: 22, text: "Your overlay/alerts are super clean! Did you design them?" },
      { id: 23, text: "Do you have a Discord community I can join?" },
      { id: 24, text: "What made you choose this game/category?" },
      { id: 25, text: "How long did it take you to get comfortable on camera?" },
      { id: 26, text: "Your commentary is so entertaining!" },
      { id: 27, text: "What's your go-to snack during long streams?" },
      { id: 28, text: "Can I suggest a game/challenge for a future stream?" },
      { id: 29, text: "What hardware/peripherals are you using? Your setup seems great" },
      { id: 30, text: "Just gifted a sub - happy to support!" },
      { id: 31, text: "Do you collab with other streamers often?" },
      { id: 32, text: "First time here - what's your community like?" },
      { id: 33, text: "What's been your most challenging moment while streaming?" },
      { id: 34, text: "Your positive vibes are exactly what I needed today!" },
      { id: 35, text: "Any plans for special events or charity streams?" },
      { id: 36, text: "I appreciate how you interact with chat - makes it feel welcoming" },
      { id: 37, text: "What's something you wish more viewers knew about streaming?" },
      { id: 38, text: "Caught your VOD yesterday and had to come by live today!" },
      { id: 39, text: "How do you handle stream snipers or trolls?" },
      { id: 40, text: "What's your favorite emote on your channel?" },
      { id: 41, text: "Greetings from [country/city]! Love seeing your content" },
      { id: 42, text: "This song/playlist is fire! What are you listening to?" },
      { id: 43, text: "What got you interested in this game/hobby initially?" },
      { id: 44, text: "How has your approach to streaming evolved over time?" },
      { id: 45, text: "Do you ever get streaming burnout? How do you handle it?" },
      { id: 46, text: "Your editing/transitions are so smooth! What software do you use?" },
      { id: 47, text: "Any pets that might make a cameo on stream?" },
      { id: 48, text: "What's been your proudest achievement since you started streaming?" },
      { id: 49, text: "I've been wanting to try this game - worth picking up?" },
      { id: 50, text: "How did you come up with your channel's aesthetic/theme?" },
      { id: 51, text: "Just shared your stream with some friends who'd love your content!" },
      { id: 52, text: "What's your favorite part about the streaming community?" },
      { id: 53, text: "This is so chill - perfect background while I work/study" },
      { id: 54, text: "What's a game you'd love to stream but haven't yet?" },
      { id: 55, text: "Any hidden talents you haven't shared on stream yet?" },
      { id: 56, text: "Your voice is so calming/energetic - perfect for streams!" },
      { id: 57, text: "Looking forward to becoming a regular here!" },
      { id: 58, text: "If you could collab with any streamer, who would it be?" },
      { id: 59, text: "How do you decide what games/content to stream?" },
      { id: 60, text: "What's one thing that would instantly make your day better?" },
      { id: 61, text: "Any stream goals you're working toward?" },
      { id: 62, text: "Your mods seem awesome - shoutout to the team!" },
      { id: 63, text: "Do you do viewer games/community days?" },
      { id: 64, text: "What's your favorite meme right now?" },
      { id: 65, text: "I appreciate how you explain your thought process while playing" },
      { id: 66, text: "What's your most unpopular opinion about this game/genre?" },
      { id: 67, text: "Your energy is contagious! Always puts me in a good mood" },
      { id: 68, text: "How do you deal with the unexpected technical issues that pop up?" },
      { id: 69, text: "What advice would you give to new streamers?" },
      { id: 70, text: "The way you handled that situation was impressive!" },
      { id: 71, text: "Do you plan your streams or go with the flow?" },
      { id: 72, text: "What's a question you wish viewers would ask more often?" },
      { id: 73, text: "Have any streamers inspired your style or approach?" },
      { id: 74, text: "Just made it through a rough day - your stream is helping a lot" },
      { id: 75, text: "If you weren't streaming this, what would you be doing instead?" },
      { id: 76, text: "What's the weirdest thing that's happened on your stream?" },
      { id: 77, text: "Your knowledge about this game/topic is impressive!" },
      { id: 78, text: "What's the best interaction you've had with a viewer?" },
      { id: 79, text: "Been watching for a bit without chatting - finally saying hi!" },
      { id: 80, text: "What's your coffee/energy drink of choice during streams?" },
      { id: 81, text: "If you could instantly master any game, which would it be?" },
      { id: 82, text: "Thanks for creating such a positive stream environment" },
      { id: 83, text: "Would you rather have more viewers or more active chatters?" },
      { id: 84, text: "Any upcoming games you're excited to stream?" },
      { id: 85, text: "How do you stay consistent with your streaming schedule?" },
      { id: 86, text: "Your laugh is so infectious!" },
      { id: 87, text: "What would be your dream streaming setup?" },
      { id: 88, text: "How has streaming impacted other areas of your life?" },
      { id: 89, text: "What's one thing you wish you knew when you started streaming?" },
      { id: 90, text: "Your community is so supportive - love to see it!" },
      { id: 91, text: "Do you have any pre-stream rituals or routines?" },
      { id: 92, text: "That strategy is genius - hadn't thought of that approach!" },
      { id: 93, text: "What's something not many people know about you?" },
      { id: 94, text: "Do you have any catchphrases or inside jokes in your community?" },
      { id: 95, text: "I can tell you really care about your viewers - it shows!" },
      { id: 96, text: "What's one game mechanic you wish more games would implement?" },
      { id: 97, text: "How do you find balance between entertaining and being yourself?" },
      { id: 98, text: "This community has such good vibes - happy I found it!" },
      { id: 99, text: "How would you describe your content to someone new?" },
      { id: 100, text: "Good luck with the rest of your stream - you're killing it!" }
    ];
    
    // Get 3 random messages
    const shuffled = [...allQuickMessages].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);
    setQuickMessages(selected);
    
    toast.success('New message options generated!', { duration: 1500 });
  }, []);
  
  // Render content based on loading state
  const renderContent = useCallback(() => {
    if (loading && streamers.length === 0) {
      return (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading streamers...</p>
        </div>
      );
    }
    
    if (streamers.length === 0) {
      return (
        <div className={styles.loadingContainer}>
          <p>No streamers found. Try refreshing.</p>
          <button 
            className={styles.refreshButton}
            onClick={fetchStreamers}
            disabled={loading}
          >
            Refresh Streamers
          </button>
        </div>
      );
    }
    
    if (currentIndex >= streamers.length) {
      return (
        <div className={styles.noMoreCardsContainer}>
          <h2>No more streamers to show</h2>
          <p>Try refreshing for new streamers</p>
          <button 
            className={styles.refreshButton} 
            onClick={fetchStreamers}
            disabled={loading}
          >
            Find New Streamers
          </button>
        </div>
      );
    }
    
    const streamer = streamers[currentIndex];
    const isChatActive = chatOpen && currentChatStreamer && currentChatStreamer.twitch_id === streamer.twitch_id;
    const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
    const showPreviewButton = streamer.is_live && !isChatActive;
    
    return (
      <motion.div 
        className={`${styles.card} ${isChatActive ? styles.cardWithChat : ''}`}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        whileTap={{ scale: 0.98 }}
      >
        {!isChatActive && (
          <div 
            className={styles.cardImageContainer}
            style={{ 
              height: '70%',
              backgroundImage: 'none'
            }}
          >
            {/* Auto-play video instead of thumbnail */}
            <iframe
              src={`https://player.twitch.tv/?channel=${streamer.username}&parent=${hostname}&muted=true&autoplay=true`}
              height="100%"
              width="100%"
              allowFullScreen={true}
              title={`${streamer.display_name} stream preview`}
              className={styles.cardStreamVideo}
            ></iframe>
            
            <div className={styles.cardOverlayContent}>
              <div className={styles.streamerOverlay}>
                <span className={styles.streamerNameOverlay}>{streamer.display_name || streamer.username}</span>
                {streamer.is_live && (
                  <span className={styles.viewerCountOverlay}>
                    {(streamer.view_count || 0).toLocaleString()} viewers
                  </span>
                )}
              </div>
              
              {streamer.is_live === true && (
                <div className={styles.liveIndicator}>
                  LIVE
                </div>
              )}
              
              {streamer.vote_count > 0 && (
                <div className={styles.trendingIndicator}>
                  TRENDING
                </div>
              )}
            </div>
          </div>
        )}
        
        {isChatActive && (
          <div className={styles.cardChatContainer}>
            <div className={styles.cardChatHeader}>
              <h3>Chat with {streamer.display_name}</h3>
              <button className={styles.closeChatButton} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            
            {/* Always show stream at the top when chat is open */}
            <div className={styles.cardStreamPreview}>
              <iframe
                src={`https://player.twitch.tv/?channel=${streamer.username}&parent=${hostname}&muted=true`}
                height="100%"
                width="100%"
                allowFullScreen={true}
                title={`${streamer.display_name} stream preview`}
              ></iframe>
            </div>
            
            <div className={styles.cardChatFrame}>
              <iframe
                key={`chat-${streamer.username}`}
                src={`https://www.twitch.tv/embed/${streamer.username}/chat?parent=${hostname}&darkpopout`}
                height="100%"
                width="100%"
                title={`${streamer.display_name} chat`}
              ></iframe>
            </div>
            
            <div className={styles.quickMessageButtons}>
              <div className={styles.quickMessageHeader}>
                <h4>Quick Messages</h4>
                <button 
                  className={styles.refreshMessagesButton}
                  onClick={generateNewMessageOptions}
                >
                  🔄 New Options
                </button>
              </div>
              
              <div className={styles.quickMessageList}>
                {quickMessages.map(msg => (
                  <button 
                    key={msg.id}
                    className={styles.quickMessageButton}
                    onClick={() => {
                      navigator.clipboard.writeText(msg.text);
                      toast.success('Message copied to clipboard!', { duration: 2000 });
                    }}
                  >
                    {msg.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {!isChatActive && (
          <div className={styles.cardContent}>
            <div className={styles.streamerInfoCompact}>
              <h2>{streamer.display_name || streamer.username}</h2>
              
              <div className={styles.streamerStats}>
                {streamer.game_name && (
                  <div className={styles.categoryTag}>
                    <span className={styles.categoryLabel}>
                      {activeCategories.find(cat => cat.id === streamer.category_id)?.icon || '🎮'} {streamer.game_name}
                    </span>
                  </div>
                )}
                
                {streamer.is_live && (
                  <div className={styles.viewerTag}>
                    <span className={styles.viewerLabel}>
                      👁️ {(streamer.view_count || 0).toLocaleString()}
                    </span>
                  </div>
                )}
                
                {streamer.vote_count > 0 && (
                  <div className={styles.voteTag}>
                    <span className={styles.voteLabel}>
                      🔥 {streamer.vote_count} votes
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {streamer.stream_title && (
              <div className={styles.streamTitle}>
                {streamer.stream_title}
              </div>
            )}
            
            {showPreviewButton && (
              <button 
                className={styles.previewButton}
                onClick={() => {
                  setCurrentChatStreamer(streamer);
                  setChatOpen(true);
                }}
              >
                ▶️ Watch & Chat
              </button>
            )}
            
            <div className={styles.cardFooter}>
              <div className={styles.actionContainer}>
                {streamer.is_live && (
                  <button 
                    className={styles.quickChatButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentChatStreamer(streamer);
                      setChatOpen(true);
                    }}
                  >
                    💬 Chat Now
                  </button>
                )}
                
                {streamer.is_live && (
                  <Link 
                    to={`/stream/${streamer.username}`} 
                    className={styles.watchButton}
                  >
                    🔴 Watch Live
                  </Link>
                )}
              </div>
              
              <div className={styles.extraActions}>
                <button 
                  className={styles.followButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (!user) {
                      // Check for session before showing auth modal
                      supabase.auth.getSession().then(({ data }) => {
                        if (!data?.session) {
                          toast.info('Sign in to save favorites!');
                          setShowAuthModal(true);
                        } else {
                          // We have a session but user object might not be loaded yet
                          saveFavorite(streamer);
                          toast.success(`Added ${streamer.display_name || streamer.username} to favorites!`);
                        }
                      });
                      return;
                    }
                    
                    // Save to favorites
                    saveFavorite(streamer);
                    toast.success(`Added ${streamer.display_name || streamer.username} to favorites!`);
                  }}
                  title="Add to favorites"
                >
                  + Favorite
                </button>
                
                <button
                  className={styles.shareButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (navigator.share) {
                      navigator.share({
                        title: `Check out ${streamer.display_name} on Twitch!`,
                        text: `I found an awesome small streamer: ${streamer.display_name}`,
                        url: `https://twitch.tv/${streamer.username}`
                      })
                      .catch(err => {
                        console.error('Error sharing:', err);
                        navigator.clipboard.writeText(`https://twitch.tv/${streamer.username}`)
                          .then(() => toast.success('Link copied to clipboard!'))
                          .catch(() => toast.error('Could not copy link'));
                      });
                    } else {
                      navigator.clipboard.writeText(`https://twitch.tv/${streamer.username}`)
                        .then(() => toast.success('Link copied to clipboard!'))
                        .catch(() => toast.error('Could not copy link'));
                    }
                  }}
                  title="Share this streamer"
                >
                  <span role="img" aria-label="Share">🔗</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }, [controls, currentIndex, fetchStreamers, handleDragEnd, handleDragStart, loading, renderStreamPreview, streamers, activeCategories, chatOpen, currentChatStreamer, quickMessages, generateNewMessageOptions, saveFavorite]);
  
  // Render quick chat modal
  const renderQuickChatModal = useCallback(() => {
    // Return null because we're showing chat directly in the card now
    return null;
  }, []);
  
  // Render preference selector
  const renderPreferenceSelector = useCallback(() => {
    if (!showPreferenceSelector) return null;
    
    return (
      <div className={styles.preferenceOverlay} onClick={() => setShowPreferenceSelector(false)}>
        <div className={styles.preferenceContent} onClick={e => e.stopPropagation()}>
          <h2>Select Your Stream Preferences</h2>
          <p>Choose the content you'd like to see in your stream</p>
          
          {loadingCategories ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <p>Loading categories...</p>
            </div>
          ) : (
            <>
              <div className={styles.categoryActions}>
                <button 
                  className={styles.refreshCategoriesButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchTopCategories();
                  }}
                  disabled={loadingCategories}
                >
                  🔄 Refresh Categories
                </button>
              </div>
              
              <div className={styles.preferenceCategories}>
                {activeCategories.map(category => (
                  <button 
                    key={category.id}
                    className={`${styles.categoryButton} ${selectedPreferences.includes(category.id) ? styles.categorySelected : ''}`}
                    onClick={() => {
                      setSelectedPreferences(prev => {
                        if (prev.includes(category.id)) {
                          return prev.filter(id => id !== category.id);
                        } else {
                          return [...prev, category.id];
                        }
                      });
                      
                      // If ASMR is selected, set showASMR to true
                      if (category.id === '498506') {
                        setShowASMR(prev => !prev);
                      }
                    }}
                  >
                    <div className={styles.categoryIcon}>{category.icon}</div>
                    <div className={styles.categoryName}>{category.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          
          <div className={styles.preferenceControls}>
            <button 
              className={styles.preferenceButton}
              onClick={() => {
                setShowPreferenceSelector(false);
                fetchStreamers();
              }}
              disabled={loadingCategories}
            >
              Apply Preferences
            </button>
            <button 
              className={styles.secondaryButton}
              onClick={() => {
                setSelectedPreferences([]);
                setShowASMR(false);
                setShowPreferenceSelector(false);
              }}
              disabled={loadingCategories}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }, [showPreferenceSelector, selectedPreferences, activeCategories, fetchStreamers, loadingCategories, fetchTopCategories]);
  
  // Track when user swipes left or right
  const handleSwipe = async (direction) => {
    if (!currentStreamer) return;
    
    try {
      // Track Dig Deeper usage
      trackDigDeeper(1);
      
      // ... rest of existing handleSwipe logic ...
    } catch (error) {
      console.error('Error handling swipe:', error);
    }
  };
  
  return (
    <div className={styles.container}>
      {/* Only show auth modal if we've confirmed no user AND auth is checked */}
      <AuthModal 
        show={showAuthModal && authChecked && !user} 
        isOpen={showAuthModal && authChecked && !user}
        onClose={() => {
          if (user) {
            setShowAuthModal(false);
          } else {
            navigate('/');
          }
        }} 
        onLogin={() => window.location.href = '/login'}
        onSignup={() => window.location.href = '/signup'}
      />
      
      {/* Only show auth required if we've checked auth and have no user */}
      {authChecked && !user && showAuthModal ? (
        <div className={styles.authRequiredContainer}>
          <h2>Authentication Required</h2>
          <p>Please sign in to access the Dig Deeper feature</p>
        </div>
      ) : (
        <>
          <div className={styles.header}>
            <h1>Dig Deeper</h1>
            <p>Discover and vote for your favorite Twitch streamers</p>
            
            <div className={styles.headerButtons}>
              <button
                onClick={() => navigate('/favorites')}
                className={styles.preferencesButton}
                title="View your favorited streamers"
              >
                <span>❤️</span> Favorites
              </button>
              <button
                onClick={() => setShowPreferenceSelector(true)}
                className={styles.preferencesButton}
                title="Select stream preferences"
              >
                <span>🎮</span> Preferences
              </button>
              <button
                onClick={fetchStreamers}
                className={`${styles.refreshButton} ${refreshing ? styles.refreshing : ''}`}
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
            {renderContent()}
            
            {/* Render action buttons below the card instead of fixed position */}
            {streamers.length > 0 && currentIndex < streamers.length && (
              <div className={styles.actionButtons}>
                <button 
                  onClick={() => {
                    controls.start({ 
                      x: -viewportWidth, 
                      rotateZ: -10, 
                      transition: { duration: 0.3 } 
                    }).then(() => {
                      handleSwipeLeft();
                    });
                  }}
                  aria-label="Dislike"
                  className={styles.actionButton}
                  style={{
                    background: 'linear-gradient(135deg, #ff5252, #ff7676)',
                    width: isMobile ? '3.2rem' : '4rem',
                    height: isMobile ? '3.2rem' : '4rem',
                    fontSize: isMobile ? '1.3rem' : '1.5rem'
                  }}
                >
                  👎
                </button>
                <button 
                  onClick={() => {
                    controls.start({ 
                      x: viewportWidth, 
                      rotateZ: 10, 
                      transition: { duration: 0.3 } 
                    }).then(() => {
                      handleSwipeRight(streamers[currentIndex]);
                    });
                  }}
                  aria-label="Like"
                  className={styles.actionButton}
                  style={{
                    background: 'linear-gradient(135deg, #9147ff, #b347ff)',
                    width: isMobile ? '3.2rem' : '4rem',
                    height: isMobile ? '3.2rem' : '4rem',
                    fontSize: isMobile ? '1.3rem' : '1.5rem'
                  }}
                >
                  ❤️
                </button>
              </div>
            )}
          </div>
          
          {renderQuickChatModal()}
          {renderPreferenceSelector()}
          <AdvancedStreamerPreloader streamers={streamers} currentIndex={currentIndex} />
        </>
      )}
    </div>
  );
};

export default DigDeeperPage;