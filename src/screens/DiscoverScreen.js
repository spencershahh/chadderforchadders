import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { supabase } from '../utils/supabaseClient';

const DiscoverScreen = ({ navigation }) => {
  const [streamers, setStreamers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTopStreamers();
  }, []);

  const fetchTopStreamers = async () => {
    try {
      setLoading(true);
      
      // Fetch streamers from twitch_streamers table ordered by votes (favorites)
      const { data, error } = await supabase
        .from('twitch_streamers')
        .select('*')
        .order('votes', { ascending: false })
        .limit(20); // Get top 20 most favorited streamers
      
      if (error) throw error;
      
      if (data) setStreamers(data);
    } catch (error) {
      console.error('Error fetching top streamers:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStreamerItem = ({ item }) => (
    <TouchableOpacity
      style={styles.streamCard}
      onPress={() => navigation.navigate('Stream', { streamerId: item.id, username: item.username })}
    >
      <Image
        source={{ uri: item.profile_image_url || 'https://via.placeholder.com/150' }}
        style={styles.thumbnail}
      />
      {item.is_live && (
        <View style={styles.liveIndicator}>
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
      <View style={styles.streamInfo}>
        <Text style={styles.streamTitle}>{item.display_name || item.username}</Text>
        <Text style={styles.streamerDescription} numberOfLines={2}>{item.description || 'No description available'}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.viewerCount}>{item.view_count || 0} viewers</Text>
          <Text style={styles.favoriteCount}>❤️ {item.votes || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <Text style={styles.headerSubtitle}>Top favorited streamers from Dig Deeper</Text>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text>Loading streamers...</Text>
        </View>
      ) : streamers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text>No popular streamers available yet.</Text>
          <Text style={styles.emptySubText}>Check out Dig Deeper to discover and favorite streamers!</Text>
        </View>
      ) : (
        <FlatList
          data={streamers}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderStreamerItem}
          contentContainerStyle={styles.listContainer}
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
    padding: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
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
  emptySubText: {
    marginTop: 8,
    color: '#777',
    textAlign: 'center',
  },
  listContainer: {
    padding: 12,
  },
  streamCard: {
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
    width: '100%',
    height: 180,
    backgroundColor: '#ccc',
  },
  liveIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  liveText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  streamInfo: {
    padding: 12,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  streamerDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  viewerCount: {
    fontSize: 12,
    color: '#999',
  },
  favoriteCount: {
    fontSize: 12,
    color: '#FF4081',
    fontWeight: '500',
  },
});

export default DiscoverScreen; 