import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useAuth() {
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
        console.log('Auth state changed in useAuth:', event, session?.user?.id);
        
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

  return {
    user,
    loading,
    error,
    subscription,
    updateUser,
    refreshUserData: () => user && fetchUserData(user.id)
  };
} 