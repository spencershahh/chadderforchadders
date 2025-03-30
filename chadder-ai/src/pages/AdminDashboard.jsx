import { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast, { Toaster } from 'react-hot-toast';
import styles from './AdminDashboard.module.css';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('debug');

  // Basic debug section to help troubleshoot database issues
  const runDatabaseTest = async () => {
    try {
      toast.loading('Testing database connection...');
      
      // Test streamers table
      const { data: streamers, error: streamersError } = await supabase
        .from('streamers')
        .select('*')
        .limit(5);
        
      // Test admins table
      const { data: admins, error: adminsError } = await supabase
        .from('admins')
        .select('*')
        .limit(5);
        
      // Test auth.users 
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .limit(5);
        
      toast.dismiss();
      
      if (streamersError) {
        toast.error(`Streamers table error: ${streamersError.message}`);
      } else {
        toast.success(`Successfully queried streamers table. Found ${streamers?.length || 0} records.`);
      }
      
      if (adminsError) {
        toast.error(`Admins table error: ${adminsError.message}`);
      } else {
        toast.success(`Successfully queried admins table. Found ${admins?.length || 0} records.`);
      }
      
      if (usersError) {
        toast.error(`Users table error: ${usersError.message}`);
      } else {
        toast.success(`Successfully queried users table. Found ${users?.length || 0} records.`);
      }
      
    } catch (error) {
      toast.dismiss();
      toast.error(`Test failed: ${error.message}`);
    }
  };

  const addTestStreamer = async () => {
    try {
      toast.loading('Adding test streamer...');
      
      const testStreamer = {
        name: 'teststreamer_' + Math.floor(Math.random() * 1000),
        bio: 'This is a test streamer added from admin panel'
      };
      
      const { data, error } = await supabase
        .from('streamers')
        .insert([testStreamer])
        .select();
        
      toast.dismiss();
      
      if (error) {
        toast.error(`Error adding test streamer: ${error.message}`);
      } else {
        toast.success('Test streamer added successfully!');
      }
    } catch (error) {
      toast.dismiss();
      toast.error(`Failed to add test streamer: ${error.message}`);
    }
  };

  const addCurrentUserAsAdmin = async () => {
    try {
      toast.loading('Adding current user as admin...');
      
      // Get current user
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData?.session?.user) {
        toast.dismiss();
        toast.error('No authenticated user found');
        return;
      }
      
      const userId = sessionData.session.user.id;
      
      // Check if already admin
      const { data: existingAdmin, error: checkError } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (existingAdmin) {
        toast.dismiss();
        toast.success('User is already an admin');
        return;
      }
      
      // Add as admin
      const { error: insertError } = await supabase
        .from('admins')
        .insert([{ user_id: userId }]);
        
      toast.dismiss();
      
      if (insertError) {
        toast.error(`Error adding as admin: ${insertError.message}`);
      } else {
        toast.success('Successfully added current user as admin');
      }
    } catch (error) {
      toast.dismiss();
      toast.error(`Operation failed: ${error.message}`);
    }
  };

  const renderDebugPanel = () => (
    <div className={styles.section}>
      <h2>Database Debugging Tools</h2>
      <div className={styles.debugActions}>
        <button 
          className={styles.button}
          onClick={runDatabaseTest}
        >
          Test Database Connections
        </button>
        
        <button 
          className={styles.button}
          onClick={addTestStreamer}
        >
          Add Test Streamer
        </button>
        
        <button 
          className={styles.button}
          onClick={addCurrentUserAsAdmin}
        >
          Add Current User as Admin
        </button>
      </div>
      
      <div className={styles.debugHelp}>
        <h3>Troubleshooting Info</h3>
        <ul>
          <li>If database tests fail, check your permissions in Supabase</li>
          <li>Run the SQL fix scripts in the Supabase SQL Editor</li>
          <li>Make sure Row Level Security (RLS) is disabled for development</li>
          <li>Verify the tables exist with the correct schema</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className={styles.adminDashboard}>
      <Toaster position="top-right" />
      <h1 className={styles.title}>Admin Dashboard</h1>
      
      <div className={styles.tabBar}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'debug' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('debug')}
        >
          Debug Panel
        </button>
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
      </div>
      
      {activeTab === 'debug' && renderDebugPanel()}
      {activeTab === 'streamers' && <div className={styles.section}><h2>Streamer Management</h2><p>Simplified view - use Debug Panel first</p></div>}
      {activeTab === 'users' && <div className={styles.section}><h2>User Management</h2><p>Simplified view - use Debug Panel first</p></div>}
    </div>
  );
};

export default AdminDashboard; 