import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './AdminDashboard.module.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [streamers, setStreamers] = useState([]);
  const [newStreamer, setNewStreamer] = useState({ username: '', bio: '' });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    loadStreamers();
  }, []);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/');
      return;
    }

    // Fetch user's role from your users table
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!data?.is_admin) {
      navigate('/');
      return;
    }

    setIsAdmin(true);
  };

  const loadStreamers = async () => {
    try {
      const response = await fetch('/api/streamers');
      const data = await response.json();
      setStreamers(data);
    } catch (error) {
      console.error('Error loading streamers:', error);
    }
  };

  const handleAddStreamer = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/streamers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStreamer),
      });
      
      if (response.ok) {
        setNewStreamer({ username: '', bio: '' });
        loadStreamers();
      }
    } catch (error) {
      console.error('Error adding streamer:', error);
    }
  };

  const handleDeleteStreamer = async (username) => {
    try {
      const response = await fetch(`/api/streamers/${username}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        loadStreamers();
      }
    } catch (error) {
      console.error('Error deleting streamer:', error);
    }
  };

  if (!isAdmin) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <h1>Admin Dashboard</h1>
      
      <section className={styles.section}>
        <h2>Manage Streamers</h2>
        
        <form onSubmit={handleAddStreamer} className={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={newStreamer.username}
            onChange={(e) => setNewStreamer(prev => ({ ...prev, username: e.target.value }))}
            required
          />
          <textarea
            placeholder="Bio"
            value={newStreamer.bio}
            onChange={(e) => setNewStreamer(prev => ({ ...prev, bio: e.target.value }))}
            required
          />
          <button type="submit">Add Streamer</button>
        </form>

        <div className={styles.streamerList}>
          {streamers.map((streamer) => (
            <div key={streamer.username} className={styles.streamerItem}>
              <div>
                <h3>{streamer.username}</h3>
                <p>{streamer.bio}</p>
              </div>
              <button
                onClick={() => handleDeleteStreamer(streamer.username)}
                className={styles.deleteButton}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard; 