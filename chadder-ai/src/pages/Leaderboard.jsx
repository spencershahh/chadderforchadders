import  { useEffect, useState, useMemo } from "react";
import { useTable, useSortBy } from "react-table";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { fetchStreamers } from "../api/twitch";

const Leaderboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamerProfiles, setStreamerProfiles] = useState({});
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [weeklyWinners, setWeeklyWinners] = useState([]);
  const [totalDonations, setTotalDonations] = useState(0);
  const [supportersData, setSupportersData] = useState([]);

  const STREAMER_PAYOUT_PERCENTAGE = 0.55; // Streamers get 55% of votes

  useEffect(() => {
    fetchLeaderboard();
    fetchStreamerProfiles();
    fetchWeeklyWinners();
    fetchTotalDonations();
    fetchSupportersLeaderboard();
    
    // Set up real-time subscription for votes
    const votesSubscription = supabase
      .channel('votes-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes'
        },
        (payload) => {
          // Instead of fetching entire leaderboard, update specific values
          if (payload.eventType === 'INSERT') {
            const vote = payload.new;
            const voteDate = new Date(vote.created_at);
            const today = new Date();
            const startOfToday = new Date(today.setHours(0, 0, 0, 0));
            const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

            setData(currentData => {
              // Find if streamer exists in current data
              const streamerIndex = currentData.findIndex(item => item.name === vote.streamer);
              
              if (streamerIndex === -1) {
                // If streamer doesn't exist, add new entry
                return [...currentData, {
                  name: vote.streamer,
                  today: voteDate >= startOfToday ? vote.vote_amount : 0,
                  week: voteDate >= startOfWeek ? vote.vote_amount : 0,
                  allTime: vote.vote_amount
                }];
              }

              // Create new array to trigger re-render
              const newData = [...currentData];
              const streamer = newData[streamerIndex];

              // Update vote counts with animation
              streamer.allTime += vote.vote_amount;
              if (voteDate >= startOfToday) {
                streamer.today += vote.vote_amount;
              }
              if (voteDate >= startOfWeek) {
                streamer.week += vote.vote_amount;
              }

              return newData;
            });

            // Update total donations
            setTotalDonations(current => current + (vote.vote_amount * STREAMER_PAYOUT_PERCENTAGE));
          }
        }
      )
      .subscribe();

    // Update countdown timer every second
    const timer = setInterval(() => {
      updateTimeUntilReset();
    }, 1000);

    // Cleanup subscriptions on component unmount
    return () => {
      clearInterval(timer);
      supabase.removeChannel(votesSubscription);
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

  const calculateDonationBomb = (votes) => {
    const WACP = 0.0725; // Weekly Average Credit Price
    const totalCredits = votes.reduce((sum, vote) => sum + vote.vote_amount, 0);
    return (totalCredits * WACP * STREAMER_PAYOUT_PERCENTAGE).toFixed(2);
  };

  const fetchTotalDonations = async () => {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*');
      
      if (error) throw error;
      const donationBomb = calculateDonationBomb(data);
      setTotalDonations(parseFloat(donationBomb));
    } catch (error) {
      console.error('Error fetching total donations:', error);
    }
  };

  const fetchSupportersLeaderboard = async () => {
    try {
      const { data: votes, error } = await supabase
        .from("votes")
        .select(`
          vote_amount,
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

        acc[displayName].allTime += vote.vote_amount;
        if (voteDate >= startOfToday) {
          acc[displayName].today += vote.vote_amount;
        }
        if (voteDate >= startOfWeek) {
          acc[displayName].week += vote.vote_amount;
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
      const today = new Date();
      const startOfToday = new Date(today.setHours(0, 0, 0, 0));
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

      const { data: votes, error } = await supabase
        .from('votes')
        .select('vote_amount, streamer, created_at');

      if (error) {
        setError(error.message);
        return;
      }

      // Process votes into streamer totals
      const streamerTotals = votes.reduce((acc, vote) => {
        const voteDate = new Date(vote.created_at);
        
        if (!acc[vote.streamer]) {
          acc[vote.streamer] = {
            name: vote.streamer,
            today: 0,
            week: 0,
            allTime: 0
          };
        }

        acc[vote.streamer].allTime += vote.vote_amount;
        if (voteDate >= startOfToday) {
          acc[vote.streamer].today += vote.vote_amount;
        }
        if (voteDate >= startOfWeek) {
          acc[vote.streamer].week += vote.vote_amount;
        }

        return acc;
      }, {});

      // Convert to array and sort by weekly votes
      const leaderboardData = Object.values(streamerTotals).sort((a, b) => b.week - a.week);
      setData(leaderboardData);
    } catch (err) {
      setError(err.message);
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

  const EmptyState = () => (
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
      </div>
    </div>
  );

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

        {error && <p className="error-message">{error}</p>}

        {loading ? (
          <p className="loading-message">Loading leaderboard data...</p>
        ) : data.every(row => row.week === 0) ? (
          <EmptyState />
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
                    ${(winner.vote_amount * STREAMER_PAYOUT_PERCENTAGE / 100).toFixed(2)}
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