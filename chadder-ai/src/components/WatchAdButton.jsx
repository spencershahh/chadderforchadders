import { useState, useEffect } from 'react';
import { adService } from '../utils/adService';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import AdModal from './AdModal';
import styles from './WatchAdButton.module.css';

/**
 * Button component for watching ads to earn gems
 * @param {Object} props - Component props
 * @param {Function} props.onGemsEarned - Function to call when gems are earned
 */
export default function WatchAdButton({ onGemsEarned }) {
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [adStatus, setAdStatus] = useState({
    canWatchAd: false,
    adsRemaining: 0,
    cooldownRemaining: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [cooldownTimer, setCooldownTimer] = useState(null);
  
  useEffect(() => {
    // Initialize ad service and get user
    async function init() {
      try {
        await adService.initialize();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          checkAdStatus(user.id);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
        setIsLoading(false);
      }
    }
    
    init();
    
    // Set up user auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUserId(session?.user?.id || null);
        if (session?.user?.id) {
          checkAdStatus(session.user.id);
        } else {
          setIsLoading(false);
          setAdStatus({
            canWatchAd: false,
            adsRemaining: 0,
            cooldownRemaining: 0
          });
        }
      }
    );
    
    return () => {
      subscription.unsubscribe();
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
      }
    };
  }, []);
  
  // Check if user can watch ad and update status
  async function checkAdStatus(uid) {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const status = await adService.getAdStatus(uid);
      setAdStatus(status);
      
      // Start cooldown timer if needed
      if (status.cooldownRemaining > 0) {
        startCooldownTimer();
      }
    } catch (error) {
      console.error('Error checking ad status:', error);
      toast.error('Failed to check ad availability');
    } finally {
      setIsLoading(false);
    }
  }
  
  function startCooldownTimer() {
    // Clear any existing timer
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
    }
    
    const timer = setInterval(() => {
      setAdStatus(prev => {
        if (prev.cooldownRemaining <= 1) {
          clearInterval(timer);
          return {
            ...prev,
            cooldownRemaining: 0,
            canWatchAd: prev.adsRemaining > 0
          };
        }
        return {
          ...prev,
          cooldownRemaining: prev.cooldownRemaining - 1
        };
      });
    }, 1000);
    
    setCooldownTimer(timer);
  }
  
  function handleWatchAdClick() {
    if (!userId) {
      toast.error('Please sign in to watch ads and earn gems');
      return;
    }
    
    if (!adStatus.canWatchAd) {
      if (adStatus.adsRemaining <= 0) {
        toast.error('You\'ve reached your daily ad limit. Come back tomorrow!');
      } else if (adStatus.cooldownRemaining > 0) {
        toast.error(`Please wait ${adStatus.cooldownRemaining} seconds before watching another ad`);
      }
      return;
    }
    
    setIsAdModalOpen(true);
  }
  
  function handleAdSuccess(gemsEarned) {
    // Update local state
    setAdStatus(prev => ({
      ...prev,
      adsRemaining: Math.max(0, prev.adsRemaining - 1),
      canWatchAd: false,
      cooldownRemaining: 30
    }));
    
    startCooldownTimer();
    
    // Callback to parent component
    if (onGemsEarned) {
      onGemsEarned(gemsEarned);
    }
    
    // Refresh data
    if (userId) {
      checkAdStatus(userId);
    }
  }
  
  let buttonText = 'Watch Ad to Earn 10 Gems';
  if (isLoading) {
    buttonText = 'Loading...';
  } else if (adStatus.adsRemaining <= 0) {
    buttonText = 'No ads left today';
  } else if (adStatus.cooldownRemaining > 0) {
    buttonText = `Wait ${adStatus.cooldownRemaining}s`;
  } else if (adStatus.adsRemaining < 5) {
    buttonText = `Watch Ad to Earn 10 Gems (${adStatus.adsRemaining} left)`;
  }
  
  return (
    <div className={styles.watchAdContainer}>
      <button
        className={styles.watchAdButton}
        onClick={handleWatchAdClick}
        disabled={isLoading || !adStatus.canWatchAd}
      >
        {buttonText}
      </button>
      
      <AdModal
        isOpen={isAdModalOpen}
        onClose={() => setIsAdModalOpen(false)}
        onSuccess={handleAdSuccess}
      />
    </div>
  );
} 