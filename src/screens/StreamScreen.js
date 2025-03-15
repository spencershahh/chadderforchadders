import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  TextInput, 
  KeyboardAvoidingView, 
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { SafeAreaView } from 'react-native-safe-area-context';

const StreamScreen = ({ route, navigation }) => {
  const { streamId, username } = route.params;
  const [stream, setStream] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    fetchStreamDetails();
    fetchMessages();
    
    const messagesSubscription = setupMessagesSubscription();
    
    return () => {
      messagesSubscription?.unsubscribe();
    };
  }, [streamId]);

  const fetchStreamDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch stream details
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .eq('id', streamId)
        .single();
      
      if (error) throw error;
      
      setStream(data);
    } catch (error) {
      console.error('Error fetching stream details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      // Fetch messages
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, profiles(username, avatar_url)')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      if (data) setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error.message);
    }
  };

  const setupMessagesSubscription = () => {
    return supabase
      .channel('public:chat_messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages',
        filter: `stream_id=eq.${streamId}` 
      }, (payload) => {
        // Fetch the user info separately since the subscription doesn't include joins
        fetchUserForMessage(payload.new);
      })
      .subscribe();
  };

  const fetchUserForMessage = async (message) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', message.user_id)
        .single();
      
      if (error) throw error;
      
      const messageWithUser = {
        ...message,
        profiles: data
      };
      
      setMessages(prevMessages => [...prevMessages, messageWithUser]);
    } catch (error) {
      console.error('Error fetching user for message:', error.message);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    try {
      setSendingMessage(true);
      
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      
      if (!user) throw new Error('You must be logged in to send a message');
      
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          content: newMessage.trim(),
          user_id: user.id,
          stream_id: streamId
        });
      
      if (error) throw error;
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={styles.messageContainer}>
      <Image 
        source={{ uri: item.profiles?.avatar_url || 'https://via.placeholder.com/40' }}
        style={styles.avatar}
      />
      <View style={styles.messageContent}>
        <Text style={styles.username}>{item.profiles?.username || 'User'}</Text>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4263eb" />
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
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{stream?.title || username}</Text>
      </View>
      
      <View style={styles.streamContainer}>
        {/* Placeholder for video player */}
        <View style={styles.videoPlaceholder}>
          <Text style={styles.placeholderText}>Stream Video</Text>
        </View>
        
        <View style={styles.streamInfo}>
          <Text style={styles.streamTitle}>{stream?.title || 'Stream'}</Text>
          <Text style={styles.viewerCount}>{stream?.viewer_count || 0} viewers</Text>
        </View>
      </View>
      
      <View style={styles.chatContainer}>
        <Text style={styles.chatTitle}>Chat</Text>
        
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          style={styles.messagesList}
        />
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor="#999"
            />
            <TouchableOpacity 
              style={styles.sendButton} 
              onPress={sendMessage}
              disabled={sendingMessage || !newMessage.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 5,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: '#4263eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  streamContainer: {
    padding: 15,
  },
  videoPlaceholder: {
    height: 220,
    backgroundColor: '#333',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
  },
  streamInfo: {
    marginBottom: 15,
  },
  streamTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  viewerCount: {
    fontSize: 14,
    color: '#666',
  },
  chatContainer: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  chatTitle: {
    padding: 15,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  messagesList: {
    flex: 1,
    padding: 15,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#ddd',
  },
  messageContent: {
    flex: 1,
  },
  username: {
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#333',
  },
  messageText: {
    color: '#555',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#4263eb',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default StreamScreen; 