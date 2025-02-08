import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUserData = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching user data:', err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const setupAuth = async () => {
      try {
        // Get initial session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session?.user) {
          const userData = await fetchUserData(session.user.id);
          if (mounted) {
            setUser(userData ? { ...session.user, ...userData } : session.user);
          }
        } else if (mounted) {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth error:', err);
        if (mounted) {
          setError(err);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    setupAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        if (session?.user) {
          const userData = await fetchUserData(session.user.id);
          setUser(userData ? { ...session.user, ...userData } : session.user);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const updateUser = async (formData) => {
    try {
      if (!user) throw new Error('No user logged in');

      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          displayName: formData.displayName,
          notifications: formData.notifications,
          theme: formData.theme
        }
      });

      if (authError) throw authError;

      // Update user data in the database
      const { error: dbError } = await supabase
        .from('users')
        .update({
          display_name: formData.displayName,
          email: formData.email,
          notifications: formData.notifications,
          theme: formData.theme,
          updated_at: new Date()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Refresh user data
      const userData = await fetchUserData(user.id);
      if (userData) {
        setUser(prev => ({ ...prev, ...userData }));
      }

    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    error,
    updateUser
  };
}; 