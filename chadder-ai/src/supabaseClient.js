import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_APP_URL || window.location.origin;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
}

// Initialize the Supabase client with more robust configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
    debug: true, // Enable debug logging for auth
    redirectTo: `${siteUrl}/login`, // Redirect to login after email confirmation
    emailRedirectTo: `${siteUrl}/login`, // Redirect to login after email confirmation
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    },
    heartbeat: {
      interval: 5000, // Send heartbeat every 5 seconds
      timeout: 10000  // Consider connection dead after 10 seconds
    }
  },
  global: {
    headers: {
      'X-Client-Info': 'chadder-web'
    }
  },
  db: {
    schema: 'public'
  }
});

// Enhanced error logging for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', {
    event,
    sessionExists: !!session,
    userId: session?.user?.id,
    timestamp: new Date().toISOString()
  });
});

// Add automatic retry logic for failed queries
const originalFrom = supabase.from.bind(supabase);
supabase.from = (table) => {
  const result = originalFrom(table);
  const originalSelect = result.select.bind(result);
  
  result.select = (...args) => {
    const query = originalSelect(...args);
    const originalThen = query.then.bind(query);
    
    query.then = (...thenArgs) => {
      const maxRetries = 3;
      let attempt = 0;

      const tryQuery = async () => {
        try {
          return await originalThen(...thenArgs);
        } catch (error) {
          attempt++;
          console.error(`Query error for ${table} (attempt ${attempt}/${maxRetries}):`, error);
          
          if (attempt < maxRetries) {
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

// Initialize session check
(async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error checking initial session:', error);
    } else {
      console.log('Initial session check:', session ? 'Session exists' : 'No session');
    }
  } catch (err) {
    console.error('Failed to check initial session:', err);
  }
})();