import { useState } from 'react';
import WatchAdButton from './WatchAdButton';
import { supabase } from '../supabaseClient';

const InsufficientCreditsModal = ({ isOpen, onClose, requiredAmount, currentCredits, onPurchase }) => {
  const [showAdOption, setShowAdOption] = useState(false);
  
  if (!isOpen) return null;

  const neededCredits = requiredAmount - currentCredits;
  
  const handleGemsEarned = async () => {
    // Refresh the current credits from the database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('gem_balance, credits')
          .eq('id', user.id)
          .single();
          
        if (!error && data) {
          // If we've earned enough gems, close the modal
          const updatedBalance = data.gem_balance !== undefined ? data.gem_balance : data.credits || 0;
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
        <h3 className="modal-title">Insufficient Gems</h3>
        <p className="modal-message">
          You need <span className="credits-amount">{neededCredits} more gems</span> to make this vote.
          <br />
          Current balance: {currentCredits} gems
        </p>
        
        {showAdOption ? (
          <div className="ad-option-container">
            <p>Watch ads to earn gems:</p>
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
          <div className="modal-buttons">
            <button className="modal-button primary" onClick={onPurchase}>
              Buy Gems
            </button>
            <button 
              className="modal-button secondary" 
              onClick={() => setShowAdOption(true)}
            >
              Watch Ads
            </button>
            <button className="modal-button tertiary" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsufficientCreditsModal; 