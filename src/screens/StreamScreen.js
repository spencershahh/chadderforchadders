import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Linking,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { supabase } from '../utils/supabaseClient';
import { fetchStreamerById } from '../utils/twitchService';

const { width } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16;

const StreamScreen = ({ route, navigation }) => {
  const { streamerId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [streamer, setStreamer] = useState(null);
  const [embedHeight, setEmbedHeight] = useState(width * ASPECT_RATIO);

  useEffect(() => {
    if (streamerId) {
      fetchStreamerData();
    } else {
      Alert.alert('Error', 'Streamer information not provided');
      navigation.goBack();
    }
  }, [streamerId]);

  const fetchStreamerData = async () => {
    try {
      setLoading(true);
      
      // First get streamer from our database
      const { data: dbStreamer, error } = await supabase
        .from('twitch_streamers')
        .select('*')
        .eq('id', streamerId)
        .single();
        
      if (error) throw error;
      
      if (!dbStreamer || !dbStreamer.twitch_id) {
        throw new Error('Streamer not found');
      }
      
      // Get fresh data from Twitch API
      const twitchData = await fetchStreamerById(dbStreamer.twitch_id);
      
      if (!twitchData.is_live) {
        Alert.alert(
          'Streamer Offline',
          `${twitchData.display_name || twitchData.username} is not currently live.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }
      
      // Combine database and Twitch data
      setStreamer({
        ...dbStreamer,
        ...twitchData
      });
    } catch (error) {
      console.error('Error fetching streamer:', error);
      Alert.alert('Error', 'Failed to load streamer information');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const openInTwitchApp = () => {
    if (!streamer) return;
    
    const twitchAppUrl = `twitch://stream/${streamer.username}`;
    const twitchWebUrl = `https://twitch.tv/${streamer.username}`;
    
    // Try to open in Twitch app first
    Linking.canOpenURL(twitchAppUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(twitchAppUrl);
        } else {
          // Fall back to browser
          return Linking.openURL(twitchWebUrl);
        }
      })
      .catch(error => {
        console.error('Error opening Twitch:', error);
        // If that fails, just open in browser
        Linking.openURL(twitchWebUrl).catch(() => {
          Alert.alert('Error', 'Unable to open Twitch');
        });
      });
  };

  // Ensure we have the proper parent query param for embedding
  const getEmbedUrl = () => {
    if (!streamer) return '';
    
    const baseUrl = `https://player.twitch.tv/?channel=${streamer.username}&parent=${Platform.OS === 'ios' ? 'ios' : 'android'}.example.com`;
    return baseUrl;
  };

  // HTML to inject into WebView for custom styling
  const twitchPlayerHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: #000;
          }
          .video-container {
            width: 100%;
            height: 100%;
            position: relative;
          }
          iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <div class="video-container">
          <iframe
            src="${getEmbedUrl()}"
            frameborder="0"
            allowfullscreen="true"
            scrolling="no"
          ></iframe>
        </div>
      </body>
    </html>
  `;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading Stream...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4263eb" />
        </View>
      </SafeAreaView>
    );
  }

  if (!streamer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Stream not available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {streamer.display_name || streamer.username}
        </Text>
      </View>
      
      <ScrollView style={styles.scrollContainer}>
        {/* Stream Embed */}
        <View style={[styles.videoContainer, { height: embedHeight }]}>
          <WebView
            source={{ html: twitchPlayerHtml }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#4263eb" />
              </View>
            )}
            onError={() => Alert.alert('Error', 'Failed to load stream')}
          />
        </View>
        
        <View style={styles.contentContainer}>
          {/* Stream Info */}
          <View style={styles.streamInfoContainer}>
            <Text style={styles.streamTitle}>
              {streamer.stream_info?.title || streamer.title || 'Live Stream'}
            </Text>
            
            <Text style={styles.viewerCount}>
              👁️ {streamer.view_count || streamer.stream_info?.viewer_count || 0} viewers
            </Text>
            
            {streamer.stream_info?.game_name && (
              <Text style={styles.gameText}>
                Playing: {streamer.stream_info.game_name}
              </Text>
            )}
          </View>
          
          {/* Streamer Info */}
          <View style={styles.streamerInfoContainer}>
            <Text style={styles.sectionTitle}>About {streamer.display_name || streamer.username}</Text>
            <Text style={styles.descriptionText}>
              {streamer.description || 'No description available.'}
            </Text>
          </View>
          
          {/* Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              style={styles.openTwitchButton}
              onPress={openInTwitchApp}
            >
              <Text style={styles.openTwitchButtonText}>
                Open in Twitch
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10', // Twitch dark theme
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  videoContainer: {
    width: '100%',
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: 16,
  },
  streamInfoContainer: {
    marginBottom: 20,
  },
  streamTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  viewerCount: {
    color: '#eb4c4c',
    fontSize: 14,
    marginBottom: 8,
  },
  gameText: {
    color: '#a970ff', // Twitch purple
    fontSize: 14,
  },
  streamerInfoContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  descriptionText: {
    color: '#adadb8',
    fontSize: 14,
    lineHeight: 20,
  },
  actionsContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  openTwitchButton: {
    backgroundColor: '#9147ff', // Twitch purple
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  openTwitchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default StreamScreen; 