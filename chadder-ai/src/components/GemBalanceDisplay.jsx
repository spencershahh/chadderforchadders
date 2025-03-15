import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from './GemBalanceDisplay.module.css';

/**
 * Component to display the user's gem balance
 */
export default function GemBalanceDisplay() {
  const [gemBalance, setGemBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  
  useEffect(() => {
    // Get initial user and gem balance
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          await fetchGemBalance(user.id);
        } else {
          setIsLoading(false);
          setGemBalance(null);
        }
      } catch (error) {
        console.error('Error initializing gem balance:', error);
        setIsLoading(false);
      }
    }
    
    init();
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const newUserId = session?.user?.id || null;
        setUserId(newUserId);
        
        if (newUserId) {
          await fetchGemBalance(newUserId);
        } else {
          setGemBalance(null);
          setIsLoading(false);
        }
      }
    );
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // Set up real-time subscription when userId changes
  useEffect(() => {
    if (!userId) return;
    
    // Subscribe to changes in the user's gem balance
    const channel = supabase
      .channel(`public:users:id=eq.${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        if (payload.new && (payload.new.gem_balance !== undefined || payload.new.credits !== undefined)) {
          // Handle both gem_balance and credits (for backward compatibility)
          setGemBalance(payload.new.gem_balance !== undefined ? payload.new.gem_balance : payload.new.credits);
        }
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
  
  async function fetchGemBalance(uid) {
    if (!uid) return;
    
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('users')
        .select('gem_balance, credits')
        .eq('id', uid)
        .single();
        
      if (error) throw error;
      
      // Handle both gem_balance and credits (for backward compatibility)
      setGemBalance(data.gem_balance !== undefined ? data.gem_balance : data.credits || 0);
    } catch (error) {
      console.error('Error fetching gem balance:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  // Don't render anything if user is not logged in
  if (gemBalance === null && !isLoading) {
    return null;
  }
  
  return (
    <div className={styles.gemBalanceContainer}>
      {isLoading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <>
          <span className={styles.gemIcon}>💎</span>
          <span className={styles.balance}>{gemBalance}</span>
        </>
      )}
    </div>
  );
} 