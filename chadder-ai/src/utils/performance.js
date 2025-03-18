/**
 * Performance optimization utilities and configuration
 * This module provides centralized control for various performance settings.
 */

// Cache durations for different data types in milliseconds
export const CACHE_DURATIONS = {
  SESSION: 300000,     // Session data: 5 minutes
  PROFILE: 60000,      // User profile data: 1 minute
  STREAMERS: 60000,    // Streamers list: 1 minute 
  STREAM_DATA: 30000,  // Individual stream data: 30 seconds
  STATIC_DATA: 3600000 // Static content: 1 hour
};

// Image optimization configuration
export const IMAGE_CONFIG = {
  // Use webp when available, fallback to original format
  preferWebP: true,
  
  // Load images in low quality first, then upgrade
  progressiveLoading: true,
  
  // Default placeholder color for lazy loaded images
  placeholderColor: '#1f1f23',
  
  // Default lazy loading threshold (how far from viewport to start loading)
  lazyLoadThreshold: '200px'
};

// Network request optimization
export const NETWORK_CONFIG = {
  // Maximum number of retries for failed requests
  maxRetries: 3,
  
  // Base delay for exponential backoff (in ms)
  retryBaseDelay: 1000,
  
  // Request timeout (in ms)
  timeout: 10000,
  
  // Whether to prioritize cached data when offline
  useCacheWhenOffline: true
};

// Rendering optimization
export const RENDER_CONFIG = {
  // Maximum items to render at once in virtualized lists
  maxListItemsAtOnce: 20,
  
  // Delay before showing loading indicators (ms)
  loadingIndicatorDelay: 300,
  
  // Whether to use React.memo for performance critical components
  useMemoization: true,
  
  // Chunk size for pagination
  defaultPageSize: 20
};

/**
 * Determines if the current device is a low-end device
 * based on memory, CPU cores, and connection type
 */
export const isLowEndDevice = () => {
  if (typeof navigator === 'undefined') return false;
  
  // Check if device has limited memory
  const hasLimitedMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
  
  // Check if device has few CPU cores
  const hasLimitedCPU = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
  
  // Check if network is slow
  const hasSlowNetwork = navigator.connection && 
    (navigator.connection.effectiveType === 'slow-2g' || 
     navigator.connection.effectiveType === '2g' ||
     navigator.connection.effectiveType === '3g');
  
  // Device is considered low-end if at least two conditions are true
  return (hasLimitedMemory && hasLimitedCPU) || 
         (hasLimitedMemory && hasSlowNetwork) || 
         (hasLimitedCPU && hasSlowNetwork);
};

/**
 * Gets optimized settings based on device capability
 */
export const getOptimizedSettings = () => {
  const isLowEnd = isLowEndDevice();
  
  return {
    // Reduce visual effects on low-end devices
    disableAnimations: isLowEnd,
    
    // Reduce number of items rendered at once
    pageSize: isLowEnd ? 10 : RENDER_CONFIG.defaultPageSize,
    
    // Adjust loading thresholds based on device capability
    loadingIndicatorDelay: isLowEnd ? 500 : RENDER_CONFIG.loadingIndicatorDelay,
    
    // Use more aggressive caching on low-end devices or slow connections
    cacheDurationMultiplier: isLowEnd ? 2 : 1
  };
}; 