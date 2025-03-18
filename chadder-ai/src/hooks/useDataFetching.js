import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for optimized data fetching with caching, automatic retries,
 * loading states, and error handling
 * 
 * @param {Function} fetchFunction - Async function that fetches the data
 * @param {Object} options - Configuration options
 * @param {Array} options.dependencies - Dependencies array similar to useEffect
 * @param {boolean} options.loadOnMount - Whether to load when component mounts
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.retryDelay - Base delay for retries (in ms)
 * @param {boolean} options.useCache - Whether to use the cache
 * @param {number} options.cacheTTL - Cache time-to-live (in ms)
 * @param {boolean} options.resetDataOnError - Whether to reset data on error
 * @returns {Object} - Data, loading state, error, and refetch function
 */
const useDataFetching = (fetchFunction, {
  dependencies = [],
  loadOnMount = true,
  maxRetries = 3,
  retryDelay = 1000,
  useCache = true,
  cacheTTL = 60000, // 1 minute
  resetDataOnError = false
} = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(loadOnMount);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Store cache in ref to persist across renders
  const cacheRef = useRef({
    data: null,
    timestamp: null,
    key: JSON.stringify(dependencies)
  });
  
  // Track if component is mounted to avoid memory leaks
  const isMountedRef = useRef(true);
  const loadingTimeoutRef = useRef(null);
  
  // Clear cache and retry counter when dependencies change
  useEffect(() => {
    const newKey = JSON.stringify(dependencies);
    if (cacheRef.current.key !== newKey) {
      cacheRef.current = {
        data: null,
        timestamp: null,
        key: newKey
      };
      setRetryCount(0);
    }
  }, [dependencies]);
  
  // Function to check if cache is valid
  const isCacheValid = useCallback(() => {
    if (!useCache || !cacheRef.current.data || !cacheRef.current.timestamp) {
      return false;
    }
    
    const now = Date.now();
    return now - cacheRef.current.timestamp < cacheTTL;
  }, [useCache, cacheTTL]);
  
  // Main fetch logic - extracted to be used by both useEffect and refetch
  const fetchData = useCallback(async (skipCache = false) => {
    // Don't fetch if not mounted
    if (!isMountedRef.current) return;
    
    // Check cache first if not skipping cache
    if (!skipCache && isCacheValid()) {
      setData(cacheRef.current.data);
      setLoading(false);
      setError(null);
      return;
    }
    
    // Create a timeout to ensure loading state is shown for at least 300ms
    // to prevent UI flashing if data loads very quickly
    clearTimeout(loadingTimeoutRef.current);
    
    let loadingShown = false;
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setLoading(true);
        loadingShown = true;
      }
    }, 300);
    
    try {
      const result = await fetchFunction();
      
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        // Update cache
        cacheRef.current = {
          data: result,
          timestamp: Date.now(),
          key: JSON.stringify(dependencies)
        };
        
        setData(result);
        setError(null);
        setRetryCount(0);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      
      if (isMountedRef.current) {
        if (resetDataOnError) {
          setData(null);
        }
        
        setError(err.message || 'An error occurred while fetching data');
        
        // Retry logic
        if (retryCount < maxRetries && navigator.onLine) {
          const nextRetryCount = retryCount + 1;
          setRetryCount(nextRetryCount);
          
          // Exponential backoff
          const delay = retryDelay * Math.pow(2, retryCount);
          console.log(`Retrying fetch (${nextRetryCount}/${maxRetries}) in ${delay}ms...`);
          
          setTimeout(() => {
            if (isMountedRef.current) {
              fetchData(true); // Skip cache on retry
            }
          }, delay);
        }
      }
    } finally {
      // Clear the loading timeout to prevent it from firing after load completes
      clearTimeout(loadingTimeoutRef.current);
      
      // If loading state was shown, ensure it stays visible for at least 300ms
      // to prevent UI flashing
      if (loadingShown) {
        setTimeout(() => {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }, 300);
      } else if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFunction, isCacheValid, maxRetries, resetDataOnError, retryCount, retryDelay, dependencies]);
  
  // Expose refetch function to manually trigger a refresh
  const refetch = useCallback((skipCache = true) => {
    return fetchData(skipCache);
  }, [fetchData]);
  
  // Load data when component mounts or dependencies change
  useEffect(() => {
    if (loadOnMount) {
      fetchData(false);
    }
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      clearTimeout(loadingTimeoutRef.current);
    };
  }, [loadOnMount, fetchData, ...dependencies]);
  
  // Listen for online status to automatically refetch when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      if (error) {
        console.log('Connection restored - retrying failed request');
        setRetryCount(0); // Reset retry count when connection is restored
        fetchData(true);  // Skip cache when connection is restored
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [error, fetchData]);
  
  return { data, loading, error, refetch };
};

export default useDataFetching; 