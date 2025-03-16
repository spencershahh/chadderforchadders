import  { useEffect, useState, useMemo } from "react";
import { useTable, useSortBy } from "react-table";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { fetchStreamers, createErrorState } from "../api/twitch";
import styles from './Leaderboard.module.css';

const Leaderboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamerProfiles, setStreamerProfiles] = useState({});
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [weeklyWinners, setWeeklyWinners] = useState([]);
  const [totalDonations, setTotalDonations] = useState(0);
  const [supportersData, setSupportersData] = useState([]);
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
          <Link to={`/stream/${value}`} className={styles.streamerLink}>
            <div className={styles.streamerCell}>
              <img
                src={streamerProfiles[value.toLowerCase()]?.profile_image_url || "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png"}
                alt={value}
                className={styles.leaderboardProfileImage}
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

  const EmptyState = () => (
    <div className={styles.emptyLeaderboard}>
      <div className={styles.emptyStateContent}>
        <h3>🎮 Be the First to Support!</h3>
        <p>No votes yet this week - you could be the first to support your favorite streamer!</p>
        <div className={styles.emptyStateSteps}>
          <div className={styles.step}>
            <span className={styles.stepNumber}>1</span>
            <p>Visit your favorite streamer's page</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            <p>Vote with your credits</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            <p>Help them climb the leaderboard!</p>
          </div>
        </div>
        <Link to="/" className={styles.discoverButton}>
          Discover Streamers
        </Link>
        <p className={styles.emptyNote}>
          <small>The leaderboard only shows real data from Twitch. Vote for streamers to see them here!</small>
        </p>
      </div>
    </div>
  );

  return (
    <div className={styles.leaderboardContainer}>
      <div className={styles.leaderboardHeader}>
        <h2 className={styles.leaderboardTitle}>🏆 Streamer Leaderboard</h2>
        
        <div className={styles.leaderboardStatsContainer}>
          <div className={styles.leaderboardStats}>
            <div className={styles.statBox}>
              <h3>Next Drop In</h3>
              <div className={styles.countdown}>{timeUntilReset}</div>
            </div>
            
            <div className={styles.statBox}>
              <h3>Donation Bomb</h3>
              <div className={styles.totalDonations}>
                ${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={styles.supportNote}></div>
            </div>
          </div>
        </div>

        {error && (
          <div className={styles.errorContainer}>
            <p className={styles.errorMessage}>{error}</p>
          </div>
        )}

        {loading ? (
          <p className={styles.loadingMessage}>Loading leaderboard data...</p>
        ) : data.every(row => row.week === 0) ? (
          <EmptyState />
        ) : (
          <div className={styles.tableContainer}>
            <table {...getTableProps()} className={styles.leaderboardTable}>
              <thead>
                {headerGroups.map((headerGroup, index) => (
                  <tr {...headerGroup.getHeaderGroupProps()} key={index}>
                    {headerGroup.headers.map((column, colIndex) => (
                      <th 
                        {...column.getHeaderProps(column.getSortByToggleProps())} 
                        key={colIndex}
                      >
                        {column.render("Header")}
                        <span className={styles.sortIndicator}>
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

        {weeklyWinners.length > 0 && (
          <div className={styles.previousWinnersSection}>
            <h2 className={styles.sectionTitle}>🎉 Previous Winners</h2>
            <div className={styles.winnersGrid}>
              {weeklyWinners.map((winner, idx) => (
                <Link 
                  to={`/stream/${winner.streamer.toLowerCase()}`} 
                  key={idx}
                  className={styles.winnerCard}
                >
                  <img 
                    src={streamerProfiles[winner.streamer.toLowerCase()]?.profile_image_url || "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png"} 
                    alt={`${winner.streamer}'s profile`} 
                    className={styles.winnerImage}
                    loading="lazy"
                  />
                  <div className={styles.winnerInfo}>
                    <span className={styles.winnerName}>
                      {streamerProfiles[winner.streamer.toLowerCase()]?.display_name || winner.streamer}
                    </span>
                    <span className={styles.winnerDate}>
                      Week of {new Date(winner.week_ending).toLocaleDateString()}
                    </span>
                    <span className={styles.winnerAmount}>
                      ${(winner.amount * STREAMER_PAYOUT_PERCENTAGE).toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className={styles.tableContainer}>
          <h2 className={styles.leaderboardTitle}>🎯 Top Supporters</h2>
          <table {...getSupportersTableProps()} className={styles.leaderboardTable}>
            <thead>
              {supportersHeaderGroups.map((headerGroup, index) => (
                <tr {...headerGroup.getHeaderGroupProps()} key={index}>
                  {headerGroup.headers.map((column, colIndex) => (
                    <th 
                      {...column.getHeaderProps(column.getSortByToggleProps())} 
                      key={colIndex}
                    >
                      {column.render("Header")}
                      <span className={styles.sortIndicator}>
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