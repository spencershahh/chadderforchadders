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
  
  // Analytics state
  const [analyticsData, setAnalyticsData] = useState({
    visitors: { daily: 0, weekly: 0, monthly: 0 },
    pageViews: { daily: 0, weekly: 0, monthly: 0 },
    topPages: [],
    conversionRate: 0,
    averageSessionTime: '0:00',
    bounceRate: 0
  });
  const [timeRange, setTimeRange] = useState('weekly');

  // Attempt to load streamers if in database mode
  useEffect(() => {
    if (mode === 'database') {
      fetchStreamers();
      fetchAnalytics(timeRange);
    }
  }, [mode, timeRange]);

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

  // Fetch analytics data based on time range
  const fetchAnalytics = async (range) => {
    setIsLoading(true);
    try {
      // Fetch visitor data
      const { data: visitorData, error: visitorError } = await supabase
        .from('analytics_visitors')
        .select('*')
        .order('date', { ascending: false })
        .limit(range === 'daily' ? 1 : range === 'weekly' ? 7 : 30);
      
      if (visitorError) {
        console.error('Error fetching visitor analytics:', visitorError);
        setError(`Failed to fetch analytics: ${visitorError.message}`);
        return;
      }
      
      // Fetch page views
      const { data: pageViewData, error: pageViewError } = await supabase
        .from('analytics_page_views')
        .select('*')
        .order('date', { ascending: false })
        .limit(range === 'daily' ? 1 : range === 'weekly' ? 7 : 30);
      
      if (pageViewError) {
        console.error('Error fetching page view analytics:', pageViewError);
        setError(`Failed to fetch analytics: ${pageViewError.message}`);
        return;
      }
      
      // Fetch top pages
      const { data: topPagesData, error: topPagesError } = await supabase
        .from('analytics_top_pages')
        .select('*')
        .order('views', { ascending: false })
        .limit(5);
      
      if (topPagesError) {
        console.error('Error fetching top pages:', topPagesError);
        setError(`Failed to fetch analytics: ${topPagesError.message}`);
        return;
      }
      
      // Process the analytics data
      const processedData = {
        visitors: {
          daily: calculateVisitors(visitorData, 'daily'),
          weekly: calculateVisitors(visitorData, 'weekly'),
          monthly: calculateVisitors(visitorData, 'monthly')
        },
        pageViews: {
          daily: calculatePageViews(pageViewData, 'daily'),
          weekly: calculatePageViews(pageViewData, 'weekly'),
          monthly: calculatePageViews(pageViewData, 'monthly')
        },
        topPages: topPagesData || [],
        conversionRate: calculateConversionRate(visitorData, pageViewData),
        averageSessionTime: calculateAverageSessionTime(visitorData),
        bounceRate: calculateBounceRate(visitorData)
      };
      
      setAnalyticsData(processedData);
    } catch (err) {
      console.error('Exception fetching analytics:', err);
      setError(`Something went wrong: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions for analytics calculations
  const calculateVisitors = (data, range) => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + (item.unique_visitors || 0), 0);
    return range === 'daily' ? sum : sum;
  };

  const calculatePageViews = (data, range) => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + (item.views || 0), 0);
    return range === 'daily' ? sum : sum;
  };

  const calculateConversionRate = (visitors, pageViews) => {
    if (!visitors || visitors.length === 0 || !pageViews || pageViews.length === 0) return 0;
    const totalVisitors = visitors.reduce((acc, item) => acc + (item.unique_visitors || 0), 0);
    const totalConversions = visitors.reduce((acc, item) => acc + (item.conversions || 0), 0);
    return totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(2) : 0;
  };

  const calculateAverageSessionTime = (data) => {
    if (!data || data.length === 0) return '0:00';
    const totalSessions = data.reduce((acc, item) => acc + (item.sessions || 0), 0);
    const totalTimeSeconds = data.reduce((acc, item) => acc + (item.session_time || 0), 0);
    
    if (totalSessions === 0) return '0:00';
    
    const avgSeconds = Math.floor(totalTimeSeconds / totalSessions);
    const minutes = Math.floor(avgSeconds / 60);
    const seconds = avgSeconds % 60;
    
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const calculateBounceRate = (data) => {
    if (!data || data.length === 0) return 0;
    const totalSessions = data.reduce((acc, item) => acc + (item.sessions || 0), 0);
    const totalBounces = data.reduce((acc, item) => acc + (item.bounces || 0), 0);
    return totalSessions > 0 ? ((totalBounces / totalSessions) * 100).toFixed(2) : 0;
  };

  // Handle time range change
  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
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

  // Render analytics section for emergency mode
  const renderEmergencyAnalytics = () => (
    <div className={styles.section}>
      <h2>Analytics Dashboard</h2>
      <div className={styles.analyticsWrapper}>
        <div className={styles.analyticsHeader}>
          <h3>Business Overview</h3>
        </div>
        
        <div className={styles.analyticsSummary}>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Total Visitors</div>
            <div className={styles.metricValue}>1,245</div>
            <div className={`${styles.metricChange} ${styles.positive}`}>+12.5%</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Page Views</div>
            <div className={styles.metricValue}>5,871</div>
            <div className={`${styles.metricChange} ${styles.positive}`}>+8.2%</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Avg. Session</div>
            <div className={styles.metricValue}>2:45</div>
            <div className={`${styles.metricChange} ${styles.negative}`}>-1.3%</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Bounce Rate</div>
            <div className={styles.metricValue}>42.6%</div>
            <div className={`${styles.metricChange} ${styles.positive}`}>-3.8%</div>
          </div>
        </div>
        
        <div className={styles.analyticsGrid}>
          <div className={styles.analyticsPanel}>
            <h4>Most Visited Pages</h4>
            <div className={styles.topPages}>
              <div className={styles.pageItem}>
                <div className={styles.pagePath}>/discover</div>
                <div className={styles.pageViews}>2,341</div>
              </div>
              <div className={styles.pageItem}>
                <div className={styles.pagePath}>/leaderboard</div>
                <div className={styles.pageViews}>1,852</div>
              </div>
              <div className={styles.pageItem}>
                <div className={styles.pagePath}>/dig-deeper</div>
                <div className={styles.pageViews}>987</div>
              </div>
              <div className={styles.pageItem}>
                <div className={styles.pagePath}>/credits</div>
                <div className={styles.pageViews}>432</div>
              </div>
              <div className={styles.pageItem}>
                <div className={styles.pagePath}>/admin</div>
                <div className={styles.pageViews}>259</div>
              </div>
            </div>
          </div>
          
          <div className={styles.analyticsPanel}>
            <h4>Visitor Trends</h4>
            <div className={styles.mockChart}>
              <div className={styles.chartLabel}>Weekly visitor data visualization</div>
              <div className={styles.chartPlaceholder}>
                <div className={styles.barGraph}>
                  <div className={styles.bar} style={{ height: '60%' }}></div>
                  <div className={styles.bar} style={{ height: '45%' }}></div>
                  <div className={styles.bar} style={{ height: '75%' }}></div>
                  <div className={styles.bar} style={{ height: '90%' }}></div>
                  <div className={styles.bar} style={{ height: '65%' }}></div>
                  <div className={styles.bar} style={{ height: '80%' }}></div>
                  <div className={styles.bar} style={{ height: '70%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render analytics section for database mode
  const renderDatabaseAnalytics = () => (
    <div className={styles.section}>
      <h2>Analytics Dashboard</h2>
      <div className={styles.analyticsWrapper}>
        <div className={styles.analyticsHeader}>
          <h3>Business Overview</h3>
          <div className={styles.timeRangeSelector}>
            <button 
              className={`${styles.timeButton} ${timeRange === 'daily' ? styles.active : ''}`}
              onClick={() => handleTimeRangeChange('daily')}
            >
              Today
            </button>
            <button 
              className={`${styles.timeButton} ${timeRange === 'weekly' ? styles.active : ''}`}
              onClick={() => handleTimeRangeChange('weekly')}
            >
              This Week
            </button>
            <button 
              className={`${styles.timeButton} ${timeRange === 'monthly' ? styles.active : ''}`}
              onClick={() => handleTimeRangeChange('monthly')}
            >
              This Month
            </button>
          </div>
        </div>
        
        <div className={styles.analyticsSummary}>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Total Visitors</div>
            <div className={styles.metricValue}>{analyticsData.visitors[timeRange].toLocaleString()}</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Page Views</div>
            <div className={styles.metricValue}>{analyticsData.pageViews[timeRange].toLocaleString()}</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Avg. Session</div>
            <div className={styles.metricValue}>{analyticsData.averageSessionTime}</div>
          </div>
          <div className={styles.analyticsCard}>
            <div className={styles.metricTitle}>Bounce Rate</div>
            <div className={styles.metricValue}>{analyticsData.bounceRate}%</div>
          </div>
        </div>
        
        <div className={styles.analyticsGrid}>
          <div className={styles.analyticsPanel}>
            <h4>Most Visited Pages</h4>
            {analyticsData.topPages.length > 0 ? (
              <div className={styles.topPages}>
                {analyticsData.topPages.map((page, index) => (
                  <div key={index} className={styles.pageItem}>
                    <div className={styles.pagePath}>{page.path}</div>
                    <div className={styles.pageViews}>{page.views.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No page view data available</div>
            )}
          </div>
          
          <div className={styles.analyticsPanel}>
            <h4>Conversion Rate</h4>
            <div className={styles.conversionWrapper}>
              <div className={styles.conversionRate}>
                <div className={styles.conversionValue}>{analyticsData.conversionRate}%</div>
                <div className={styles.conversionLabel}>of visitors take action</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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
      
      {renderEmergencyAnalytics()}
      
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
      
      {renderDatabaseAnalytics()}
      
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