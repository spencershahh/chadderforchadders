import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { supabase } from '../utils/supabaseClient';

const DiscoverScreen = ({ navigation }) => {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreams();
  }, []);

  const fetchStreams = async () => {
    try {
      setLoading(true);
      
      // This is a placeholder - replace with your actual query
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) setStreams(data);
    } catch (error) {
      console.error('Error fetching streams:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStreamItem = ({ item }) => (
    <TouchableOpacity
      style={styles.streamCard}
      onPress={() => navigation.navigate('Stream', { streamId: item.id, username: item.username })}
    >
      <Image
        source={{ uri: item.thumbnail_url || 'https://via.placeholder.com/150' }}
        style={styles.thumbnail}
      />
      <View style={styles.streamInfo}>
        <Text style={styles.streamTitle}>{item.title}</Text>
        <Text style={styles.streamerName}>{item.username}</Text>
        <Text style={styles.viewerCount}>{item.viewer_count || 0} viewers</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Discover</Text>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text>Loading streams...</Text>
        </View>
      ) : streams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text>No streams available.</Text>
        </View>
      ) : (
        <FlatList
          data={streams}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderStreamItem}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    color: '#333',
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
  streamInfo: {
    padding: 12,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  streamerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  viewerCount: {
    fontSize: 12,
    color: '#999',
  },
});

export default DiscoverScreen; 