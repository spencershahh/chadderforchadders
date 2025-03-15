import { useState, useEffect } from 'react';
import { adService } from '../utils/adService';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import styles from './AdModal.module.css';

/**
 * Modal component for displaying rewarded ads
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to call when the modal is closed
 * @param {Function} props.onSuccess - Function to call when an ad is successfully watched
 */
export default function AdModal({ isOpen, onClose, onSuccess }) {
  const [adState, setAdState] = useState('initial'); // initial, loading, ready, playing, completed, cancelled, error
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    if (isOpen && adState === 'initial') {
      loadAd();
    }
  }, [isOpen]);
  
  async function loadAd() {
    try {
      setAdState('loading');
      await adService.loadAd();
      setAdState('ready');
      showAd();
    } catch (error) {
      console.error('Ad loading error:', error);
      setAdState('error');
      toast.error('Failed to load ad. Please try again.');
    }
  }
  
  async function showAd() {
    try {
      setAdState('playing');
      const completed = await adService.showAd();
      
      if (completed) {
        setAdState('completed');
        setIsProcessing(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          throw new Error('User not authenticated');
        }
        
        // Award gems
        const success = await adService.awardGemsForAd(user.id);
        
        setIsProcessing(false);
        if (success) {
          toast.success('You earned 10 gems! 💎');
          onSuccess(10);
        } else {
          toast.error('Failed to award gems. Please try again later.');
        }
      } else {
        setAdState('cancelled');
        toast.error('Ad viewing was not completed. No gems awarded.');
      }
    } catch (error) {
      console.error('Ad showing error:', error);
      setAdState('error');
      toast.error('Error showing ad. Please try again.');
    }
  }
  
  if (!isOpen) return null;
  
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <button 
          className={styles.closeButton}
          onClick={onClose}
          disabled={adState === 'playing' || isProcessing}
        >
          ×
        </button>
        
        <div className={styles.adContainer}>
          {adState === 'initial' && (
            <div className={styles.adMessage}>
              <h3>Watch Ad for Gems</h3>
              <p>Watch a short ad to earn 10 gems!</p>
            </div>
          )}
          
          {adState === 'loading' && (
            <div className={styles.adMessage}>
              <h3>Loading Ad</h3>
              <div className={styles.loader}></div>
              <p>Please wait while we load your ad...</p>
            </div>
          )}
          
          {adState === 'playing' && (
            <div className={styles.adMessage}>
              <h3>Ad Playing</h3>
              <p>Please watch the entire ad to receive your gems.</p>
            </div>
          )}
          
          {adState === 'completed' && (
            <div className={styles.adMessage}>
              <h3>Thank You!</h3>
              {isProcessing ? (
                <>
                  <div className={styles.loader}></div>
                  <p>Processing your reward...</p>
                </>
              ) : (
                <>
                  <div className={styles.successIcon}>✓</div>
                  <p>You've earned 10 gems! 💎</p>
                  <button 
                    className={styles.doneButton}
                    onClick={onClose}
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          )}
          
          {adState === 'cancelled' && (
            <div className={styles.adMessage}>
              <h3>Ad Not Completed</h3>
              <p>You need to watch the entire ad to receive gems.</p>
              <button 
                className={styles.retryButton}
                onClick={loadAd}
              >
                Try Again
              </button>
            </div>
          )}
          
          {adState === 'error' && (
            <div className={styles.adMessage}>
              <h3>Error Loading Ad</h3>
              <p>Something went wrong. Please try again later.</p>
              <button 
                className={styles.retryButton}
                onClick={loadAd}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 