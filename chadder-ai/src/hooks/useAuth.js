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
        .select('subscription_tier, subscription_status, credits, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      setSubscription({
        tier: data.subscription_tier || 'free',
        status: data.subscription_status || 'inactive',
        credits: data.credits || 0,
        stripeCustomerId: data.stripe_customer_id
      });
      
      return data;
    } catch (err) {
      console.error('Error fetching user data:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let userSubscription = null;
    let authSubscription = null;

    const setupSubscriptions = async () => {
      try {
        // Get initial session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          setError(sessionError);
          return;
        }

        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch initial user data
          await fetchUserData(session.user.id);

          // Set up real-time subscription tracking
          userSubscription = supabase
            .channel('user-channel')
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'users',
                filter: `id=eq.${session.user.id}`
              },
              async (payload) => {
                console.log('User data changed:', payload);
                if (payload.new) {
                  setSubscription({
                    tier: payload.new.subscription_tier || 'free',
                    status: payload.new.subscription_status || 'inactive',
                    credits: payload.new.credits || 0,
                    stripeCustomerId: payload.new.stripe_customer_id
                  });
                }
              }
            )
            .subscribe();
        }

        setLoading(false);
      } catch (err) {
        console.error('Error setting up subscriptions:', err);
        setError(err);
        setLoading(false);
      }
    };

    // Set up auth state change listener
    authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setSubscription(null);
      }
    });

    setupSubscriptions();

    // Cleanup
    return () => {
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
      }
      if (authSubscription) {
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