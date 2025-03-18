import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  Animated, 
  PanResponder, 
  Dimensions, 
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabaseClient';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 120;

const DigDeeperScreen = ({ navigation }) => {
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [twitchAccessToken, setTwitchAccessToken] = useState(null);
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp'
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  const dislikeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  useEffect(() => {
    // Check if user is logged in
    checkUser();
    
    // Initialize Twitch authentication
    initTwitchAuth();

    // Refresh when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      if (twitchAccessToken) {
        fetchStreamers();
      } else {
        initTwitchAuth();
      }
    });

    return unsubscribe;
  }, [navigation]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (error) {
      console.error('Error checking user:', error.message);
    }
  };

  const initTwitchAuth = async () => {
    try {
      // Get credentials from your secure storage or config
      const twitchClientId = process.env.TWITCH_CLIENT_ID;
      const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
      
      if (!twitchClientId || !twitchClientSecret) {
        Alert.alert('Error', 'Twitch API credentials are missing.');
        return;
      }
      
      // Get Twitch OAuth token
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`
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
      
      // Now fetch streamers with the token
      await fetchStreamersWithToken(accessToken);
    } catch (error) {
      console.error('Twitch auth error:', error.message);
      Alert.alert('Error', `Failed to authenticate with Twitch: ${error.message}`);
      setLoading(false);
    }
  };

  const fetchStreamersWithToken = async (accessToken) => {
    try {
      setLoading(true);
      
      // Get only basic streamer info from database - just usernames and votes
      const { data: baseStreamers, error } = await supabase
        .from('twitch_streamers')
        .select('id, username, twitch_id, votes')
        .order('votes', { ascending: false })
        .limit(30);
        
      if (error) throw error;
      
      if (!baseStreamers || baseStreamers.length === 0) {
        Alert.alert('Error', 'No streamers found in database.');
        setLoading(false);
        return;
      }
      
      const twitchClientId = process.env.TWITCH_CLIENT_ID;
      
      if (!twitchClientId || !accessToken) {
        throw new Error('Twitch credentials or token missing');
      }
      
      // Extract Twitch usernames for API call
      const twitchLogins = baseStreamers
        .map(streamer => streamer.username?.toLowerCase())
        .filter(Boolean);
        
      if (twitchLogins.length === 0) {
        throw new Error('No valid Twitch usernames found');
      }
      
      // Initialize streamers with database values (only id and votes) and defaults
      let streamersWithInfo = baseStreamers.map(streamer => ({
        ...streamer,
        is_live: false,
        view_count: 0,
        game_name: null,
        stream_title: null,
        display_name: streamer.username, // Default fallback
        profile_image_url: null,
        description: null
      }));
      
      // Create lookup maps 
      const streamersByLogin = {};
      streamersWithInfo.forEach(streamer => {
        if (streamer.username) {
          streamersByLogin[streamer.username.toLowerCase()] = streamer;
        }
      });
      
      const streamersByTwitchId = {};
      streamersWithInfo.forEach(streamer => {
        if (streamer.twitch_id) {
          streamersByTwitchId[streamer.twitch_id] = streamer;
        }
      });
      
      // Fetch all user data from Twitch in batches (100 per request max)
      for (let i = 0; i < twitchLogins.length; i += 100) {
        const loginBatch = twitchLogins.slice(i, i + 100);
        const loginQueryString = loginBatch.map(login => `login=${login}`).join('&');
        
        try {
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${loginQueryString}`, {
            headers: {
              'Client-ID': twitchClientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!usersResponse.ok) {
            console.error(`Error fetching user data: ${usersResponse.status}`);
            continue; // Try next batch
          }
          
          const userData = await usersResponse.json();
          
          // Update streamers with real profile data from Twitch
          if (userData.data && Array.isArray(userData.data)) {
            userData.data.forEach(user => {
              const login = user.login?.toLowerCase();
              if (login && streamersByLogin[login]) {
                const streamer = streamersByLogin[login];
                
                // Update profile info from Twitch
                streamer.twitch_id = user.id;
                streamer.display_name = user.display_name;
                streamer.profile_image_url = user.profile_image_url;
                streamer.description = user.description;
                
                // Also update ID map
                streamersByTwitchId[user.id] = streamer;
              }
            });
          }
        } catch (error) {
          console.error('Error fetching batch of user data:', error);
          // Continue with other batches even if one fails
        }
      }
      
      // Now fetch live stream data for all streamers with IDs
      const twitchIds = Object.keys(streamersByTwitchId);
      
      if (twitchIds.length > 0) {
        // Process in batches of 100
        for (let i = 0; i < twitchIds.length; i += 100) {
          const idBatch = twitchIds.slice(i, i + 100);
          const idsQueryString = idBatch.map(id => `user_id=${id}`).join('&');
          
          try {
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${idsQueryString}`, {
              headers: {
                'Client-ID': twitchClientId,
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (!streamsResponse.ok) {
              console.error(`Error fetching stream data: ${streamsResponse.status}`);
              continue; // Try next batch
            }
            
            const streamsData = await streamsResponse.json();
            
            // Update streamers with real-time live data from Twitch
            if (streamsData.data && Array.isArray(streamsData.data)) {
              streamsData.data.forEach(stream => {
                const userId = stream.user_id;
                if (userId && streamersByTwitchId[userId]) {
                  const streamer = streamersByTwitchId[userId];
                  
                  // Only update if actually live - this data ONLY comes from Twitch
                  if (stream.type === 'live') {
                    streamer.is_live = true;
                    streamer.view_count = stream.viewer_count || 0;
                    streamer.game_name = stream.game_name || 'Not specified';
                    streamer.stream_title = stream.title || '';
                    streamer.thumbnail_url = stream.thumbnail_url?.replace('{width}', '320').replace('{height}', '180') || null;
                  }
                }
              });
            }
          } catch (error) {
            console.error('Error fetching batch of stream data:', error);
            // Continue with next batch even if one fails
          }
        }
      }
      
      // Set final state with all the data from Twitch
      setStreamers(streamersWithInfo);
      setCurrentIndex(0);
      
      // Log success with live streamer count
      const liveCount = streamersWithInfo.filter(s => s.is_live).length;
      console.log(`Loaded ${streamersWithInfo.length} streamers with ${liveCount} live`);
      
    } catch (error) {
      console.error('Error fetching streamers:', error.message);
      Alert.alert('Error', 'Failed to load streamers. Please try again.');
      
      // Only as last resort, load minimal data without Twitch info
      try {
        const { data: minimalStreamers } = await supabase
          .from('twitch_streamers')
          .select('id, username, votes')
          .order('votes', { ascending: false })
          .limit(30);
          
        if (minimalStreamers && minimalStreamers.length > 0) {
          // Create version with just the basics and all set to offline
          const fallbackStreamers = minimalStreamers.map(streamer => ({
            ...streamer,
            is_live: false, // Don't trust database data
            view_count: 0,  // Don't trust database data
            display_name: streamer.username,
            description: 'Unable to load streamer info from Twitch'
          }));
          
          setStreamers(fallbackStreamers);
          setCurrentIndex(0);
          Alert.alert('Limited Data Mode', 'Live status unavailable. Showing basic information only.');
        }
      } catch (fallbackError) {
        // Complete failure, we can't show anything
        console.error('Complete failure - no data available:', fallbackError);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchStreamers = async () => {
    try {
      setRefreshing(true);
      if (twitchAccessToken) {
        await fetchStreamersWithToken(twitchAccessToken);
      } else {
        await initTwitchAuth();
      }
    } catch (error) {
      console.error('Error in fetchStreamers:', error.message);
      Alert.alert('Error', 'Failed to load streamers. Please try again.');
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStreamers();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (event, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (event, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeRight();
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeLeft();
        } else {
          resetPosition();
        }
      }
    })
  ).current;

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 4,
      useNativeDriver: false
    }).start();
  };

  const swipeLeft = () => {
    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: false
    }).start(() => nextCard());
  };

  const swipeRight = async () => {
    // First animate the card
    Animated.timing(position, {
      toValue: { x: SCREEN_WIDTH + 100, y: 0 },
      duration: 250,
      useNativeDriver: false
    }).start(() => nextCard());

    // Add the streamer to favorites if user is logged in
    if (!user) {
      Alert.alert(
        'Sign In Required', 
        'Please sign in to save favorites and vote for streamers.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      if (streamers[currentIndex]) {
        const currentStreamer = streamers[currentIndex];
        
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: currentStreamer.id 
          });
          
        // Increment vote count for the streamer - only thing we update in DB
        const updatedVotes = (currentStreamer.votes || 0) + 1;
        await supabase
          .from('twitch_streamers')
          .update({ votes: updatedVotes })
          .eq('id', currentStreamer.id);
          
        // Update local state to show updated vote count
        const updatedStreamers = [...streamers];
        updatedStreamers[currentIndex].votes = updatedVotes;
        setStreamers(updatedStreamers);
      }
    } catch (error) {
      console.error('Error saving favorite:', error.message);
    }
  };

  const nextCard = () => {
    setCurrentIndex(prevIndex => prevIndex + 1);
    position.setValue({ x: 0, y: 0 });
  };

  const watchStreamer = (streamerId) => {
    // Navigate to stream view - you may need to implement this screen
    navigation.navigate('Stream', { streamerId });
  };

  const renderNoMoreCards = () => {
    return (
      <View style={styles.noMoreCardsContainer}>
        <Text style={styles.noMoreCardsText}>No more streamers!</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={fetchStreamers}
        >
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCard = () => {
    if (currentIndex >= streamers.length) {
      return renderNoMoreCards();
    }

    const streamer = streamers[currentIndex];

    return (
      <Animated.View
        style={[
          styles.cardContainer,
          {
            transform: [
              { translateX: position.x },
              { rotate: rotate }
            ]
          }
        ]}
        {...panResponder.panHandlers}
      >
        <Image
          source={{ uri: streamer.profile_image_url || 'https://via.placeholder.com/300' }}
          style={styles.image}
        />
        
        <View style={styles.overlayContainer}>
          <Animated.View style={[styles.likeContainer, { opacity: likeOpacity }]}>
            <Text style={styles.likeText}>FAVORITE</Text>
          </Animated.View>
          
          <Animated.View style={[styles.dislikeContainer, { opacity: dislikeOpacity }]}>
            <Text style={styles.dislikeText}>PASS</Text>
          </Animated.View>
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.nameText}>{streamer.display_name || streamer.username}</Text>
          <Text style={styles.descriptionText} numberOfLines={3}>
            {streamer.description || 'No description available'}
          </Text>
          
          {streamer.stream_title && (
            <Text style={styles.titleText} numberOfLines={1}>
              {streamer.stream_title}
            </Text>
          )}
          
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>👁️ {streamer.view_count || 0} viewers</Text>
            <Text style={styles.statsText}>❤️ {streamer.votes || 0} votes</Text>
          </View>
          
          {streamer.is_live && (
            <TouchableOpacity 
              style={styles.watchButton}
              onPress={() => watchStreamer(streamer.id)}
            >
              <Text style={styles.watchButtonText}>🔴 Watch Live</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Dig Deeper</Text>
      
      <View style={styles.buttonsContainer}>
        <TouchableOpacity 
          style={styles.favoritesButton}
          onPress={() => navigation.navigate('Favorites')}
        >
          <Text style={styles.favoritesButtonText}>❤️ Favorites</Text>
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4263eb" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#4263eb']}
            />
          }
          scrollEnabled={currentIndex >= streamers.length} // Only enable scrolling for refresh when no more cards
        >
          <View style={styles.cardArea}>
            {renderCard()}
          </View>
        </ScrollView>
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
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  favoritesButton: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  favoritesButtonText: {
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  cardContainer: {
    width: SCREEN_WIDTH * 0.9,
    height: '85%',
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '60%',
    resizeMode: 'cover',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeContainer: {
    position: 'absolute',
    top: 50,
    right: 40,
    transform: [{ rotate: '20deg' }],
    borderWidth: 4,
    borderColor: '#4CAF50',
    borderRadius: 10,
    padding: 10,
  },
  likeText: {
    color: '#4CAF50',
    fontSize: 24,
    fontWeight: 'bold',
  },
  dislikeContainer: {
    position: 'absolute',
    top: 50,
    left: 40,
    transform: [{ rotate: '-20deg' }],
    borderWidth: 4,
    borderColor: '#FF5252',
    borderRadius: 10,
    padding: 10,
  },
  dislikeText: {
    color: '#FF5252',
    fontSize: 24,
    fontWeight: 'bold',
  },
  infoContainer: {
    padding: 15,
    height: '40%',
  },
  nameText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statsText: {
    fontSize: 14,
    color: '#999',
  },
  watchButton: {
    backgroundColor: '#4263eb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
  },
  watchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  noMoreCardsContainer: {
    width: SCREEN_WIDTH * 0.9,
    height: '85%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  noMoreCardsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#4263eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DigDeeperScreen; 