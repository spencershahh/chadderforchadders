import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Create auth context
export const AuthContext = createContext(null);

// Hook for components to consume auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscription, setSubscription] = useState(null);

  const fetchUserData = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('subscription_tier, subscription_status, gem_balance, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      setSubscription({
        tier: data.subscription_tier || 'free',
        status: data.subscription_status || 'inactive',
        gems: data.gem_balance || 0,
        stripeCustomerId: data.stripe_customer_id
      });
      
      return data;
    } catch (err) {
      console.error('Error fetching user data:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authSubscription = null;

    const setupSubscriptions = async () => {
      try {
        setLoading(true);
        // Get initial session - using Supabase v2 API
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          if (mounted) {
            setError(sessionError);
            setLoading(false);
          }
          return;
        }

        if (mounted) {
          setUser(session?.user ?? null);
        }

        if (session?.user && mounted) {
          // Fetch initial user data
          await fetchUserData(session.user.id);
        }
        
        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error setting up subscriptions:', err);
        if (mounted) {
          setError(err);
          setLoading(false);
        }
      }
    };

    // Set up auth state change listener
    try {
      authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        console.log('Auth state changed in AuthProvider:', event, session?.user?.id);
        
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchUserData(session.user.id);
        } else {
          setSubscription(null);
        }
      });
    } catch (error) {
      console.error('Error setting up auth state change listener:', error);
      setError(error);
    }

    setupSubscriptions();

    // Cleanup function
    return () => {
      mounted = false;
      if (authSubscription?.subscription?.unsubscribe) {
        authSubscription.subscription.unsubscribe();
      }
    };
  }, [fetchUserData]);

  const updateUser = async (formData) => {
    try {
      if (!user) throw new Error('No user logged in');

      const updates = {
        display_name: formData.displayName,
        email: formData.email,
        notifications: formData.notifications,
        theme: formData.theme,
        updated_at: new Date()
      };

      // Update user data in the database
      const { error: dbError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Refresh user data
      await fetchUserData(user.id);

    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  };

  const signup = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error during signup:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    error,
    subscription,
    updateUser,
    refreshUserData: () => user && fetchUserData(user.id),
    login,
    signup,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 