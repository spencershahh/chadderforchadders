import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: 'supabase.auth.token'
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  },
  global: {
    headers: {
      'X-Client-Info': 'chadder-web'
    }
  }
});

// Add error logging
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session ? 'Session exists' : 'No session');
});

// Add query error logging
const originalFrom = supabase.from.bind(supabase);
supabase.from = (table) => {
  const result = originalFrom(table);
  const originalSelect = result.select.bind(result);
  
  result.select = (...args) => {
    const query = originalSelect(...args);
    const originalThen = query.then.bind(query);
    
    query.then = (...thenArgs) => {
      return originalThen(...thenArgs).catch(error => {
        console.error(`Query error for ${table}:`, error);
        throw error;
      });
    };
    
    return query;
  };
  
  return result;
};