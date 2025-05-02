import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

// Create a simple in-memory cache system
const queryCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

// Log Supabase configuration for debugging
console.log('Supabase Configuration:', {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  siteUrl
});

// Initialize the Supabase client with more robust configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'chadder_supabase_auth',
    flowType: 'implicit' // Use implicit flow for better compatibility
  },
  global: {
    headers: {
      'X-Client-Info': 'chadder-app'
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  db: {
    schema: 'public'
  }
});

// Function to attempt session recovery
const recoverSession = async () => {
  try {
    // Try to recover session from localStorage
    const storedSession = localStorage.getItem('authSession');
    if (storedSession) {
      const parsedSession = JSON.parse(storedSession);
      if (parsedSession?.access_token) {
        console.log('Attempting to recover session from localStorage');
        // Set session manually
        const { error } = await supabase.auth.setSession({
          access_token: parsedSession.access_token,
          refresh_token: parsedSession.refresh_token
        });
        
        if (error) {
          console.error('Failed to recover session:', error.message);
          localStorage.removeItem('authSession');
        } else {
          console.log('Session recovered successfully');
        }
      }
    }
  } catch (error) {
    console.error('Error recovering session:', error);
    localStorage.removeItem('authSession');
  }
};

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
  
  // Try to recover session
  recoverSession();
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
    console.log('Auth state changed:', {
      event,
      sessionExists: !!session,
      userId: session?.user?.id,
      timestamp: new Date().toISOString()
    });
    
    // Persist session in localStorage for better recovery
    if (event === 'SIGNED_IN' && session) {
      localStorage.setItem('authSession', JSON.stringify(session));
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('authSession');
    } else if (event === 'TOKEN_REFRESHED' && session) {
      localStorage.setItem('authSession', JSON.stringify(session));
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
          
          // Check if result is undefined or null
          if (!result) {
            console.error(`Query result is ${result === null ? 'null' : 'undefined'} for ${table}`);
            return { data: null, error: new Error('Empty response from database') };
          }
          
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
          
          // Return a properly structured error response
          return { 
            data: null, 
            error: error instanceof Error ? error : new Error(String(error))
          };
        }
      };

      return tryQuery();
    };
    
    return query;
  };
  
  return result;
};

// Test database connection
const testConnection = async () => {
  try {
    const { error } = await supabase
      .from('users')
      .select('count', { count: 'exact' })
      .limit(0);
    
    if (error) {
      console.error('Database connection error:', error.message);
      return false;
    }
    
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
};

// Add cleanup function for better memory management
export const cleanup = () => {
  if (authSubscription) {
    authSubscription.subscription.unsubscribe();
  }
  queryCache.clear();
};

// Try to recover session on initial load
recoverSession();

// Test database connection and auth status
(async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Check auth status
    const { data, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      return;
    }

    console.log('Auth status:', data.session ? 'Authenticated' : 'Not authenticated');
    
    if (data.session) {
      console.log('Logged in as:', data.session.user.email);
      
      // Test admin status
      const { data: adminData, error: dbError } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', data.session.user.id)
        .single();
        
      if (dbError && dbError.code !== 'PGRST116') { // Not found is okay
        console.error('Database access error:', dbError);
      } else {
        console.log('Admin status:', adminData ? 'Is admin' : 'Not admin');
      }
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
})();