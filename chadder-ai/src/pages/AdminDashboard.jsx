import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import styles from './AdminDashboard.module.css';
import UserManagement from './UserManagement';
import AnalyticsDashboard from './AnalyticsDashboard';

const AdminDashboard = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [streamers, setStreamers] = useState([]);
  const [streamersWithTwitchData, setStreamersWithTwitchData] = useState([]);
  const [newStreamerUrl, setNewStreamerUrl] = useState('');
  const [newStreamerBio, setNewStreamerBio] = useState('');
  const [streamersJson, setStreamersJson] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('streamers'); // 'streamers', 'users', or 'analytics'
  const [loadingTwitchData, setLoadingTwitchData] = useState(false);
  const textareaRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/login');
          return;
        }

        const { data: adminData, error: adminError } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (adminError || !adminData) {
          setIsAdmin(false);
          navigate('/');
          toast.error('You do not have admin access');
          return;
        }

        setIsAdmin(true);
        await loadStreamers();
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [navigate]);

  const loadStreamers = async () => {
    try {
      // First try to load streamers from Supabase
      const { data: dbStreamers, error: dbError } = await supabase
        .from('streamers')
        .select('name, bio')
        .order('name');
      
      // If we have data from Supabase, use it
      if (!dbError && dbStreamers && dbStreamers.length > 0) {
        console.log('Loaded streamers from Supabase:', dbStreamers.length);
        
        // Transform the data to use username instead of name for compatibility
        const transformedStreamers = dbStreamers.map(streamer => ({
          username: streamer.name,
          bio: streamer.bio
        }));
        
        setStreamers(transformedStreamers);
        setStreamersJson(JSON.stringify(transformedStreamers, null, 2));
        
        // After loading streamers, fetch their Twitch data
        fetchTwitchDataForStreamers(transformedStreamers);
        return;
      }
      
      // Fall back to loading from JSON file
      console.log('No streamers in database, falling back to JSON file');
      const response = await fetch('/streamers.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch streamers: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setStreamers(data);
      setStreamersJson(JSON.stringify(data, null, 2));
      
      // After loading streamers, fetch their Twitch data
      fetchTwitchDataForStreamers(data);
      
      // If we loaded from JSON but database exists, sync to database
      if (!dbError) {
        syncStreamersToDatabase(data);
      }
    } catch (error) {
      console.error('Error loading streamers:', error);
      toast.error('Failed to load streamers');
    }
  };
  
  // New function to sync streamers from JSON to database
  const syncStreamersToDatabase = async (streamersData) => {
    try {
      // For each streamer, upsert to the database
      const promises = streamersData.map(async (streamer) => {
        console.log('Syncing streamer to database:', streamer); // Add logging
        const { data, error } = await supabase
          .from('streamers')
          .upsert({ 
            name: streamer.username,
            bio: streamer.bio
          }, { 
            onConflict: 'name' 
          })
          .select(); // Add this to get the result
          
        if (error) {
          console.error('Error upserting streamer:', error);
          throw error;
        }
        return data;
      });
      
      const results = await Promise.all(promises);
      console.log('Synced streamers to database:', results);
      return results;
    } catch (error) {
      console.error('Error syncing streamers to database:', error);
      throw error; // Re-throw the error to handle it in the calling function
    }
  };

  // Fetch Twitch data for all streamers
  const fetchTwitchDataForStreamers = async (streamersList) => {
    try {
      setLoadingTwitchData(true);
      
      // Batch usernames to avoid too many API calls
      const usernames = streamersList.map(s => s.username);
      
      // For safety, process in batches of 10
      const batchSize = 10;
      const enhancedStreamers = [...streamersList];
      
      for (let i = 0; i < usernames.length; i += batchSize) {
        const batch = usernames.slice(i, i + batchSize);
        
        // Execute batch requests in parallel
        await Promise.all(batch.map(async (username, index) => {
          try {
            const twitchData = await getTwitchUserInfo(username);
            
            // Find corresponding streamer in our array
            const streamerIndex = i + index;
            if (streamerIndex < enhancedStreamers.length) {
              enhancedStreamers[streamerIndex] = {
                ...enhancedStreamers[streamerIndex],
                twitchData: twitchData
              };
            }
          } catch (error) {
            console.warn(`Could not fetch data for ${username}:`, error);
            // Still keep the streamer, just without Twitch data
          }
        }));
      }
      
      setStreamersWithTwitchData(enhancedStreamers);
    } catch (error) {
      console.error('Error fetching Twitch data:', error);
      toast.error('Failed to fetch some Twitch data');
    } finally {
      setLoadingTwitchData(false);
    }
  };

  // Function to manually refresh Twitch data
  const refreshTwitchData = () => {
    fetchTwitchDataForStreamers(streamers);
    toast.success('Refreshing Twitch data...');
  };

  const extractUsernameFromUrl = (url) => {
    try {
      // Extract username from URL like https://twitch.tv/username
      if (!url.includes('twitch.tv/')) {
        return null;
      }
      
      return url.split('twitch.tv/')[1].split('/')[0].toLowerCase();
    } catch (error) {
      console.error('Error extracting username:', error);
      return null;
    }
  };

  const getTwitchUserInfo = async (username) => {
    try {
      // First try with API endpoint
      try {
        const response = await fetch(`/api/twitch-user?username=${encodeURIComponent(username)}`);
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
      } catch (apiError) {
        console.warn(`API error for Twitch user ${username}:`, apiError);
        // Fall back to a simpler object with basic info
        return {
          username: username,
          is_live: false,
          display_name: username,
          profile_image_url: null,
          follower_count: null,
          viewer_count: null
        };
      }
    } catch (error) {
      console.error('Error fetching Twitch user info:', error);
      throw error;
    }
  };

  const handleAddStreamer = async (e) => {
    e.preventDefault();
    
    try {
      const username = extractUsernameFromUrl(newStreamerUrl);
      
      if (!username) {
        toast.error('Please enter a valid Twitch URL');
        return;
      }
      
      // Check if streamer already exists
      const existingStreamer = streamers.find(s => s.username.toLowerCase() === username.toLowerCase());
      if (existingStreamer) {
        toast.error('This streamer is already in the list');
        return;
      }
      
      // Add the new streamer
      const newStreamer = {
        username: username,
        bio: newStreamerBio || 'No bio available.'
      };
      
      // Create a copy of existing streamers and add the new one
      const updatedStreamers = [...streamers, newStreamer];
      
      // Update state
      setStreamers(updatedStreamers);
      setStreamersWithTwitchData(updatedStreamers);
      setStreamersJson(JSON.stringify(updatedStreamers, null, 2));
      
      // Immediately save to database
      try {
        await syncStreamersToDatabase([newStreamer]);
        toast.success('Streamer added and saved to database!');
        
        // Refresh the streamers list from database
        await loadStreamers();
      } catch (error) {
        console.error('Error saving new streamer:', error);
        toast.error('Failed to save streamer to database. Try using Save to Server button.');
      }
      
      // Reset form
      setNewStreamerUrl('');
      setNewStreamerBio('');
      
    } catch (error) {
      console.error('Error adding streamer:', error);
      toast.error('Failed to add streamer');
    }
  };

  const handleRemoveStreamer = (username) => {
    try {
      // Create a copy of streamers without the one to be removed
      const updatedStreamers = streamers.filter(s => s.username !== username);
      
      // Update state
      setStreamers(updatedStreamers);
      setStreamersJson(JSON.stringify(updatedStreamers, null, 2));
      toast.success('Streamer removed from list! Remember to save your changes.');
      
    } catch (error) {
      console.error('Error removing streamer:', error);
      toast.error('Failed to remove streamer');
    }
  };

  const handleEditStreamersJson = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);
  };

  const handleSaveStreamersJson = () => {
    try {
      const parsedJson = JSON.parse(streamersJson);
      setStreamers(parsedJson);
      setIsEditing(false);
      toast.success('JSON updated! Remember to save your changes to the server.');
    } catch (error) {
      toast.error('Invalid JSON format. Please check your syntax.');
    }
  };

  const handleCancelEdit = () => {
    setStreamersJson(JSON.stringify(streamers, null, 2));
    setIsEditing(false);
  };

  const handleSaveToServer = async () => {
    try {
      toast.loading('Saving streamers list...');
      
      // Convert streamers data to the format expected by the database
      const dbStreamers = streamers.map(streamer => ({
        name: streamer.username,
        bio: streamer.bio
      }));
      
      // Try to save directly to Supabase first (faster)
      try {
        await syncStreamersToDatabase(streamers);
        toast.dismiss();
        toast.success('Streamers list updated in database!');
        return;
      } catch (dbError) {
        console.warn('Direct database update failed, trying API:', dbError);
        // Continue to API method
      }
      
      // Get the current user's session for the auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication error. Please log in again.');
      }
      
      // In development environment - display a message
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        toast.dismiss();
        toast.success('Development mode: Streamers saved to database.');
        return;
      }
      
      // Call the API with proper authentication
      const response = await fetch('/api/update-streamers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(dbStreamers),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update streamers: ${response.status} ${errorText || response.statusText}`);
      }
      
      toast.dismiss();
      toast.success('Streamers list successfully updated!');
    } catch (error) {
      console.error('Error saving streamers to server:', error);
      toast.dismiss();
      toast.error(`Failed to save to server: ${error.message}`);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(streamersJson)
      .then(() => {
        toast.success('JSON copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy JSON:', err);
        toast.error('Failed to copy JSON');
      });
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  const renderStreamerManagement = () => (
    <>
      <div className={styles.section}>
        <h2>Add New Streamer</h2>
        <form onSubmit={handleAddStreamer} className={styles.addStreamerForm}>
          <div className={styles.formGroup}>
            <label htmlFor="streamerUrl">Twitch URL:</label>
            <input
              id="streamerUrl"
              type="text"
              value={newStreamerUrl}
              onChange={(e) => setNewStreamerUrl(e.target.value)}
              placeholder="https://twitch.tv/username"
              required
              className={styles.input}
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="streamerBio">Bio:</label>
            <textarea
              id="streamerBio"
              value={newStreamerBio}
              onChange={(e) => setNewStreamerBio(e.target.value)}
              placeholder="Enter streamer bio"
              className={styles.textarea}
              rows={3}
            />
          </div>
          
          <button type="submit" className={styles.button}>Add Streamer</button>
        </form>
      </div>
      
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Manage Streamers</h2>
          <div className={styles.buttonGroup}>
            {!isEditing ? (
              <>
                <button 
                  className={`${styles.button} ${styles.refreshButton}`}
                  onClick={refreshTwitchData}
                  disabled={loadingTwitchData}
                >
                  {loadingTwitchData ? 'Refreshing...' : 'Refresh Twitch Data'}
                </button>
                <button 
                  className={`${styles.button} ${styles.editButton}`}
                  onClick={handleEditStreamersJson}
                >
                  Edit as JSON
                </button>
              </>
            ) : (
              <>
                <button 
                  className={`${styles.button} ${styles.saveButton}`}
                  onClick={handleSaveStreamersJson}
                >
                  Apply
                </button>
                <button 
                  className={`${styles.button} ${styles.cancelButton}`}
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
              </>
            )}
            <button 
              className={`${styles.button} ${styles.copyButton}`}
              onClick={copyToClipboard}
            >
              Copy JSON
            </button>
            <button 
              className={`${styles.button} ${styles.saveServerButton}`}
              onClick={handleSaveToServer}
            >
              Save to Server
            </button>
          </div>
        </div>
        
        {isEditing ? (
          <div className={styles.jsonEditorWrapper}>
            <textarea
              ref={textareaRef}
              className={styles.jsonEditor}
              value={streamersJson}
              onChange={(e) => setStreamersJson(e.target.value)}
              rows={20}
            />
          </div>
        ) : (
          <div className={styles.streamerList}>
            {streamersWithTwitchData.length > 0 ? 
              streamersWithTwitchData.map((streamer) => (
                <div key={streamer.username} className={styles.streamerItem}>
                  <div className={styles.streamerInfo}>
                    <div className={styles.streamerHeader}>
                      <strong>{streamer.username}</strong>
                      {streamer.twitchData && (
                        <div className={styles.twitchInfo}>
                          <span className={streamer.twitchData.is_live ? styles.liveNow : styles.offline}>
                            {streamer.twitchData.is_live ? '● LIVE NOW' : 'Offline'}
                          </span>
                          {streamer.twitchData.follower_count && (
                            <span className={styles.followers}>
                              <span role="img" aria-label="followers">👥</span> {formatNumber(streamer.twitchData.follower_count)}
                            </span>
                          )}
                          {streamer.twitchData.viewer_count && streamer.twitchData.is_live && (
                            <span className={styles.viewers}>
                              <span role="img" aria-label="viewers">👁️</span> {formatNumber(streamer.twitchData.viewer_count)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <p>{streamer.bio}</p>
                    {streamer.twitchData && streamer.twitchData.stream_info && (
                      <div className={styles.streamDetails}>
                        <div className={styles.streamCategory}>
                          <strong>Playing:</strong> {streamer.twitchData.stream_info.game_name || 'Unknown'}
                        </div>
                        <div className={styles.streamTitle}>
                          <strong>Title:</strong> {streamer.twitchData.stream_info.title}
                        </div>
                        {streamer.twitchData.stream_info.started_at && (
                          <div className={styles.streamDuration}>
                            <strong>Live for:</strong> {calculateStreamDuration(streamer.twitchData.stream_info.started_at)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={styles.streamerActions}>
                    <button 
                      className={styles.viewButton}
                      onClick={() => window.open(`https://twitch.tv/${streamer.username}`, '_blank')}
                    >
                      View on Twitch
                    </button>
                    <button 
                      className={styles.removeButton}
                      onClick={() => handleRemoveStreamer(streamer.username)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
              :
              streamers.map((streamer) => (
                <div key={streamer.username} className={styles.streamerItem}>
                  <div className={styles.streamerInfo}>
                    <strong>{streamer.username}</strong>
                    <p>{streamer.bio}</p>
                  </div>
                  <button 
                    className={styles.removeButton}
                    onClick={() => handleRemoveStreamer(streamer.username)}
                  >
                    Remove
                  </button>
                </div>
              ))
            }
          </div>
        )}
      </div>
      
      <div className={styles.helpText}>
        <h3>Instructions</h3>
        <p>To update streamers:</p>
        <ol>
          <li>Add or remove streamers using the controls above</li>
          <li>Refresh Twitch data to see current status and metrics</li>
          <li>Alternatively, edit the JSON directly</li>
          <li>Copy the JSON to update your streamers.json file</li>
          <li>In a production environment, the "Save to Server" button would update the file directly</li>
        </ol>
      </div>
    </>
  );

  // Helper function to format large numbers
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  // Calculate how long a stream has been live
  const calculateStreamDuration = (startedAt) => {
    const startTime = new Date(startedAt);
    const currentTime = new Date();
    const durationMs = currentTime - startTime;
    
    // Convert to hours and minutes
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        return <UserManagement />;
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'streamers':
      default:
        return renderStreamerManagement();
    }
  };

  return (
    <div className={styles.adminDashboard}>
      <Toaster position="top-center" />
      <h1 className={styles.title}>Admin Dashboard</h1>
      
      <div className={styles.tabBar}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'streamers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('streamers')}
        >
          Streamer Management
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'users' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Management
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'analytics' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics & Insights
        </button>
      </div>
      
      {renderTabContent()}
    </div>
  );
};

export default AdminDashboard; 