import { useEffect, useState, useRef, useCallback } from "react";
import { fetchStreamers } from "../api/twitch";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import styles from './Discover.module.css';
import { FaLock } from 'react-icons/fa';

const ITEMS_PER_PAGE = 12; // Number of streamers to load at once

const Discover = () => {
  const [user, setUser] = useState(null);
  const [streamers, setStreamers] = useState([]);
  const [displayedStreamers, setDisplayedStreamers] = useState([]);
  const [streamerVotes, setStreamerVotes] = useState({});
  const [userBalance, setUserBalance] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [topStreamer, setTopStreamer] = useState(null);
  const [totalDonations, setTotalDonations] = useState(0);
  const [timeUntilPayout, setTimeUntilPayout] = useState('');
  const [nominationUrl, setNominationUrl] = useState('');
  const [nominationStatus, setNominationStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const nominationSectionRef = useRef(null);
  const streamersGridRef = useRef(null);
  const observerRef = useRef(null);

  const FREE_STREAMER_LIMIT = 5;
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Get user's preferences or default values
  const getUserPreferences = () => {
    if (user) {
      return {
        sortOption: localStorage.getItem(`sortPreference_${user.id}`) || "viewers-high",
        streamersFilter: localStorage.getItem(`streamersFilter_${user.id}`) || "all"
      };
    }
    return {
      sortOption: localStorage.getItem('sortPreference') || "viewers-high",
      streamersFilter: localStorage.getItem('streamersFilter') || "all"
    };
  };

  const [sortOption, setSortOption] = useState(getUserPreferences().sortOption);
  const [streamersFilter, setStreamersFilter] = useState(getUserPreferences().streamersFilter);

  const OFFLINE_THUMBNAIL = "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg";
  const DEFAULT_PROFILE_IMAGE = "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png";

  // Memoized function to filter and sort streamers
  const getSortedStreamers = useCallback(() => {
    let filtered = [...streamers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(streamer => 
        streamer.user_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamer.game_name?.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    // Apply online/offline filter
    if (streamersFilter !== 'all') {
      filtered = filtered.filter(streamer => 
        streamersFilter === 'online' ? 
          streamer.type === "live" : 
          streamer.type !== "live"
      );
    }

    // Apply sorting
    switch (sortOption) {
      case "viewers-high":
        return filtered.sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
      case "viewers-low":
        return filtered.sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0));
      case "alphabetical":
        return filtered.sort((a, b) => a.user_name.localeCompare(b.user_name));
      case "popular":
        return filtered.sort((a, b) => {
          const votesA = streamerVotes[a.user_login] || 0;
          const votesB = streamerVotes[b.user_login] || 0;
          return votesB - votesA;
        });
      default:
        return filtered;
    }
  }, [streamers, searchQuery, categoryFilter, streamersFilter, sortOption, streamerVotes]);

  // Load more streamers when scrolling
  const loadMoreStreamers = useCallback(() => {
    const sortedStreamers = getSortedStreamers();
    const nextStreamers = sortedStreamers.slice(0, page * ITEMS_PER_PAGE);
    setDisplayedStreamers(nextStreamers);
  }, [getSortedStreamers, page]);

  // Intersection Observer for infinite scrolling
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '20px',
      threshold: 1.0
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setPage(prevPage => prevPage + 1);
      }
    }, options);

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Update displayed streamers when filters change
  useEffect(() => {
    setPage(1);
    loadMoreStreamers();
  }, [searchQuery, categoryFilter, streamersFilter, sortOption]);

  // Load more streamers when page changes
  useEffect(() => {
    loadMoreStreamers();
  }, [page, loadMoreStreamers]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        // Fetch streamers and votes in parallel
        const [streamersData, votesData] = await Promise.all([
          fetchStreamers(),
          fetchVotes()
        ]);

        setStreamers(streamersData);
        setStreamerVotes(votesData);

        // Find top streamer
        if (votesData) {
          const topStreamerLogin = Object.entries(votesData)
            .sort(([, a], [, b]) => b - a)[0]?.[0];
          
          const topStreamerData = streamersData.find(
            s => s.user_login.toLowerCase() === topStreamerLogin?.toLowerCase()
          );
          
          if (topStreamerData) {
            setTopStreamer({
              ...topStreamerData,
              weeklyVotes: votesData[topStreamerLogin] || 0
            });
          }
        }

        // Fetch user balance if logged in
        if (user) {
          const { data: balanceData } = await supabase
            .from('users')
            .select('credits')
            .eq('id', user.id)
            .single();
          
          setUserBalance(balanceData?.credits || 0);
        }

        await fetchTotalDonations();
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // ... rest of the component code ...

  return (
    <div className={styles.discoverContainer}>
      {/* ... existing header and controls ... */}

      <div className={styles.streamerGrid} ref={streamersGridRef}>
        {isLoading ? (
          <div className={styles.loadingSpinner}>Loading streamers...</div>
        ) : displayedStreamers.length > 0 ? (
          <>
            {displayedStreamers.map((streamer, index) => renderStreamerCard(streamer, index))}
            {displayedStreamers.length < getSortedStreamers().length && (
              <div ref={el => {
                if (el && observerRef.current) {
                  observerRef.current.observe(el);
                }
              }} className={styles.loadingMore}>
                Loading more...
              </div>
            )}
          </>
        ) : (
          <div className={styles.noResults}>
            <p>No streamers found</p>
            <p className={styles.noResultsSubtitle}>Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* ... rest of the JSX ... */}
    </div>
  );
};

export default Discover; 