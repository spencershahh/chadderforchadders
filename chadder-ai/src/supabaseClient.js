import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;

// Create a simple in-memory cache system
const queryCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

// Initialize the Supabase client with more robust configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public'
  }
});

// Detect network issues and handle reconnection
let networkStatus = {
  online: navigator.onLine,
  lastCheck: Date.now()
};

window.addEventListener('online', function() {
  networkStatus.online = true;
  networkStatus.lastCheck = Date.now();
  console.log('App is now online. Reconnecting services...');
  
  // Clear auth listener and recreate it
  if (authSubscription?.subscription?.unsubscribe) {
    authSubscription.subscription.unsubscribe();
  }
  setupAuthListener();
});

window.addEventListener('offline', function() {
  networkStatus.online = false;
  networkStatus.lastCheck = Date.now();
  console.log('App is offline. Some features may be unavailable.');
});

// Add connection status logging
let authSubscription;
const setupAuthListener = () => {
  authSubscription = supabase.auth.onAuthStateChange((event, session) => {
    // Only log important auth events in production
    if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY'].includes(event)) {
      console.log('Auth state changed:', {
        event,
        sessionExists: !!session,
        userId: session?.user?.id,
        timestamp: new Date().toISOString()
      });
    }
  });
};

setupAuthListener();

// Add automatic retry logic for failed queries with caching
const originalFrom = supabase.from.bind(supabase);
supabase.from = (table) => {
  const result = originalFrom(table);
  const originalSelect = result.select.bind(result);
  
  result.select = (...args) => {
    const query = originalSelect(...args);
    const originalThen = query.then.bind(query);
    
    query.then = (...thenArgs) => {
      // Generate a cache key from table name and query params
      const cacheKey = `${table}:${JSON.stringify(args)}:${JSON.stringify(query.url)}`;
      const now = Date.now();
      
      // Check if we have a valid cached result
      if (queryCache.has(cacheKey)) {
        const cachedItem = queryCache.get(cacheKey);
        if (now - cachedItem.timestamp < CACHE_TTL) {
          console.log(`Using cached data for ${table}`);
          return Promise.resolve(cachedItem.data);
        } else {
          // Expired cache, remove it
          queryCache.delete(cacheKey);
        }
      }
      
      const maxRetries = 3;
      let attempt = 0;

      const tryQuery = async () => {
        try {
          const result = await originalThen(...thenArgs);
          
          // Only cache successful responses
          if (!result.error && result.data) {
            queryCache.set(cacheKey, {
              data: result,
              timestamp: Date.now()
            });
            
            // Clean up old cache entries
            if (queryCache.size > 100) {
              const oldestKey = [...queryCache.entries()]
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
              queryCache.delete(oldestKey);
            }
          }
          
          return result;
        } catch (error) {
          attempt++;
          console.error(`Query error for ${table} (attempt ${attempt}/${maxRetries}):`, error);
          
          if (attempt < maxRetries && networkStatus.online) {
            // Wait with exponential backoff before retrying
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            return tryQuery();
          }
          throw error;
        }
      };

      return tryQuery();
    };
    
    return query;
  };
  
  return result;
};

// Test database connection and auth status
(async () => {
  try {
    // Check session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
    } else {
      console.log('Auth status:', session ? 'Authenticated' : 'Not authenticated');
      
      if (session) {
        // Test database access
        const { error: dbError } = await supabase
          .from('admins')
          .select('count')
          .limit(1);
          
        if (dbError) {
          console.error('Database access error:', dbError);
        } else {
          console.log('Database connection successful');
        }
      }
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
})();