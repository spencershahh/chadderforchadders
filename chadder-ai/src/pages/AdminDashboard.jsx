import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from './AdminDashboard.module.css';

// Admin dashboard with emergency mode fallback
const AdminDashboard = () => {
  // State management
  const [mode, setMode] = useState('emergency'); // 'emergency' or 'database'
  const [streamers, setStreamers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    twitchId: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  // Attempt to load streamers if in database mode
  useEffect(() => {
    if (mode === 'database') {
      fetchStreamers();
    }
  }, [mode]);

  // Safe database operation to fetch streamers
  const fetchStreamers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('streamers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching streamers:', error);
        setError(`Failed to fetch streamers: ${error.message}`);
        // Switch back to emergency mode if database error
        setMode('emergency');
        return;
      }
      
      setStreamers(data || []);
    } catch (err) {
      console.error('Exception fetching streamers:', err);
      setError(`Something went wrong: ${err.message}`);
      // Switch back to emergency mode if exception
      setMode('emergency');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error for this field
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null
      });
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.twitchId.trim() && !formData.name.trim()) {
      errors.twitchId = 'Twitch ID or name is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    try {
      // Prepare streamer data to match the actual database structure
      const streamerData = {
        name: formData.name.trim(),
        bio: formData.bio.trim(),
        username: formData.name.trim().toLowerCase().replace(/\s+/g, '_'),
        // Only include fields that exist in the actual database
        votes: 0,
        created_at: new Date().toISOString()
        // Other fields like display_name, twitch_id, etc. are removed as they don't exist in the schema
      };
      
      const { data, error } = await supabase
        .from('streamers')
        .insert([streamerData])
        .select();
      
      if (error) {
        console.error('Error adding streamer:', error);
        setError(`Failed to add streamer: ${error.message}`);
        return;
      }
      
      // Success!
      setSuccessMessage(`Streamer "${formData.name}" added successfully! They will now appear on the Discover page.`);
      setFormData({ name: '', bio: '', twitchId: '' });
      
      // Refresh the streamers list
      fetchStreamers();
    } catch (err) {
      console.error('Exception adding streamer:', err);
      setError(`Something went wrong: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle streamer deletion
  const handleDeleteStreamer = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete streamer "${name}"?`)) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('streamers')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting streamer:', error);
        setError(`Failed to delete streamer: ${error.message}`);
        return;
      }
      
      setSuccessMessage(`Streamer "${name}" deleted successfully!`);
      
      // Refresh the streamers list
      fetchStreamers();
    } catch (err) {
      console.error('Exception deleting streamer:', err);
      setError(`Something went wrong: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle between modes
  const toggleMode = () => {
    if (mode === 'emergency') {
      setMode('database');
    } else {
      setMode('emergency');
    }
  };

  // Render emergency mode
  const renderEmergencyMode = () => (
    <>
      <div className={styles.notice}>
        <p><strong>Emergency Mode:</strong> This is a static admin dashboard with no database operations.</p>
      </div>
      
      <div className={styles.section}>
        <h2>Admin Information</h2>
        <div className={styles.mockUser}>
          <div><strong>Email:</strong> wallststonks@gmail.com</div>
          <div><strong>User ID:</strong> 5f6b3f6d-9aa9-4847-8238-b3b18beb4f3b</div>
          <div><strong>Role:</strong> Admin</div>
        </div>
      </div>
      
      <div className={styles.section}>
        <h2>Database Status</h2>
        <p>Database connection issues detected. The admin panel is operating in emergency mode.</p>
        <p>To fix database connection issues:</p>
        <ol>
          <li>Check Supabase permissions for the admins table</li>
          <li>Make sure Row Level Security (RLS) is disabled for development</li>
          <li>Run the SQL scripts to create tables with proper permissions</li>
        </ol>
      </div>
      
      <div className={styles.section}>
        <h2>Streamers Overview</h2>
        <div className={styles.mockStats}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>5</div>
            <div className={styles.statLabel}>Top Streamers</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>2</div>
            <div className={styles.statLabel}>Currently Live</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>12K+</div>
            <div className={styles.statLabel}>Total Followers</div>
          </div>
        </div>
      </div>
    </>
  );

  // Render database mode
  const renderDatabaseMode = () => (
    <>
      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
        </div>
      )}
      
      {successMessage && (
        <div className={styles.successMessage}>
          <p>{successMessage}</p>
        </div>
      )}
      
      <div className={styles.section}>
        <h2>Add New Streamer</h2>
        <p>Add a streamer to the Discover page by filling out this form.</p>
        
        <form onSubmit={handleSubmit} className={styles.streamerForm}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Streamer Name*:</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`${styles.input} ${formErrors.name ? styles.inputError : ''}`}
              placeholder="Enter streamer name"
            />
            {formErrors.name && <div className={styles.errorText}>{formErrors.name}</div>}
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="twitchId">Twitch ID:</label>
            <input
              type="text"
              id="twitchId"
              name="twitchId"
              value={formData.twitchId}
              onChange={handleInputChange}
              className={`${styles.input} ${formErrors.twitchId ? styles.inputError : ''}`}
              placeholder="Enter Twitch ID (optional)"
            />
            {formErrors.twitchId && <div className={styles.errorText}>{formErrors.twitchId}</div>}
            <div className={styles.helpText}>The Twitch username or ID of the streamer</div>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="bio">Bio:</label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              className={styles.textarea}
              rows={4}
              placeholder="Enter streamer bio (optional)"
            />
          </div>
          
          <div className={styles.formActions}>
            <button 
              type="submit" 
              className={styles.button}
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : 'Add Streamer'}
            </button>
          </div>
        </form>
      </div>
      
      <div className={styles.section}>
        <h2>Manage Streamers</h2>
        {isLoading ? (
          <div className={styles.loadingIndicator}>Loading streamers...</div>
        ) : streamers.length > 0 ? (
          <div className={styles.streamersList}>
            {streamers.map((streamer) => (
              <div key={streamer.id} className={styles.streamerItem}>
                <div className={styles.streamerInfo}>
                  <h3>{streamer.name}</h3>
                  {streamer.bio && <p>{streamer.bio}</p>}
                  <div className={styles.streamerMeta}>
                    {streamer.twitch_id && (
                      <span className={styles.twitchId}>
                        Twitch: {streamer.twitch_id}
                      </span>
                    )}
                    <span className={styles.timestamp}>
                      Added: {new Date(streamer.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className={styles.streamerActions}>
                  <button
                    onClick={() => window.open(`https://twitch.tv/${streamer.name || streamer.twitch_id}`, '_blank')}
                    className={styles.viewButton}
                  >
                    View on Twitch
                  </button>
                  <button
                    onClick={() => handleDeleteStreamer(streamer.id, streamer.name)}
                    className={styles.deleteButton}
                    disabled={isLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>No streamers found. Add some using the form above!</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className={styles.adminDashboard}>
      <h1 className={styles.title}>Admin Dashboard</h1>
      
      <div className={styles.modeToggle}>
        <button 
          onClick={toggleMode}
          className={`${styles.toggleButton} ${mode === 'database' ? styles.databaseMode : styles.emergencyMode}`}
        >
          {mode === 'emergency' 
            ? '🔄 Switch to Database Mode' 
            : '⚠️ Switch to Emergency Mode'}
        </button>
        <div className={styles.modeIndicator}>
          Current Mode: {mode === 'emergency' ? 'Emergency (No Database)' : 'Database (Live Operations)'}
        </div>
      </div>
      
      {mode === 'emergency' ? renderEmergencyMode() : renderDatabaseMode()}
    </div>
  );
};

export default AdminDashboard; 