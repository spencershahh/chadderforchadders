import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from './AnalyticsDashboard.module.css';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, Cell, AreaChart, Area
} from '../utils/rechartsImport';
import toast from 'react-hot-toast';

const AnalyticsDashboard = () => {
  // State for all analytics data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overviewMetrics, setOverviewMetrics] = useState({
    totalUsers: 0,
    activeSubscribers: 0,
    totalCredits: 0,
    newUsersThisMonth: 0,
    growthRate: 0
  });
  const [businessMetrics, setBusinessMetrics] = useState({
    monthlyRevenue: 0,
    monthlyGrowth: 0,
    arpu: 0,
    userRetention: 0,
    avgSessionTime: 0,
    conversionRate: 0
  });
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [creditDistributionData, setCreditDistributionData] = useState([]);
  const [streamerPopularityData, setStreamerPopularityData] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [timeframe, setTimeframe] = useState('month'); // 'week', 'month', 'year'

  // Colors for charts
  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57'];
  const SUBSCRIPTION_COLORS = {
    'common': '#4CAF50',
    'rare': '#3F51B5',
    'epic': '#9C27B0',
    'free': '#757575'
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [timeframe]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to load each analytic component separately to prevent one failure from breaking all
      try {
        await fetchOverviewMetrics();
      } catch (err) {
        console.error('Error fetching overview metrics:', err);
      }
      
      try {
        await fetchBusinessHealthMetrics();
      } catch (err) {
        console.error('Error fetching business health metrics:', err);
      }
      
      try {
        await fetchUserGrowthData();
      } catch (err) {
        console.error('Error fetching user growth data:', err);
      }
      
      try {
        await fetchCreditDistribution();
      } catch (err) {
        console.error('Error fetching credit distribution:', err);
      }
      
      try {
        await fetchStreamerPopularity();
      } catch (err) {
        console.error('Error fetching streamer popularity data:', err);
      }
      
      try {
        await fetchRevenueData();
      } catch (err) {
        console.error('Error fetching revenue data:', err);
      }
      
    } catch (error) {
      console.error('Error loading analytics data:', error);
      setError(error.message);
      toast.error(`Failed to load analytics: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch overview metrics
  const fetchOverviewMetrics = async () => {
    try {
      // Get total users count
      const { count: totalUsers, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact' });
      
      if (usersError) throw usersError;
      
      // Get active subscribers count
      const { count: activeSubscribers, error: subsError } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('subscription_status', 'active');
      
      if (subsError) throw subsError;
      
      // Get total credits in system
      const { data: creditsData, error: creditsError } = await supabase
        .from('users')
        .select('credits');
      
      if (creditsError) throw creditsError;
      
      const totalCredits = creditsData.reduce((sum, user) => sum + (user.credits || 0), 0);
      
      // Get new users this month
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);
      
      const { count: newUsersThisMonth, error: newUsersError } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .gte('created_at', firstDayOfMonth.toISOString());
      
      if (newUsersError) throw newUsersError;
      
      // Calculate growth rate (comparing to previous month)
      const firstDayOfPrevMonth = new Date(firstDayOfMonth);
      firstDayOfPrevMonth.setMonth(firstDayOfPrevMonth.getMonth() - 1);
      
      const { count: usersLastMonth, error: lastMonthError } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .gte('created_at', firstDayOfPrevMonth.toISOString())
        .lt('created_at', firstDayOfMonth.toISOString());
      
      if (lastMonthError) throw lastMonthError;
      
      // Calculate growth rate as percentage
      const growthRate = usersLastMonth > 0 
        ? ((newUsersThisMonth - usersLastMonth) / usersLastMonth) * 100 
        : (newUsersThisMonth > 0 ? 100 : 0);
      
      setOverviewMetrics({
        totalUsers: totalUsers || 0,
        activeSubscribers: activeSubscribers || 0,
        totalCredits,
        newUsersThisMonth: newUsersThisMonth || 0,
        growthRate
      });
      
    } catch (error) {
      console.error('Error fetching overview metrics:', error);
      throw error;
    }
  };

  // Fetch business health metrics
  const fetchBusinessHealthMetrics = async () => {
    try {
      // Monthly Revenue - calculate based on subscriptions
      const { data: subscriptionData, error: subError } = await supabase
        .from('users')
        .select('subscription_tier, subscription_status');
      
      if (subError) throw subError;
      
      // Subscription prices - ideally stored in database or configuration
      const subscriptionPrices = {
        'free': 0,
        'common': 4.99,
        'rare': 9.99,
        'epic': 19.99
      };
      
      // Calculate actual monthly revenue from subscriptions
      let monthlyRevenue = 0;
      subscriptionData.forEach(user => {
        if (user.subscription_status === 'active' && user.subscription_tier !== 'free') {
          monthlyRevenue += subscriptionPrices[user.subscription_tier] || 0;
        }
      });
      
      // Try to get previous month's data from analytics table
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthName = lastMonth.toLocaleString('en-US', { month: 'short' });
      
      const { data: previousMonthData, error: prevMonthError } = await supabase
        .from('analytics')
        .select('revenue')
        .eq('month', lastMonthName)
        .maybeSingle();
      
      // Calculate growth based on previous month data or use 0
      let previousMonthRevenue = 0;
      if (!prevMonthError && previousMonthData && previousMonthData.revenue) {
        previousMonthRevenue = previousMonthData.revenue;
      }
      
      const monthlyGrowth = previousMonthRevenue > 0 
        ? ((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 
        : 0;
      
      // Calculate ARPU (Average Revenue Per User)
      const { count: activeUsersCount, error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('subscription_status', 'active');
        
      if (countError) throw countError;
      
      const activeUsers = activeUsersCount || 1; // Avoid division by zero
      const arpu = monthlyRevenue / activeUsers;
      
      // For retention, session time, and conversion rate, we need actual usage data
      // If that's not available, we'll set these to 0 for now
      
      // Check if we have analytics metrics in a table
      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('user_retention, avg_session_time, conversion_rate')
        .order('created_at', { ascending: false })
        .limit(1);
        
      // Use real metrics if available, otherwise zeros
      const metrics = (!metricsError && metricsData && metricsData.length > 0) 
        ? metricsData[0] 
        : { user_retention: 0, avg_session_time: 0, conversion_rate: 0 };
      
      setBusinessMetrics({
        monthlyRevenue,
        monthlyGrowth,
        arpu,
        userRetention: metrics.user_retention,
        avgSessionTime: metrics.avg_session_time,
        conversionRate: metrics.conversion_rate
      });
      
    } catch (error) {
      console.error('Error fetching business health metrics:', error);
      // Set zeros in case of error
      setBusinessMetrics({
        monthlyRevenue: 0,
        monthlyGrowth: 0,
        arpu: 0,
        userRetention: 0,
        avgSessionTime: 0,
        conversionRate: 0
      });
    }
  };

  // Fetch user growth data for the chart
  const fetchUserGrowthData = async () => {
    try {
      // Get all users with their creation dates
      const { data: usersData, error } = await supabase
        .from('users')
        .select('created_at')
        .order('created_at');
      
      if (error) throw error;
      
      // Generate time series data based on timeframe
      const timeSeriesData = generateTimeSeriesData(usersData, timeframe);
      setUserGrowthData(timeSeriesData);
      
    } catch (error) {
      console.error('Error fetching user growth data:', error);
      throw error;
    }
  };

  // Fetch credit distribution data
  const fetchCreditDistribution = async () => {
    try {
      // Get users group by subscription tier with sum of credits
      const { data, error } = await supabase
        .from('users')
        .select('subscription_tier, credits');
      
      if (error) throw error;
      
      // Aggregate data by subscription tier
      const aggregatedData = {};
      
      data.forEach(user => {
        const tier = user.subscription_tier || 'free';
        if (!aggregatedData[tier]) {
          aggregatedData[tier] = { name: tier, credits: 0, users: 0 };
        }
        aggregatedData[tier].credits += (user.credits || 0);
        aggregatedData[tier].users += 1;
      });
      
      // Format for charts
      const formattedData = Object.values(aggregatedData).map(item => ({
        name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
        credits: item.credits,
        users: item.users,
        value: item.credits, // for pie chart
        color: SUBSCRIPTION_COLORS[item.name] || '#757575'
      }));
      
      setCreditDistributionData(formattedData);
      
    } catch (error) {
      console.error('Error fetching credit distribution data:', error);
      throw error;
    }
  };

  // Fetch streamer popularity data
  const fetchStreamerPopularity = async () => {
    try {
      // Get streamers from our public JSON file
      const response = await fetch('/streamers.json');
      const streamers = await response.json();
      
      // For actual popularity data, we'd need to query the database
      // Fetch any votes or interactions related to streamers
      const { data: streamersData, error: streamersError } = await supabase
        .from('streamers')
        .select('username, votes, credits, viewers');
      
      if (streamersError) {
        console.log('No streamer data table found, using streamers from JSON only');
        
        const streamerStats = streamers.slice(0, 10).map((streamer) => ({
          name: streamer.username,
          votes: 0,
          credits: 0,
          viewers: 0,
        }));
        
        setStreamerPopularityData(streamerStats);
        return;
      }
      
      // Map the streamers with their data
      const streamerStats = streamers.slice(0, 10).map((streamer) => {
        const dbStreamer = streamersData.find(s => s.username === streamer.username) || {};
        
        return {
          name: streamer.username,
          votes: dbStreamer.votes || 0,
          credits: dbStreamer.credits || 0,
          viewers: dbStreamer.viewers || 0,
        };
      });
      
      // Sort by votes
      streamerStats.sort((a, b) => b.votes - a.votes);
      
      setStreamerPopularityData(streamerStats);
    } catch (error) {
      console.error('Error fetching streamer popularity data:', error);
      // Set empty data in case of error
      setStreamerPopularityData([]);
    }
  };

  // Fetch revenue data
  const fetchRevenueData = async () => {
    try {
      // Fetch revenue data from database if available
      const { data: revenueData, error: revenueError } = await supabase
        .from('analytics')
        .select('month, revenue, expenses, profit')
        .order('month');
      
      if (revenueError || !revenueData || revenueData.length === 0) {
        console.log('No revenue data found in database');
        // Set empty data for now
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = new Date().getMonth();
        
        // Generate empty data structure with zeroes
        const emptyRevenueStats = Array.from({ length: 12 }, (_, i) => {
          const monthIndex = (currentMonth - 11 + i) % 12;
          return {
            name: months[monthIndex],
            revenue: 0,
            expenses: 0,
            profit: 0
          };
        });
        
        setRevenueData(emptyRevenueStats);
        return;
      }
      
      // Format the data for display
      const formattedData = revenueData.map(item => ({
        name: item.month,
        revenue: item.revenue || 0,
        expenses: item.expenses || 0,
        profit: item.profit || 0
      }));
      
      setRevenueData(formattedData);
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      setRevenueData([]);
    }
  };

  // Helper function to generate time series data based on timeframe
  const generateTimeSeriesData = (usersData, timeframe) => {
    if (!usersData || usersData.length === 0) return [];
    
    const dateFormat = {
      week: { unit: 'day', format: 'dd' },
      month: { unit: 'day', format: 'dd' },
      year: { unit: 'month', format: 'MMM' }
    };
    
    // Determine start date based on timeframe
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
    }
    
    // Create time intervals
    const intervals = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= now) {
      let nextDate;
      
      switch (timeframe) {
        case 'week':
        case 'month':
          nextDate = new Date(currentDate);
          nextDate.setDate(currentDate.getDate() + 1);
          break;
        case 'year':
          nextDate = new Date(currentDate);
          nextDate.setMonth(currentDate.getMonth() + 1);
          break;
      }
      
      intervals.push({
        start: new Date(currentDate),
        end: new Date(nextDate),
        name: formatDate(currentDate, timeframe)
      });
      
      currentDate = nextDate;
    }
    
    // Count users for each interval
    return intervals.map(interval => {
      // Count cumulative users at the end of this interval
      const usersCount = usersData.filter(user => 
        new Date(user.created_at) <= interval.end
      ).length;
      
      return {
        name: interval.name,
        users: usersCount
      };
    });
  };

  // Helper function to format dates
  const formatDate = (date, timeframe) => {
    switch (timeframe) {
      case 'week':
        return date.toLocaleDateString('en-US', { weekday: 'short' });
      case 'month':
        return date.getDate().toString();
      case 'year':
        return date.toLocaleDateString('en-US', { month: 'short' });
      default:
        return date.toLocaleDateString();
    }
  };

  // Format large numbers with k, M suffixes
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>{`${label}`}</p>
          {payload.map((entry, index) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {`${entry.name}: ${formatNumber(entry.value)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Component to display when there's no data
  const EmptyDataMessage = ({ type }) => {
    return (
      <div className={styles.emptyDataContainer}>
        <div className={styles.emptyDataMessage}>
          <h3>No {type} Data Available</h3>
          <p>As chadder.ai grows, real data will appear here.</p>
        </div>
      </div>
    );
  };

  // Helper to check if data is empty
  const isDataEmpty = (data) => {
    if (!data || data.length === 0) return true;
    
    // For arrays, check if all values are zero
    if (Array.isArray(data)) {
      return data.every(item => {
        // Check if all numeric properties have zero value
        const values = Object.values(item).filter(v => typeof v === 'number');
        return values.length > 0 && values.every(v => v === 0);
      });
    }
    
    return false;
  };

  if (loading) {
    return <div className={styles.loading}>Loading analytics data...</div>;
  }

  if (error) {
    return (
      <div className={styles.error}>
        <h3>Error loading analytics</h3>
        <p>{error}</p>
        <button 
          onClick={loadAnalyticsData} 
          className={styles.retryButton}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.analyticsDashboard}>
      <div className={styles.header}>
        <h2>Analytics & Insights</h2>
        <div className={styles.timeframeControls}>
          <button 
            className={`${styles.timeframeButton} ${timeframe === 'week' ? styles.activeTimeframe : ''}`}
            onClick={() => setTimeframe('week')}
          >
            Last Week
          </button>
          <button 
            className={`${styles.timeframeButton} ${timeframe === 'month' ? styles.activeTimeframe : ''}`}
            onClick={() => setTimeframe('month')}
          >
            Last Month
          </button>
          <button 
            className={`${styles.timeframeButton} ${timeframe === 'year' ? styles.activeTimeframe : ''}`}
            onClick={() => setTimeframe('year')}
          >
            Last Year
          </button>
          <button 
            className={styles.refreshButton}
            onClick={loadAnalyticsData}
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Business Health Dashboard */}
      <div className={styles.businessHealthDashboard}>
        <h3>Business Health Overview</h3>
        <div className={styles.businessMetricsGrid}>
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>Monthly Revenue</div>
            <div className={styles.metricValue}>{formatCurrency(businessMetrics.monthlyRevenue)}</div>
            <div className={`${styles.metricChange} ${businessMetrics.monthlyGrowth >= 0 ? styles.positive : styles.negative}`}>
              {businessMetrics.monthlyGrowth >= 0 ? '↑' : '↓'} {Math.abs(businessMetrics.monthlyGrowth).toFixed(1)}%
            </div>
          </div>
          
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>Avg. Revenue Per User</div>
            <div className={styles.metricValue}>{formatCurrency(businessMetrics.arpu)}</div>
            <div className={styles.metricSubtext}>Monthly</div>
          </div>
          
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>User Retention</div>
            <div className={styles.metricValue}>{businessMetrics.userRetention.toFixed(1)}%</div>
            <div className={styles.metricSubtext}>30-day retention</div>
          </div>
          
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>Avg. Session Time</div>
            <div className={styles.metricValue}>{businessMetrics.avgSessionTime.toFixed(1)} min</div>
            <div className={styles.metricSubtext}>Time on site</div>
          </div>
          
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>Conversion Rate</div>
            <div className={styles.metricValue}>{businessMetrics.conversionRate.toFixed(1)}%</div>
            <div className={styles.metricSubtext}>Free to paid</div>
          </div>
          
          <div className={styles.businessMetricCard}>
            <div className={styles.metricLabel}>Active Subscribers</div>
            <div className={styles.metricValue}>{formatNumber(overviewMetrics.activeSubscribers)}</div>
            <div className={styles.metricSubtext}>
              {((overviewMetrics.activeSubscribers / overviewMetrics.totalUsers) * 100).toFixed(1)}% of users
            </div>
          </div>
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className={styles.metricsCards}>
        <div className={styles.metricCard}>
          <div className={styles.metricIcon} aria-hidden="true">👥</div>
          <div className={styles.metricContent}>
            <h3>Total Users</h3>
            <div className={styles.metricValue}>{formatNumber(overviewMetrics.totalUsers)}</div>
            <div className={styles.metricSubtext}>
              {overviewMetrics.newUsersThisMonth} new this month
            </div>
          </div>
        </div>
        
        <div className={styles.metricCard}>
          <div className={styles.metricIcon} aria-hidden="true">⭐</div>
          <div className={styles.metricContent}>
            <h3>Active Subscribers</h3>
            <div className={styles.metricValue}>{formatNumber(overviewMetrics.activeSubscribers)}</div>
            <div className={styles.metricSubtext}>
              {((overviewMetrics.activeSubscribers / overviewMetrics.totalUsers) * 100).toFixed(1)}% of users
            </div>
          </div>
        </div>
        
        <div className={styles.metricCard}>
          <div className={styles.metricIcon} aria-hidden="true">💎</div>
          <div className={styles.metricContent}>
            <h3>Total Credits</h3>
            <div className={styles.metricValue}>{formatNumber(overviewMetrics.totalCredits)}</div>
            <div className={styles.metricSubtext}>
              Avg {(overviewMetrics.totalCredits / overviewMetrics.totalUsers).toFixed(1)} per user
            </div>
          </div>
        </div>
        
        <div className={styles.metricCard}>
          <div className={styles.metricIcon} aria-hidden="true">📈</div>
          <div className={styles.metricContent}>
            <h3>Growth Rate</h3>
            <div className={`${styles.metricValue} ${overviewMetrics.growthRate >= 0 ? styles.positive : styles.negative}`}>
              {overviewMetrics.growthRate.toFixed(1)}%
            </div>
            <div className={styles.metricSubtext}>
              {overviewMetrics.growthRate >= 0 ? 'Increase' : 'Decrease'} from last month
            </div>
          </div>
        </div>
      </div>

      {/* Chart Sections */}
      <div className={styles.chartsContainer}>
        {/* User Growth Chart */}
        <div className={styles.chartCard}>
          <h3>User Growth Over Time</h3>
          <div className={styles.chartContainer}>
            {isDataEmpty(userGrowthData) ? (
              <EmptyDataMessage type="User Growth" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={userGrowthData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="name" stroke="#ccc" />
                  <YAxis stroke="#ccc" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="users" 
                    name="Total Users" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.5} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Credit Distribution Chart */}
        <div className={styles.chartCard}>
          <h3>Credit Distribution by Subscription Tier</h3>
          <div className={styles.chartContainer}>
            {isDataEmpty(creditDistributionData) ? (
              <EmptyDataMessage type="Credit Distribution" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <div className={styles.splitChart}>
                  <div className={styles.pieChartContainer}>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={creditDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="credits"
                        >
                          {creditDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className={styles.barChartContainer}>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={creditDistributionData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" horizontal={false} />
                        <XAxis type="number" stroke="#ccc" />
                        <YAxis dataKey="name" type="category" stroke="#ccc" width={100} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="credits" name="Credits" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Streamer Popularity Chart */}
        <div className={styles.chartCard}>
          <h3>Top Streamers by Popularity</h3>
          <div className={styles.chartContainer}>
            {isDataEmpty(streamerPopularityData) ? (
              <EmptyDataMessage type="Streamer Popularity" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={streamerPopularityData}
                  layout="horizontal"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="name" stroke="#ccc" />
                  <YAxis stroke="#ccc" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="votes" name="Votes" fill="#00C49F" />
                  <Bar dataKey="credits" name="Credits" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Revenue Analysis Chart */}
        <div className={styles.chartCard}>
          <h3>Revenue Analysis</h3>
          <div className={styles.chartContainer}>
            {isDataEmpty(revenueData) ? (
              <EmptyDataMessage type="Revenue" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={revenueData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="name" stroke="#ccc" />
                  <YAxis stroke="#ccc" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    name="Revenue" 
                    stroke="#00C49F" 
                    strokeWidth={2}
                    activeDot={{ r: 8 }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="expenses" 
                    name="Expenses" 
                    stroke="#FF8042" 
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    name="Profit" 
                    stroke="#0088FE" 
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className={styles.notes}>
        <h3>Notes on Analytics Data</h3>
        <ul>
          <li>User growth shows cumulative registered users over time</li>
          <li>Credit distribution shows how credits are allocated across different subscription tiers</li>
          <li>Streamer popularity shows the streamers with the most votes and credits received</li>
          <li>Revenue analysis shows financial performance over the last 12 months</li>
        </ul>
      </div>
    </div>
  );
};

export default AnalyticsDashboard; 