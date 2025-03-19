import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import styles from './FavoritesPage.module.css';
import axios from 'axios';

const isDevelopment = typeof import.meta !== 'undefined' && 
  import.meta.env && 
  (import.meta.env.DEV || window.location.hostname === 'localhost');

// Twitch API helper for fetching streamer data
const twitchApi = {
  async fetchStreamerById(twitchId) {
    const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
    const accessToken = localStorage.getItem('twitch_access_token');
    
    if (!clientId || !accessToken) {
      console.error('Missing Twitch credentials');
      return null;
    }
    
    try {
      // First get user data
      const userResponse = await axios.get(`https://api.twitch.tv/helix/users?id=${twitchId}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!userResponse.data || !userResponse.data.data || userResponse.data.data.length === 0) {
        return null;
      }
      
      const userData = userResponse.data.data[0];
      
      // Then check if user is streaming
      const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams?user_id=${twitchId}`, {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const isLive = streamResponse.data && 
                     streamResponse.data.data && 
                     streamResponse.data.data.length > 0;
      
      const streamInfo = isLive ? streamResponse.data.data[0] : null;
      
      return {
        id: userData.id,
        display_name: userData.display_name,
        username: userData.login,
        description: userData.description,
        profile_image_url: userData.profile_image_url,
        is_live: isLive,
        view_count: isLive ? streamInfo.viewer_count : 0,
        stream_info: isLive ? {
          title: streamInfo.title,
          game_name: streamInfo.game_name,
          thumbnail_url: streamInfo.thumbnail_url
            .replace('{width}', '320')
            .replace('{height}', '180'),
        } : null
      };
    } catch (error) {
      console.error('Error fetching streamer from Twitch API:', error);
      return null;
    }
  }
};

const FavoritesPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [twitchConfig, setTwitchConfig] = useState({
    clientId: '',
    clientSecret: '',
    keysAvailable: false
  });

  useEffect(() => {
    // Wait for auth to finish loading before deciding to redirect
    if (authLoading) {
      return; // Don't do anything while still loading auth
    }
    
    if (!user) {
      // Redirect to login if not authenticated
      toast.error('Please sign in to view your favorites');
      navigate('/login', { state: { returnTo: '/favorites' } });
      return;
    }
    
    fetchFavorites();
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // This runs only in the browser, not during build
    try {
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID || '';
      const clientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET || '';
      
      console.log('FavoritesPage - Environment check (client-side):');
      console.log('VITE_TWITCH_CLIENT_ID exists:', !!clientId);
      
      if (clientId) {
        console.log('First few chars of Client ID:', clientId.substring(0, 3) + '...');
      }
      
      setTwitchConfig({
        clientId,
        clientSecret,
        keysAvailable: !!(clientId && clientSecret)
      });
      
      // Ensure we have a valid Twitch auth token
      if (clientId && clientSecret) {
        fetchTwitchAuth();
      }
      
    } catch (error) {
      console.error('Error accessing environment variables in FavoritesPage:', error);
    }
  }, []);

  const fetchTwitchAuth = async () => {
    try {
      const accessToken = localStorage.getItem('twitch_access_token');
      const tokenExpiry = localStorage.getItem('twitch_token_expiry');
      
      // Check if we have a non-expired token
      if (accessToken && tokenExpiry && new Date().getTime() < parseInt(tokenExpiry)) {
        console.log('Using existing Twitch access token');
        return accessToken;
      }
      
      console.log('Fetching new Twitch access token...');
      
      // Get a new token
      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        new URLSearchParams({
          client_id: twitchConfig.clientId,
          client_secret: twitchConfig.clientSecret,
          grant_type: 'client_credentials'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      if (response.data && response.data.access_token) {
        const newToken = response.data.access_token;
        // Store token with expiry (subtract 1 hour to be safe)
        const expiryTime = new Date().getTime() + (response.data.expires_in - 3600) * 1000;
        
        localStorage.setItem('twitch_access_token', newToken);
        localStorage.setItem('twitch_token_expiry', expiryTime.toString());
        
        console.log('Successfully obtained new Twitch access token');
        return newToken;
      } else {
        throw new Error('Invalid response from Twitch auth endpoint');
      }
    } catch (error) {
      console.error('Error fetching Twitch auth token:', error);
      return null;
    }
  };

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      
      // Query favorites with joined streamer data
      const { data, error } = await supabase
        .from('user_favorites')
        .select(`
          id,
          streamer_id,
          twitch_streamers:streamer_id (
            id,
            twitch_id,
            username,
            display_name,
            description,
            profile_image_url,
            view_count,
            votes,
            is_live
          )
        `)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Transform data to extract streamer info and filter out any missing streamer data
      const transformedData = data
        .filter(item => item.twitch_streamers) // Filter out any null streamers
        .map(item => ({
          favoriteId: item.id,
          ...item.twitch_streamers,
          // Ensure these fields always have a default value
          profile_image_url: item.twitch_streamers.profile_image_url || 'https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png',
          display_name: item.twitch_streamers.display_name || item.twitch_streamers.username || 'Unknown Streamer',
          view_count: item.twitch_streamers.view_count || 0,
          votes: item.twitch_streamers.votes || 0,
          is_live: item.twitch_streamers.is_live || false
        }));
      
      // If we have favorites, refresh their data from Twitch API directly
      if (transformedData.length > 0 && twitchConfig.keysAvailable) {
        try {
          // For live data, we need to get the current status from Twitch
          console.log('Refreshing live streamer data from Twitch API');
          
          const streamerPromises = transformedData.map(async (streamer) => {
            try {
              if (!streamer.twitch_id) return streamer; // Skip if no twitch ID
              
              const freshData = await twitchApi.fetchStreamerById(streamer.twitch_id);
              
              if (freshData) {
                return {
                  ...streamer,
                  is_live: freshData.is_live || false,
                  view_count: freshData.view_count || streamer.view_count || 0,
                  stream_title: freshData.stream_info?.title || '',
                  game_name: freshData.stream_info?.game_name || '',
                  // Keep original profile image if new one is missing
                  profile_image_url: freshData.profile_image_url || streamer.profile_image_url
                };
              }
              
              return streamer;
            } catch (error) {
              console.error(`Error refreshing data for streamer ${streamer.username}:`, error);
              // Return original streamer data on error
              return streamer;
            }
          });
          
          const updatedStreamers = await Promise.all(streamerPromises);
          setFavorites(updatedStreamers);
        } catch (error) {
          console.error('Error refreshing Twitch data:', error);
          // Use the transformed data from database if Twitch API fails
          setFavorites(transformedData);
        }
      } else {
        // Use just the database data
        setFavorites(transformedData);
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast.error('Failed to load favorites. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (favoriteId, streamerId) => {
    try {
      // Delete from favorites
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('id', favoriteId);
        
      if (error) throw error;
      
      // Decrement vote count
      await supabase
        .from('twitch_streamers')
        .update({ 
          votes: favorites.find(f => f.id === streamerId)?.votes - 1 || 0 
        })
        .eq('id', streamerId);
      
      // Update local state
      setFavorites(favorites.filter(item => item.favoriteId !== favoriteId));
      
      toast.success('Removed from favorites');
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast.error('Failed to remove favorite. Please try again.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Your Favorites</h1>
        <Link to="/dig-deeper" className={styles.backButton}>
          Back to Dig Deeper
        </Link>
      </div>
      
      {loading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading your favorites...</p>
        </div>
      ) : favorites.length === 0 ? (
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>❤️</div>
          <h3>No favorites yet</h3>
          <p>Start swiping right on streamers you like in Dig Deeper!</p>
          <Link to="/dig-deeper" className={styles.digDeeperButton}>
            Go to Dig Deeper
          </Link>
        </div>
      ) : (
        <div className={styles.favoritesGrid}>
          {favorites.map(streamer => (
            <div key={streamer.favoriteId} className={styles.favoriteCard}>
              <div 
                className={styles.favoriteImage}
                style={{ 
                  backgroundImage: `url(${
                    streamer.is_live && streamer.stream_info?.thumbnail_url
                      ? streamer.stream_info.thumbnail_url 
                      : streamer.profile_image_url || 'https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png'
                  })`
                }}
              >
                {streamer.is_live && (
                  <div className={styles.liveIndicator}>
                    LIVE
                    <div className={styles.viewerCount}>{(streamer.view_count || 0).toLocaleString()} viewers</div>
                  </div>
                )}
              </div>
              
              <div className={styles.favoriteContent}>
                <h3>{streamer.display_name}</h3>
                
                {streamer.is_live && streamer.stream_title && (
                  <p className={styles.streamTitle}>{streamer.stream_title}</p>
                )}
                
                {streamer.is_live && streamer.game_name && (
                  <div className={styles.gameTag}>Playing: {streamer.game_name}</div>
                )}
                
                <p className={styles.description}>{streamer.description || 'No description available'}</p>
                
                <div className={styles.statsRow}>
                  {streamer.is_live ? (
                    <span className={styles.viewCount}>👁️ {streamer.view_count.toLocaleString()} viewers</span>
                  ) : (
                    <span className={styles.offlineStatus}>Offline</span>
                  )}
                  <span className={styles.voteCount}>❤️ {streamer.votes || 0} votes</span>
                </div>
                
                <div className={styles.actionsRow}>
                  {streamer.is_live && (
                    <Link 
                      to={`/stream/${streamer.username}`}
                      className={styles.watchButton}
                    >
                      Watch Live
                    </Link>
                  )}
                  
                  <button 
                    className={styles.removeButton}
                    onClick={() => removeFavorite(streamer.favoriteId, streamer.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
