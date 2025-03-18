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
import { getStreamersForDigDeeper, saveStreamerToDatabase } from '../utils/twitchService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 120;

const DigDeeperScreen = ({ navigation }) => {
  const [streamers, setStreamers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
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
    
    // Fetch streamers on component mount
    fetchStreamers();

    // Refresh when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      fetchStreamers();
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

  const fetchStreamers = async () => {
    try {
      setLoading(true);
      
      // Use our Twitch service to get streamers
      const streamersData = await getStreamersForDigDeeper(30);
      
      if (streamersData && streamersData.length > 0) {
        setStreamers(streamersData);
        setCurrentIndex(0); // Reset to first card when refreshing
      }
    } catch (error) {
      console.error('Error fetching streamers:', error.message);
      Alert.alert('Error', 'Failed to load streamers. Please try again.');
    } finally {
      setLoading(false);
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
        
        // Ensure streamer is in our database with latest info
        await saveStreamerToDatabase(currentStreamer);
        
        // Save to favorites
        await supabase
          .from('user_favorites')
          .upsert({ 
            user_id: user.id, 
            streamer_id: currentStreamer.id 
          });
          
        // Increment vote count for the streamer
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
          
          {streamer.title && (
            <Text style={styles.titleText} numberOfLines={1}>
              {streamer.title}
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