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
  const [newStreamerUrl, setNewStreamerUrl] = useState('');
  const [newStreamerBio, setNewStreamerBio] = useState('');
  const [streamersJson, setStreamersJson] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('streamers'); // 'streamers', 'users', or 'analytics'
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
      // Fetch streamers from the JSON file with a proper path for production
      const response = await fetch('/streamers.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch streamers: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setStreamers(data);
      setStreamersJson(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error loading streamers:', error);
      toast.error('Failed to load streamers');
    }
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
      // Set up server endpoint to fetch Twitch user info to avoid exposing API keys
      const response = await axios.get(`/api/twitch-user?username=${username}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching Twitch user info:', error);
      throw new Error('Failed to fetch Twitch user info');
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
      setStreamersJson(JSON.stringify(updatedStreamers, null, 2));
      toast.success('Streamer added to list! Remember to save your changes.');
      
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
      
      // For development environment - display a message about how this would work in production
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        toast.dismiss();
        toast.success('In development mode. To save changes, copy the JSON and update the file manually.');
        return;
      }
      
      // In production, you would have an API endpoint to update the JSON file
      const response = await fetch('/api/update-streamers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamers),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update streamers: ${response.status} ${errorText || response.statusText}`);
      }
      
      toast.dismiss();
      toast.success('Streamers list successfully updated on the server.');
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
              <button 
                className={`${styles.button} ${styles.editButton}`}
                onClick={handleEditStreamersJson}
              >
                Edit as JSON
              </button>
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
            {streamers.map((streamer) => (
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
            ))}
          </div>
        )}
      </div>
      
      <div className={styles.helpText}>
        <h3>Instructions</h3>
        <p>To update streamers:</p>
        <ol>
          <li>Add or remove streamers using the controls above</li>
          <li>Alternatively, edit the JSON directly</li>
          <li>Copy the JSON to update your streamers.json file</li>
          <li>In a production environment, the "Save to Server" button would update the file directly</li>
        </ol>
      </div>
    </>
  );

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