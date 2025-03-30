import React from 'react';
import styles from './AdminDashboard.module.css';

// Emergency admin page with absolutely no database operations
const AdminDashboard = () => {
  return (
    <div className={styles.adminDashboard}>
      <h1 className={styles.title}>Admin Dashboard</h1>
      
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
    </div>
  );
};

export default AdminDashboard; 