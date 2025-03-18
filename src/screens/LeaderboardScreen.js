import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { syncTwitchStreamers } from '../utils/twitchService';

const LeaderboardScreen = ({ navigation }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('credits'); // credits, followers, streamer_votes

  useEffect(() => {
    fetchLeaderboard();
  }, [filter]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      
      if (filter === 'streamer_votes') {
        // If we're showing streamers, first ensure we have up-to-date streamer data
        if (!refreshing) { // Don't run this on pull-to-refresh (already handled in onRefresh)
          try {
            // Sync top streamers in background to keep data fresh
            await syncTwitchStreamers(10);
          } catch (error) {
            console.log('Background sync error:', error);
            // We can continue even if background sync fails
          }
        }
        
        // Fetch streamer leaderboard by votes
        const { data, error } = await supabase
          .from('twitch_streamers')
          .select('id, username, display_name, profile_image_url, votes, view_count, is_live')
          .order('votes', { ascending: false })
          .limit(20);
          
        if (error) throw error;
        if (data) setLeaderboard(data);
      } else {
        // Fetch user leaderboard by credits or followers
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, credits, followers')
          .order(filter, { ascending: false })
          .limit(20);
        
        if (error) throw error;
        if (data) setLeaderboard(data);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    
    if (filter === 'streamer_votes') {
      try {
        // On manual refresh, force a sync with Twitch API
        await syncTwitchStreamers(20);
      } catch (error) {
        console.error('Error syncing streamers:', error);
      }
    }
    
    fetchLeaderboard();
  };

  const watchStreamer = (streamerId) => {
    // Navigate to stream view - you may need to implement this screen
    navigation.navigate('Stream', { streamerId });
  };

  const renderUserItem = ({ item, index }) => {
    // Handle different item structure based on filter
    if (filter === 'streamer_votes') {
      return (
        <TouchableOpacity 
          style={styles.userCard}
          onPress={() => item.is_live ? watchStreamer(item.id) : null}
        >
          <Text style={styles.rankText}>{index + 1}</Text>
          <Image
            source={{ uri: item.profile_image_url || 'https://via.placeholder.com/50' }}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username}>{item.display_name || item.username}</Text>
              {item.is_live && <Text style={styles.liveTag}>🔴 LIVE</Text>}
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>❤️ {item.votes || 0} votes</Text>
              <Text style={styles.viewsText}>👁️ {item.view_count || 0} viewers</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    } else {
      return (
        <TouchableOpacity 
          style={styles.userCard}
          onPress={() => navigation.navigate('Profile', { userId: item.id })}
        >
          <Text style={styles.rankText}>{index + 1}</Text>
          <Image
            source={{ uri: item.avatar_url || 'https://via.placeholder.com/50' }}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.username}>{item.username}</Text>
            <Text style={styles.statsText}>
              {filter === 'credits' 
                ? `${item.credits || 0} credits` 
                : `${item.followers || 0} followers`}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
  };

  const FilterButton = ({ title, value }) => (
    <TouchableOpacity 
      style={[styles.filterButton, filter === value && styles.activeFilterButton]}
      onPress={() => setFilter(value)}
    >
      <Text 
        style={[styles.filterButtonText, filter === value && styles.activeFilterButtonText]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      
      <View style={styles.filterContainer}>
        <FilterButton title="Credits" value="credits" />
        <FilterButton title="Followers" value="followers" />
        <FilterButton title="Streamers" value="streamer_votes" />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4263eb" />
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.id?.toString()}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
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
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  activeFilterButton: {
    backgroundColor: '#4263eb',
  },
  filterButtonText: {
    fontWeight: '600',
    color: '#666',
  },
  activeFilterButtonText: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  rankText: {
    width: 30,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
    backgroundColor: '#ddd',
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    flex: 1,
  },
  liveTag: {
    color: '#ff4c4c',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statsText: {
    fontSize: 14,
    color: '#4263eb',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewsText: {
    fontSize: 14,
    color: '#999',
  },
});

export default LeaderboardScreen; 