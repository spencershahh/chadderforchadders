import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Switch, 
  ScrollView, 
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { SafeAreaView } from 'react-native-safe-area-context';

const SettingsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  
  // Settings state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [streamQuality, setStreamQuality] = useState('auto');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('No user logged in');
      
      // Fetch the user's profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      setProfile(data);
      setUsername(data.username || '');
      setEmail(user.email || '');
      
      // Load settings (in a real app, you'd store these in the database)
      setNotifications(data.notifications !== false);
      setDarkMode(data.dark_mode || false);
      setStreamQuality(data.stream_quality || 'auto');
    } catch (error) {
      console.error('Error fetching profile:', error.message);
      Alert.alert('Error', 'Failed to load profile settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('No user logged in');
      
      const updates = {
        id: user.id,
        username,
        notifications,
        dark_mode: darkMode,
        stream_quality: streamQuality,
        updated_at: new Date()
      };
      
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      
      if (error) throw error;
      
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error.message);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const SettingRow = ({ title, children }) => (
    <View style={styles.settingRow}>
      <Text style={styles.settingTitle}>{title}</Text>
      <View style={styles.settingControl}>
        {children}
      </View>
    </View>
  );

  const SettingSection = ({ title, children }) => (
    <View style={styles.settingSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      
      <ScrollView style={styles.content}>
        <SettingSection title="Account">
          <SettingRow title="Username">
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
            />
          </SettingRow>
          <SettingRow title="Email">
            <Text style={styles.emailText}>{email}</Text>
          </SettingRow>
        </SettingSection>
        
        <SettingSection title="Preferences">
          <SettingRow title="Notifications">
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#d1d1d1', true: '#81b0ff' }}
              thumbColor={notifications ? '#4263eb' : '#f4f3f4'}
            />
          </SettingRow>
          <SettingRow title="Dark Mode">
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#d1d1d1', true: '#81b0ff' }}
              thumbColor={darkMode ? '#4263eb' : '#f4f3f4'}
            />
          </SettingRow>
        </SettingSection>
        
        <SettingSection title="Stream Settings">
          <SettingRow title="Stream Quality">
            <View style={styles.qualitySelector}>
              {['auto', 'high', 'medium', 'low'].map(quality => (
                <TouchableOpacity
                  key={quality}
                  style={[
                    styles.qualityOption,
                    streamQuality === quality && styles.qualityOptionSelected
                  ]}
                  onPress={() => setStreamQuality(quality)}
                >
                  <Text 
                    style={[
                      styles.qualityText,
                      streamQuality === quality && styles.qualityTextSelected
                    ]}
                  >
                    {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>
        </SettingSection>
        
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={saveSettings}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 20,
  },
  settingSection: {
    marginBottom: 25,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingTitle: {
    fontSize: 16,
    color: '#333',
  },
  settingControl: {
    flex: 1,
    alignItems: 'flex-end',
  },
  input: {
    textAlign: 'right',
    color: '#555',
    width: '60%',
    paddingVertical: 5,
  },
  emailText: {
    color: '#555',
  },
  qualitySelector: {
    flexDirection: 'row',
  },
  qualityOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 5,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
  },
  qualityOptionSelected: {
    backgroundColor: '#4263eb',
  },
  qualityText: {
    fontSize: 12,
    color: '#666',
  },
  qualityTextSelected: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#4263eb',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SettingsScreen; 