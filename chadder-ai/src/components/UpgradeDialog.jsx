import './UpgradeDialog.css'

export function UpgradeDialog({ currentPlan, newPlan, onCancel, onConfirm }) {
  if (!currentPlan || !newPlan) {
    console.error('Missing plan data:', { currentPlan, newPlan });
    return null;
  }

  const planDifference = newPlan.credits - currentPlan.credits;
  
  return (
    <div className="upgrade-dialog-backdrop">
      <div className="upgrade-dialog">
        <h2>Upgrade to {newPlan.name}</h2>
        
        <div className="plan-comparison">
          <div className="current-plan">
            <span className="plan-label">Current Plan</span>
            <h3>{currentPlan.name}</h3>
            <p className="credits">{currentPlan.credits} credits/month</p>
            <p className="price">${currentPlan.price}/week</p>
          </div>
          
          <div className="upgrade-arrow">→</div>
          
          <div className="new-plan">
            <span className="plan-label">New Plan</span>
            <h3>{newPlan.name}</h3>
            <p className="credits">{newPlan.credits} credits/month</p>
            <p className="price">${newPlan.price}/week</p>
          </div>
        </div>

        <div className="benefits">
          <h4>You'll Get</h4>
          <ul>
            <li>+{planDifference} additional credits monthly</li>
            <li>Higher credit rate ({newPlan.creditsPerDollar} credits/$)</li>
            <li>All existing benefits</li>
          </ul>
        </div>

        <div className="dialog-actions">
          <button className="cancel-button" onClick={onCancel}>
            Keep Current Plan
          </button>
          <button className="confirm-button" onClick={onConfirm}>
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  )
} 