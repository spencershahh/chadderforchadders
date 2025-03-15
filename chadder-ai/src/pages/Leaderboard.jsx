import  { useEffect, useState, useMemo } from "react";
import { useTable, useSortBy } from "react-table";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { fetchStreamers, getFallbackStreamerData } from "../api/twitch";

const Leaderboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamerProfiles, setStreamerProfiles] = useState({});
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [weeklyWinners, setWeeklyWinners] = useState([]);
  const [totalDonations, setTotalDonations] = useState(0);
  const [supportersData, setSupportersData] = useState([]);
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const SUBSCRIPTION_PRICE = 5.00; // Weekly subscription price
  const STREAMER_PAYOUT_PERCENTAGE = 0.55; // Streamers get 55% of votes and subscriptions

  useEffect(() => {
    fetchLeaderboard();
    fetchStreamerProfiles();
    fetchWeeklyWinners();
    fetchTotalDonations();
    fetchSupportersLeaderboard();
    
    // Listen for prize pool and subscription changes
    const prizePoolSubscription = supabase
      .channel('prize-pool-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prize_pool'
        },
        (payload) => {
          console.log('Prize pool update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    const subscriptionSubscription = supabase
      .channel('subscriptions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_revenue'
        },
        (payload) => {
          console.log('Subscription update received:', payload);
          fetchTotalDonations();
        }
      )
      .subscribe();

    // Update countdown timer every second
    const timer = setInterval(() => {
      updateTimeUntilReset();
      // If it's the start of a new week, refresh donation calculations
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) {
        fetchTotalDonations();
      }
    }, 1000);

    // Cleanup subscriptions on component unmount
    return () => {
      clearInterval(timer);
      supabase.removeChannel(prizePoolSubscription);
      supabase.removeChannel(subscriptionSubscription);
    };
  }, []);

  const updateTimeUntilReset = () => {
    const now = new Date();
    const nextSunday = new Date();
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    const diff = nextSunday - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    setTimeUntilReset(`${days}d ${hours}h ${minutes}m ${seconds}s`);
  };

  const fetchStreamerProfiles = async () => {
    try {
      const streamers = await fetchStreamers();
      const profiles = streamers.reduce((acc, streamer) => {
        acc[streamer.user_login] = {
          profile_image_url: streamer.profile_image_url,
          display_name: streamer.user_name
        };
        return acc;
      }, {});
      setStreamerProfiles(profiles);
    } catch (error) {
      console.error("Error fetching streamer profiles:", error);
    }
  };

  const fetchWeeklyWinners = async () => {
    try {
      const { data, error } = await supabase
        .from('weekly_winners')
        .select('*')
        .order('week_ending', { ascending: false })
        .limit(4);
      
      if (error) throw error;
      setWeeklyWinners(data);
    } catch (error) {
      console.error('Error fetching weekly winners:', error);
    }
  };

  const fetchTotalDonations = async () => {
    try {
      console.log('Fetching total donations for leaderboard...');
      const { data, error } = await supabase
        .rpc('calculate_weekly_donation_bomb');

      if (error) {
        console.error('Error calculating donation bomb:', error);
        throw error;
      }
      
      console.log('New donation bomb amount:', data);
      setTotalDonations(data || 0);
    } catch (error) {
      console.error('Error fetching total donations:', error);
      setTotalDonations(0);
    }
  };

  const getStartOfWeek = () => {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek.toISOString();
  };

  const fetchSupportersLeaderboard = async () => {
    try {
      const { data: votes, error } = await supabase
        .from("votes")
        .select(`
          amount,
          created_at,
          users (
            display_name
          )
        `);

      if (error) throw error;

      const today = new Date();
      const startOfToday = new Date(today.setHours(0, 0, 0, 0));
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

      const supporterVotes = votes.reduce((acc, vote) => {
        const voteDate = new Date(vote.created_at);
        const displayName = vote.users?.display_name || 'Anonymous';

        if (!acc[displayName]) {
          acc[displayName] = { today: 0, week: 0, allTime: 0 };
        }

        acc[displayName].allTime += vote.amount;
        if (voteDate >= startOfToday) {
          acc[displayName].today += vote.amount;
        }
        if (voteDate >= startOfWeek) {
          acc[displayName].week += vote.amount;
        }

        return acc;
      }, {});

      const supportersLeaderboard = Object.entries(supporterVotes).map(
        ([name, { today, week, allTime }]) => ({
          name,
          today,
          week,
          allTime,
        })
      );

      setSupportersData(supportersLeaderboard);
    } catch (error) {
      console.error("Error loading supporters leaderboard:", error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const startOfWeek = getStartOfWeek();
      
      // First, get the vote counts
      const { data: voteData, error: voteError } = await supabase
        .from('votes')
        .select('streamer, amount, created_at')
        .gte('created_at', startOfWeek);

      if (voteError) {
        console.error('Error fetching votes:', voteError);
        setError('Failed to load leaderboard data. Please try again later.');
        return;
      }

      // Process the votes into streamer totals
      const streamerTotals = voteData.reduce((acc, vote) => {
        const streamerName = vote.streamer.toLowerCase();
        if (!acc[streamerName]) {
          acc[streamerName] = {
            name: streamerName,
            votes: 0,
            today: 0,
            week: 0,
            allTime: 0
          };
        }
        
        const voteDate = new Date(vote.created_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const voteAmount = vote.amount || 1;
        acc[streamerName].votes += voteAmount;
        acc[streamerName].week += voteAmount;
        
        if (voteDate >= today) {
          acc[streamerName].today += voteAmount;
        }
        
        acc[streamerName].allTime += voteAmount;
        
        return acc;
      }, {});

      // Convert to array
      const transformedData = Object.values(streamerTotals);
      console.log('Transformed leaderboard data:', transformedData);
      setData(transformedData);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Add animation style for number changes
  const AnimatedValue = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(value);
    
    useEffect(() => {
      // If the value has changed, animate to new value
      if (value !== displayValue) {
        const step = (value - displayValue) / 10; // Divide change into 10 steps
        let current = displayValue;
        
        const interval = setInterval(() => {
          current += step;
          if ((step > 0 && current >= value) || (step < 0 && current <= value)) {
            setDisplayValue(value);
            clearInterval(interval);
          } else {
            setDisplayValue(current);
          }
        }, 50); // Update every 50ms

        return () => clearInterval(interval);
      }
    }, [value]);

    return formatVotes(Math.round(displayValue));
  };

  // Update the table cell render to use animated values
  const columns = useMemo(
    () => [
      {
        Header: "Streamer",
        accessor: "name",
        Cell: ({ value }) => (
          <Link to={`/stream/${value}`} className="streamer-link">
            <div className="streamer-cell">
              <img
                src={streamerProfiles[value.toLowerCase()]?.profile_image_url || "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png"}
                alt={value}
                className="leaderboard-profile-image"
              />
              <span>{streamerProfiles[value.toLowerCase()]?.display_name || value}</span>
            </div>
          </Link>
        ),
      },
      {
        Header: "Today",
        accessor: "today",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
      {
        Header: "This Week",
        accessor: "week",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
      {
        Header: "All Time",
        accessor: "allTime",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
    ],
    [streamerProfiles]
  );

  const formatVotes = (value) => {
    return value.toLocaleString();
  };

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
  } = useTable(
    { 
      columns, 
      data,
      initialState: {
        sortBy: [
          {
            id: 'week',
            desc: true
          }
        ]
      }
    }, 
    useSortBy
  );

  // Add supporters columns configuration
  const supportersColumns = useMemo(
    () => [
      {
        Header: "Supporter",
        accessor: "name",
      },
      {
        Header: "Today",
        accessor: "today",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
      {
        Header: "This Week",
        accessor: "week",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
      {
        Header: "All Time",
        accessor: "allTime",
        Cell: ({ value }) => <AnimatedValue value={value} />,
      },
    ],
    []
  );

  // Add supporters table configuration
  const {
    getTableProps: getSupportersTableProps,
    getTableBodyProps: getSupportersTableBodyProps,
    headerGroups: supportersHeaderGroups,
    rows: supportersRows,
    prepareRow: prepareSupporterRow,
  } = useTable(
    {
      columns: supportersColumns,
      data: supportersData,
      initialState: {
        sortBy: [
          {
            id: 'week',
            desc: true
          }
        ]
      }
    },
    useSortBy
  );

  const EmptyState = ({ onFallback }) => (
    <div className="empty-leaderboard">
      <div className="empty-state-content">
        <h3>🎮 Be the First to Support!</h3>
        <p>No votes yet this week - you could be the first to support your favorite streamer!</p>
        <div className="empty-state-steps">
          <div className="step">
            <span className="step-number">1</span>
            <p>Visit your favorite streamer's page</p>
          </div>
          <div className="step">
            <span className="step-number">2</span>
            <p>Vote with your credits</p>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <p>Help them climb the leaderboard!</p>
          </div>
        </div>
        <Link to="/" className="discover-button">
          Discover Streamers
        </Link>
        <button 
          className="fallback-button" 
          onClick={onFallback}
        >
          Show Demo Leaderboard
        </button>
        <p className="fallback-note">
          <small>Demo leaderboard will show placeholder data until we can reconnect to Twitch</small>
        </p>
      </div>
    </div>
  );

  // Add a function to force fallback data
  const handleForceFallback = async () => {
    try {
      console.log('Using fallback data for leaderboard');
      setUsingFallbackData(true);
      setLoading(true);
      
      // Get streamer list from Supabase
      const { data: dbStreamers } = await supabase
        .from('streamers')
        .select('*')
        .order('username');
        
      if (!dbStreamers || dbStreamers.length === 0) {
        setError('Could not load fallback data. Please try again later.');
        return;
      }
      
      // Create fallback streamer profiles
      const fallbackStreamers = getFallbackStreamerData(dbStreamers);
      const fallbackProfiles = fallbackStreamers.reduce((acc, streamer) => {
        acc[streamer.user_login.toLowerCase()] = {
          profile_image_url: streamer.profile_image_url,
          display_name: streamer.user_name
        };
        return acc;
      }, {});
      setStreamerProfiles(fallbackProfiles);
      
      // Generate fallback leaderboard data
      const fallbackLeaderboard = fallbackStreamers.map(streamer => {
        const votes = Math.floor(Math.random() * 1000);
        const todayVotes = Math.floor(votes * (Math.random() * 0.5));
        
        return {
          name: streamer.user_login.toLowerCase(),
          votes: votes,
          today: todayVotes,
          week: votes,
          allTime: votes + Math.floor(Math.random() * 2000)
        };
      }).sort((a, b) => b.votes - a.votes);
      
      // Generate fallback supporters data
      const supporterNames = ['SuperFan1', 'TwitchLover', 'StreamEnthusiast', 'ChaddSupporter', 'GamingFriend'];
      const fallbackSupporters = supporterNames.map(name => {
        const weeklyAmount = Math.floor(Math.random() * 500) + 50;
        
        return {
          name: name,
          today: Math.floor(weeklyAmount * 0.3),
          week: weeklyAmount,
          allTime: weeklyAmount + Math.floor(Math.random() * 1000)
        };
      });
      
      // Set the fallback data
      setData(fallbackLeaderboard);
      setSupportersData(fallbackSupporters);
      setTotalDonations(fallbackLeaderboard.reduce((total, item) => total + item.week, 0) * 0.25);
      
      // Create fallback weekly winners
      const today = new Date();
      const winners = [];
      
      for (let i = 0; i < 4; i++) {
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - ((i + 1) * 7)); // Weekly intervals
        
        winners.push({
          streamer: fallbackLeaderboard[i]?.name || 'streamer' + i,
          week_ending: pastDate.toISOString(),
          amount: Math.floor(Math.random() * 1000) + 200
        });
      }
      setWeeklyWinners(winners);
      
      // Clear any errors since we're showing fallback data
      setError(null);
    } catch (fallbackError) {
      console.error('Error generating fallback data:', fallbackError);
      setError('Error loading fallback data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h2 className="leaderboard-title">🏆 Streamer Leaderboard</h2>
        
        <div className="leaderboard-stats-container">
          <div className="leaderboard-stats">
            <div className="stat-box">
              <h3>Next Drop In</h3>
              <div className="countdown">{timeUntilReset}</div>
            </div>
            
            <div className="stat-box">
              <h3>Donation Bomb</h3>
              <div className="total-donations">
                ${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="support-note"></div>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-container">
            <p className="error-message">{error}</p>
            <button 
              className="fallback-button" 
              onClick={handleForceFallback}
            >
              Show Demo Leaderboard
            </button>
            <p className="fallback-note">
              <small>Demo leaderboard will show placeholder data until we can reconnect to Twitch</small>
            </p>
          </div>
        )}

        {loading ? (
          <p className="loading-message">Loading leaderboard data...</p>
        ) : data.every(row => row.week === 0) && !usingFallbackData ? (
          <EmptyState onFallback={handleForceFallback} />
        ) : (
          <div className="table-container">
            <table {...getTableProps()} className="leaderboard-table">
              <thead>
                {headerGroups.map((headerGroup, index) => (
                  <tr {...headerGroup.getHeaderGroupProps()} key={index}>
                    {headerGroup.headers.map((column, colIndex) => (
                      <th 
                        {...column.getHeaderProps(column.getSortByToggleProps())} 
                        key={colIndex}
                      >
                        {column.render("Header")}
                        <span className="sort-indicator">
                          {column.isSorted ? (column.isSortedDesc ? " ▼" : " ▲") : ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody {...getTableBodyProps()}>
                {rows.map((row, rowIndex) => {
                  prepareRow(row);
                  return (
                    <tr {...row.getRowProps()} key={rowIndex}>
                      {row.cells.map((cell, cellIndex) => (
                        <td {...cell.getCellProps()} key={cellIndex}>
                          {cell.render("Cell")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="previous-winners-section">
          <h2 className="section-title">🎉 Previous Winners</h2>
          <div className="winners-grid">
            {weeklyWinners.map((winner) => (
              <Link 
                to={`/stream/${winner.streamer}`}
                key={winner.week_ending} 
                className="winner-card"
              >
                <img 
                  src={streamerProfiles[winner.streamer.toLowerCase()]?.profile_image_url} 
                  alt={winner.streamer}
                  className="winner-image"
                />
                <div className="winner-info">
                  <span className="winner-name">
                    {streamerProfiles[winner.streamer.toLowerCase()]?.display_name || winner.streamer}
                  </span>
                  <span className="winner-date">
                    {new Date(winner.week_ending).toLocaleDateString()}
                  </span>
                  <span className="winner-amount">
                    ${(winner.amount * STREAMER_PAYOUT_PERCENTAGE / 100).toFixed(2)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Add Supporters Leaderboard */}
      <div className="leaderboard-section">
        <h2 className="leaderboard-title">🎯 Top Supporters</h2>
        <div className="table-container">
          <table {...getSupportersTableProps()} className="leaderboard-table">
            <thead>
              {supportersHeaderGroups.map((headerGroup, index) => (
                <tr {...headerGroup.getHeaderGroupProps()} key={index}>
                  {headerGroup.headers.map((column, colIndex) => (
                    <th 
                      {...column.getHeaderProps(column.getSortByToggleProps())} 
                      key={colIndex}
                    >
                      {column.render("Header")}
                      <span className="sort-indicator">
                        {column.isSorted ? (column.isSortedDesc ? " ▼" : " ▲") : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody {...getSupportersTableBodyProps()}>
              {supportersRows.map((row, rowIndex) => {
                prepareSupporterRow(row);
                return (
                  <tr {...row.getRowProps()} key={rowIndex}>
                    {row.cells.map((cell, cellIndex) => (
                      <td {...cell.getCellProps()} key={cellIndex}>
                        {cell.render("Cell")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;