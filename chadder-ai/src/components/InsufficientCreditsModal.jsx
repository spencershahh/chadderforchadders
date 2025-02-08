const InsufficientCreditsModal = ({ isOpen, onClose, requiredAmount, currentCredits, onPurchase }) => {
  if (!isOpen) return null;

  const neededCredits = requiredAmount - currentCredits;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Insufficient Gems</h3>
        <p className="modal-message">
          You need <span className="credits-amount">{neededCredits} more gems</span> to make this vote.
          <br />
          Current balance: {currentCredits} gems
        </p>
        <div className="modal-buttons">
          <button className="modal-button primary" onClick={onPurchase}>
            Get Gems
          </button>
          <button className="modal-button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsufficientCreditsModal; 