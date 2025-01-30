import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useAuth = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get initial session
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateUser = async (formData) => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          displayName: formData.displayName,
          notifications: formData.notifications,
          theme: formData.theme
        }
      });

      if (error) throw error;

      // If you want to update additional user data in a separate table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: formData.displayName,
          email: formData.email,
          notifications: formData.notifications,
          theme: formData.theme,
          updated_at: new Date()
        });

      if (profileError) throw profileError;

    } catch (error) {
      throw error;
    }
  };

  return {
    user,
    updateUser
  };
}; 