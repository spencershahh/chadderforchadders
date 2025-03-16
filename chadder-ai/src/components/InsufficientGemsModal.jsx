import { useState, useEffect } from 'react';
import WatchAdButton from './WatchAdButton';
import { supabase } from '../supabaseClient';

const InsufficientGemsModal = ({ isOpen, onClose, requiredAmount, currentCredits, onPurchase }) => {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [currentGemBalance, setCurrentGemBalance] = useState(currentCredits);
  const [showAdOption, setShowAdOption] = useState(false);
  
  const neededGems = requiredAmount - currentGemBalance;
  
  useEffect(() => {
    // Refresh the current gem balance from the database
    const refreshGemBalance = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data, error } = await supabase
          .from('users')
          .select('gem_balance')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        
        setCurrentGemBalance(data.gem_balance || 0);
      } catch (err) {
        console.error('Error fetching gem balance:', err);
      }
    };
    
    if (isOpen) {
      setIsVisible(true);
      refreshGemBalance();
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);
  
  if (!isVisible) return null;

  const handleGemsEarned = async () => {
    // Refresh the current credits from the database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('gem_balance')
          .eq('id', user.id)
          .single();
          
        if (!error && data) {
          // If we've earned enough gems, close the modal
          const updatedBalance = data.gem_balance || 0;
          if (updatedBalance >= requiredAmount) {
            onClose();
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing gem balance:', error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {showAdOption ? (
          <div className="ad-option-container">
            <h3>Watch an Ad for Gems</h3>
            <p>You can earn gems by watching a short advertisement</p>
            <WatchAdButton onGemsEarned={handleGemsEarned} />
            <button 
              className="modal-button secondary" 
              onClick={() => setShowAdOption(false)}
              style={{ marginTop: '10px' }}
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <h3>Insufficient Gems</h3>
              <button className="close-button" onClick={onClose}>×</button>
            </div>
            <div className="modal-body">
              <p>
                You need <span className="gems-amount">{neededGems} more gems</span> to make this vote.
              </p>
              <p>
                Current balance: {currentGemBalance} gems
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-button secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="modal-button primary" onClick={onPurchase}>
                Buy Gems
              </button>
              <button 
                className="modal-button secondary" 
                onClick={() => setShowAdOption(true)}
              >
                Watch Ad
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InsufficientGemsModal; 