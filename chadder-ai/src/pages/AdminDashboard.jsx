import React, { useState } from 'react';
import styles from './AdminDashboard.module.css';

// Completely static admin dashboard - no database operations
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('streamers');
  
  // Mock data - no database operations
  const mockStreamers = [
    { id: '1', name: 'pokimane', bio: 'Popular Twitch streamer' },
    { id: '2', name: 'xQc', bio: 'Variety streamer and former Overwatch pro' },
    { id: '3', name: 'shroud', bio: 'FPS gaming legend' },
    { id: '4', name: 'Amouranth', bio: 'Content creator and streamer' },
    { id: '5', name: 'TimTheTatman', bio: 'Variety gaming streamer' }
  ];
  
  const [streamers, setStreamers] = useState(mockStreamers);
  const [newName, setNewName] = useState('');
  const [newBio, setNewBio] = useState('');
  
  // Mock UI functions - no database operations
  const handleAddStreamer = (e) => {
    e.preventDefault();
    if (!newName) return;
    
    const newStreamer = {
      id: Date.now().toString(),
      name: newName,
      bio: newBio || 'No bio provided'
    };
    
    setStreamers([...streamers, newStreamer]);
    setNewName('');
    setNewBio('');
  };
  
  const handleRemoveStreamer = (id) => {
    setStreamers(streamers.filter(streamer => streamer.id !== id));
  };
  
  // Render different mock tabs
  const renderStreamersTab = () => (
    <>
      <div className={styles.section}>
        <h2>Add New Streamer</h2>
        <form onSubmit={handleAddStreamer} className={styles.addStreamerForm}>
          <div className={styles.formGroup}>
            <label htmlFor="streamerName">Streamer Name:</label>
            <input
              type="text"
              id="streamerName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter streamer name"
              className={styles.input}
              required
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="streamerBio">Bio:</label>
            <textarea
              id="streamerBio"
              value={newBio}
              onChange={(e) => setNewBio(e.target.value)}
              placeholder="Enter streamer bio"
              className={styles.textarea}
              rows={3}
            />
          </div>
          
          <button type="submit" className={styles.button}>
            Add Streamer
          </button>
        </form>
      </div>
      
      <div className={styles.section}>
        <h2>Manage Streamers</h2>
        <div className={styles.streamerList}>
          {streamers.map((streamer) => (
            <div key={streamer.id} className={styles.streamerItem}>
              <div className={styles.streamerInfo}>
                <div className={styles.streamerHeader}>
                  <strong>{streamer.name}</strong>
                </div>
                <p>{streamer.bio}</p>
              </div>
              <div className={styles.streamerActions}>
                <button 
                  className={styles.viewButton}
                  onClick={() => window.open(`https://twitch.tv/${streamer.name}`, '_blank')}
                >
                  View on Twitch
                </button>
                <button 
                  className={styles.removeButton}
                  onClick={() => handleRemoveStreamer(streamer.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
  
  const renderUsersTab = () => (
    <div className={styles.section}>
      <h2>User Management</h2>
      <p>This is a static mock of the user management panel. No database operations are performed.</p>
      <div className={styles.mockUsers}>
        <div className={styles.mockUser}>
          <div><strong>Email:</strong> wallststonks@gmail.com</div>
          <div><strong>Role:</strong> Admin</div>
          <div><strong>Joined:</strong> March 1, 2023</div>
        </div>
        <div className={styles.mockUser}>
          <div><strong>Email:</strong> user1@example.com</div>
          <div><strong>Role:</strong> User</div>
          <div><strong>Joined:</strong> April 15, 2023</div>
        </div>
        <div className={styles.mockUser}>
          <div><strong>Email:</strong> user2@example.com</div>
          <div><strong>Role:</strong> User</div>
          <div><strong>Joined:</strong> May 20, 2023</div>
        </div>
      </div>
    </div>
  );
  
  const renderAnalyticsTab = () => (
    <div className={styles.section}>
      <h2>Analytics & Insights</h2>
      <p>This is a static mock of the analytics dashboard. No database operations are performed.</p>
      <div className={styles.mockStats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>1,243</div>
          <div className={styles.statLabel}>Total Users</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>56</div>
          <div className={styles.statLabel}>Active Streamers</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>12,568</div>
          <div className={styles.statLabel}>Messages Sent</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>4.2K</div>
          <div className={styles.statLabel}>Daily Active Users</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.adminDashboard}>
      <h1 className={styles.title}>Admin Dashboard</h1>
      
      <div className={styles.notice}>
        <p><strong>Note:</strong> This is a static dashboard for demonstration purposes. No database operations are performed.</p>
      </div>
      
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
      
      {activeTab === 'streamers' && renderStreamersTab()}
      {activeTab === 'users' && renderUsersTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}
    </div>
  );
};

export default AdminDashboard; 