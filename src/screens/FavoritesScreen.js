import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabaseClient';
import { fetchStreamerById } from '../utils/twitchService';

const FavoritesScreen = ({ navigation }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkUser();
    
    // Refresh favorites when the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      if (user) {
        fetchFavorites();
      }
    });

    return unsubscribe;
  }, [navigation, user]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        fetchFavorites();
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking user:', error.message);
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      
      if (!user) {
        Alert.alert('Please sign in to view your favorites');
        setLoading(false);
        return;
      }
      
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
            votes
          )
        `)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Transform data to extract streamer info
      const transformedData = data.map(item => ({
        favoriteId: item.id,
        streamerId: item.streamer_id,
        ...item.twitch_streamers
      }));
      
      // Check if any favorite has up-to-date info from Twitch
      const updatedFavorites = await Promise.all(
        transformedData.map(async (favorite) => {
          try {
            // If the record is older than 1 day, refresh the data from Twitch
            const lastUpdated = new Date(favorite.updated_at || 0);
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            if (lastUpdated < oneDayAgo && favorite.twitch_id) {
              // Get fresh data from Twitch API
              const twitchData = await fetchStreamerById(favorite.twitch_id);
              
              // Update our database with fresh data, maintaining votes
              if (twitchData) {
                const { data: updatedStreamer, error: updateError } = await supabase
                  .from('twitch_streamers')
                  .update({
                    username: twitchData.username,
                    display_name: twitchData.display_name,
                    description: twitchData.description,
                    profile_image_url: twitchData.profile_image_url,
                    view_count: twitchData.view_count,
                    is_live: twitchData.is_live,
                    updated_at: new Date()
                  })
                  .eq('id', favorite.streamerId)
                  .select()
                  .single();
                
                if (!updateError && updatedStreamer) {
                  // Return updated data
                  return {
                    ...favorite,
                    ...updatedStreamer,
                    is_live: twitchData.is_live || false
                  };
                }
              }
            }
            
            // Return original if no update needed or update failed
            return favorite;
          } catch (e) {
            console.error('Error updating favorite:', e.message);
            return favorite;
          }
        })
      );
      
      setFavorites(updatedFavorites);
    } catch (error) {
      console.error('Error fetching favorites:', error.message);
      Alert.alert('Error', 'Failed to load favorites. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      
      // Decrement vote count for the streamer
      await supabase
        .from('twitch_streamers')
        .update({ votes: favorites.find(f => f.streamerId === streamerId).votes - 1 })
        .eq('id', streamerId);
      
      // Update local state
      setFavorites(favorites.filter(item => item.favoriteId !== favoriteId));
    } catch (error) {
      console.error('Error removing favorite:', error.message);
      Alert.alert('Error', 'Failed to remove favorite. Please try again.');
    }
  };

  const showRemoveAlert = (favoriteId, streamerId, streamerName) => {
    Alert.alert(
      'Remove Favorite',
      `Are you sure you want to remove ${streamerName} from your favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeFavorite(favoriteId, streamerId) }
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites();
  };

  const watchStreamer = (streamerId) => {
    // Navigate to stream view - you may need to implement this screen
    navigation.navigate('Stream', { streamerId });
  };

  const renderFavoriteItem = ({ item }) => (
    <TouchableOpacity
      style={styles.favoriteCard}
      onLongPress={() => showRemoveAlert(item.favoriteId, item.streamerId, item.display_name || item.username)}
      onPress={() => item.is_live ? watchStreamer(item.streamerId) : null}
    >
      <Image
        source={{ uri: item.profile_image_url || 'https://via.placeholder.com/150' }}
        style={styles.thumbnail}
      />
      <View style={styles.infoContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.nameText}>{item.display_name || item.username}</Text>
          {item.is_live && <Text style={styles.liveTag}>🔴 LIVE</Text>}
        </View>
        <Text style={styles.descriptionText} numberOfLines={2}>
          {item.description || 'No description available'}
        </Text>
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>👁️ {item.view_count || 0} viewers</Text>
          <Text style={styles.statsText}>❤️ {item.votes || 0} votes</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSignInMessage = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>Please sign in to view your favorites</Text>
      <TouchableOpacity 
        style={styles.signInButton}
        onPress={() => {
          // Navigate to your auth screen - update this to match your auth flow
          navigation.navigate('Login');
        }}
      >
        <Text style={styles.signInButtonText}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Favorites</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Your favorites help determine which streamers appear on the Discover page.
          Each favorite counts as a vote toward their ranking!
        </Text>
      </View>
      
      {!user ? (
        renderSignInMessage()
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4263eb" />
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>You haven't added any favorites yet.</Text>
          <Text style={styles.emptySubText}>Swipe right on streamers you like in Dig Deeper!</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.favoriteId?.toString()}
          renderItem={renderFavoriteItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#4263eb']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    color: '#333',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  backButtonText: {
    fontWeight: '600',
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#4263eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 20,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 12,
  },
  favoriteCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#ccc',
  },
  infoContainer: {
    flex: 1,
    padding: 12,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  liveTag: {
    color: '#ff4c4c',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsText: {
    fontSize: 12,
    color: '#999',
  },
  infoCard: {
    backgroundColor: 'rgba(66, 99, 235, 0.1)',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4263eb',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});

export default FavoritesScreen; 