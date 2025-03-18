import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import styles from './FavoritesPage.module.css';

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
                {streamer.is_live && <div className={styles.liveIndicator}>LIVE</div>}
              </div>
              
              <div className={styles.favoriteContent}>
                <h3>{streamer.display_name || streamer.username}</h3>
                <p className={styles.description}>{streamer.description || 'No description available'}</p>
                
                <div className={styles.statsRow}>
                  <span>👁️ {streamer.view_count || 0} viewers</span>
                  <span>❤️ {streamer.votes || 0} votes</span>
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
