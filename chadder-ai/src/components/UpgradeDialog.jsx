import React from 'react';
import styles from './UpgradeDialog.module.css';

export const UpgradeDialog = ({ currentPlan, newPlan, onCancel, onConfirm }) => {
  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.dialogContent}>
        <h2>Upgrade to {newPlan.name}</h2>
        
        <div className={styles.planComparison}>
          <div className={styles.currentPlan}>
            <h3>Current Plan</h3>
            <div className={styles.planDetails}>
              <p>{currentPlan.name}</p>
              <p>{currentPlan.votesPerWeek} votes/week</p>
              <p>${currentPlan.price}/week</p>
            </div>
          </div>

          <div className={styles.arrow}>→</div>

          <div className={styles.newPlan}>
            <h3>New Plan</h3>
            <div className={styles.planDetails}>
              <p>{newPlan.name}</p>
              <p>{newPlan.votesPerWeek} votes/week</p>
              <p>${newPlan.price}/week</p>
            </div>
          </div>
        </div>

        <div className={styles.changes}>
          <h3>Changes</h3>
          <ul>
            <li>Weekly votes will change from {currentPlan.votesPerWeek} to {newPlan.votesPerWeek}</li>
            <li>Higher credit rate: {newPlan.votesPerDollar} votes per $1</li>
            <li>All existing benefits</li>
          </ul>
        </div>

        <div className={styles.actions}>
          <button onClick={onCancel} className={styles.cancelButton}>
            Keep Current Plan
          </button>
          <button onClick={() => onConfirm(newPlan)} className={styles.upgradeButton}>
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
}; 