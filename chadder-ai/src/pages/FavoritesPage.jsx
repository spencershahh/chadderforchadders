import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import styles from './FavoritesPage.module.css';

const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

const FavoritesPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      
      // Transform data to extract streamer info
      const transformedData = data.map(item => ({
        favoriteId: item.id,
        ...item.twitch_streamers
      }));
      
      // If we have favorites, refresh their data from Twitch API directly
      if (transformedData.length > 0) {
        try {
          // Get Twitch credentials
          const twitchClientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
          const twitchClientSecret = import.meta.env.VITE_TWITCH_CLIENT_SECRET;
          
          if (!twitchClientId || !twitchClientSecret) {
            let errorMsg = 'Twitch API credentials are missing.';
            if (isDevelopment) {
              errorMsg += ' Make sure VITE_TWITCH_CLIENT_ID and VITE_TWITCH_CLIENT_SECRET are set in your .env file.';
              console.error('Missing Twitch API credentials. Check your .env file for:');
              console.error('VITE_TWITCH_CLIENT_ID=your_client_id');
              console.error('VITE_TWITCH_CLIENT_SECRET=your_client_secret');
            } else {
              errorMsg += ' Please contact the site administrator.';
            }
            throw new Error(errorMsg);
          }
          
          console.log('Attempting to fetch Twitch data for favorites with client ID:', twitchClientId);
          
          // Get Twitch OAuth token
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`
          });
          
          if (!tokenResponse.ok) {
            console.error(`Twitch token request failed with status ${tokenResponse.status}:`, await tokenResponse.text());
            throw new Error(`Error getting Twitch token: ${tokenResponse.status}`);
          }
          
          const tokenData = await tokenResponse.json();
          const accessToken = tokenData.access_token;
          
          // Extract Twitch IDs
          const twitchIds = transformedData.map(streamer => streamer.twitch_id);
          
          // Get live streams data
          let allStreams = [];
          // Only make the request if we have IDs
          if (twitchIds.length > 0) {
            const queryString = twitchIds.map(id => `user_id=${id}`).join('&');
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${queryString}`, {
              headers: {
                'Client-ID': twitchClientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (streamsResponse.ok) {
              const streamsData = await streamsResponse.json();
              allStreams = streamsData.data || [];
            }
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
          transformedData.forEach(streamer => {
            const streamData = streamMap[streamer.twitch_id];
            streamer.is_live = !!streamData;
            streamer.view_count = streamer.is_live ? streamData.view_count : 0;
            streamer.game_name = streamer.is_live ? streamData.game_name : null;
            streamer.stream_title = streamer.is_live ? streamData.stream_title : null;
          });
          
          console.log('Updated favorites with real-time Twitch data');
        } catch (twitchError) {
          console.error('Error fetching Twitch data for favorites:', twitchError);
          // Continue with stored data if refresh fails
        }
      }
      
      setFavorites(transformedData);
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
                style={{ backgroundImage: `url(${streamer.profile_image_url || 'https://via.placeholder.com/300'})` }}
              >
                {streamer.is_live && (
                  <div className={styles.liveIndicator}>
                    LIVE
                    <div className={styles.viewerCount}>{streamer.view_count.toLocaleString()} viewers</div>
                  </div>
                )}
              </div>
              
              <div className={styles.favoriteContent}>
                <h3>{streamer.display_name || streamer.username}</h3>
                
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
