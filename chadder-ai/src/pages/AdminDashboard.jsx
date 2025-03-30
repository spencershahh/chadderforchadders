import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from './AdminDashboard.module.css';

const AdminDashboard = () => {
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [rawData, setRawData] = useState({
    user: null,
    admins: null,
    streamers: null
  });
  const [debugMessages, setDebugMessages] = useState([]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Add debug message
        addDebugMessage("Fetching user data...");
        
        // Get current session
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          addDebugMessage(`Session error: ${error.message}`);
          return;
        }
        
        if (!data.session) {
          addDebugMessage("No active session found");
          return;
        }
        
        const user = data.session.user;
        setUserId(user.id);
        setUserEmail(user.email);
        setRawData(prev => ({ ...prev, user }));
        
        addDebugMessage(`User authenticated: ${user.email}`);
        
        // Check if admin
        checkIfAdmin(user.id);
        
        // Fetch basic data
        fetchBasicData();
        
      } catch (err) {
        addDebugMessage(`Error: ${err.message}`);
      }
    };
    
    fetchUserData();
  }, []);
  
  const addDebugMessage = (message) => {
    setDebugMessages(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      message
    }]);
  };
  
  const checkIfAdmin = async (userId) => {
    try {
      addDebugMessage("Checking admin status...");
      
      // Direct SQL count query instead of a potentially problematic select
      const { count, error } = await supabase
        .from('admins')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      // Store the raw response
      setRawData(prev => ({ 
        ...prev, 
        admins: { count, error } 
      }));
      
      if (error) {
        addDebugMessage(`Admin check error: ${error.message}`);
        return;
      }
      
      // If count > 0, user is admin
      const userIsAdmin = count > 0;
      setIsAdmin(userIsAdmin);
      
      addDebugMessage(`Admin status: ${userIsAdmin ? 'Yes' : 'No'}`);
      
    } catch (err) {
      addDebugMessage(`Admin check failed: ${err.message}`);
    }
  };
  
  const fetchBasicData = async () => {
    try {
      addDebugMessage("Fetching basic data...");
      
      // Get streamers count
      const { count, error } = await supabase
        .from('streamers')
        .select('*', { count: 'exact', head: true });
      
      setRawData(prev => ({ 
        ...prev, 
        streamers: { count, error } 
      }));
      
      if (error) {
        addDebugMessage(`Streamers query error: ${error.message}`);
      } else {
        addDebugMessage(`Found ${count} streamers`);
      }
      
    } catch (err) {
      addDebugMessage(`Data fetch failed: ${err.message}`);
    }
  };
  
  const makeAdmin = async () => {
    if (!userId) return;
    
    try {
      addDebugMessage("Adding current user as admin...");
      
      const { data, error } = await supabase
        .from('admins')
        .insert([{ user_id: userId }]);
      
      if (error) {
        addDebugMessage(`Admin creation failed: ${error.message}`);
      } else {
        addDebugMessage("Successfully added as admin!");
        setIsAdmin(true);
      }
      
    } catch (err) {
      addDebugMessage(`Error: ${err.message}`);
    }
  };
  
  const addTestStreamer = async () => {
    try {
      addDebugMessage("Adding test streamer...");
      
      const { data, error } = await supabase
        .from('streamers')
        .insert([{ 
          name: `test_${Math.floor(Math.random() * 1000)}`,
          bio: 'Test streamer added from debug panel'
        }]);
      
      if (error) {
        addDebugMessage(`Streamer creation failed: ${error.message}`);
      } else {
        addDebugMessage("Test streamer added successfully!");
        // Refresh data
        fetchBasicData();
      }
      
    } catch (err) {
      addDebugMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className={styles.adminDashboard}>
      <h1 className={styles.title}>Admin Dashboard (Debug Mode)</h1>
      
      <div className={styles.section}>
        <h2>User & Session Info</h2>
        {userEmail ? (
          <div>
            <p>Email: <strong>{userEmail}</strong></p>
            <p>ID: <code>{userId}</code></p>
            <p>Admin Status: {isAdmin ? '✅ Yes' : '❌ No'}</p>
          </div>
        ) : (
          <p>Not logged in</p>
        )}
      </div>
      
      <div className={styles.section}>
        <h2>Actions</h2>
        <div className={styles.buttonGroup}>
          <button 
            className={styles.button}
            onClick={makeAdmin}
            disabled={isAdmin}
          >
            {isAdmin ? 'Already Admin' : 'Make Admin'}
          </button>
          
          <button 
            className={styles.button}
            onClick={addTestStreamer}
          >
            Add Test Streamer
          </button>
          
          <button 
            className={styles.button}
            onClick={fetchBasicData}
          >
            Refresh Data
          </button>
        </div>
      </div>
      
      <div className={styles.section}>
        <h2>Debug Log</h2>
        <div className={styles.debugLog}>
          {debugMessages.map((msg, idx) => (
            <div key={idx} className={styles.logEntry}>
              <span className={styles.logTime}>{msg.time}</span>
              <span className={styles.logMessage}>{msg.message}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className={styles.section}>
        <h2>Raw Data</h2>
        <div className={styles.rawData}>
          <pre>{JSON.stringify(rawData, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 