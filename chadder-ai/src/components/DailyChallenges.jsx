import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamification } from '../hooks/useGamification';
import styles from './DailyChallenges.module.css';

const ChallengeItem = ({ challenge, onClaim }) => {
  const progress = challenge.progress || 0;
  const total = challenge.challenge.requirement_count;
  const progressPercent = Math.min((progress / total) * 100, 100);
  
  return (
    <motion.div 
      className={`${styles.challengeItem} ${challenge.completed ? styles.completed : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.challengeHeader}>
        <h3>{challenge.challenge.title}</h3>
        {challenge.completed && !challenge.claimed && (
          <motion.button 
            className={styles.claimButton}
            onClick={() => onClaim(challenge.challenge_id, challenge.assigned_date)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Claim
          </motion.button>
        )}
        {challenge.claimed && (
          <span className={styles.claimedBadge}>Claimed</span>
        )}
      </div>
      
      <p className={styles.challengeDescription}>{challenge.challenge.description}</p>
      
      <div className={styles.challengeRewards}>
        <span className={styles.xpReward}>+{challenge.challenge.xp_reward} XP</span>
        {challenge.challenge.gem_reward > 0 && (
          <span className={styles.gemReward}>+{challenge.challenge.gem_reward} 💎</span>
        )}
      </div>
      
      <div className={styles.progressBarContainer}>
        <div className={styles.progressBar}>
          <motion.div 
            className={styles.progressFill}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className={styles.progressText}>
          {progress} / {total}
        </div>
      </div>
    </motion.div>
  );
};

const DailyChallenges = () => {
  const { dailyChallenges, claimChallenge, loading } = useGamification();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  
  // Restore visibility from localStorage on component mount
  useEffect(() => {
    const savedVisibility = localStorage.getItem('dailyChallengesVisible');
    if (savedVisibility !== null) {
      setIsVisible(savedVisibility === 'true');
    }
  }, []);
  
  const handleClaim = async (challengeId, assignedDate) => {
    await claimChallenge(challengeId, assignedDate);
  };
  
  const getCompletedCount = () => {
    if (!dailyChallenges) return 0;
    return dailyChallenges.filter(c => c.completed).length;
  };
  
  const getPendingClaimCount = () => {
    if (!dailyChallenges) return 0;
    return dailyChallenges.filter(c => c.completed && !c.claimed).length;
  };
  
  const toggleOpen = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  const hideButton = (e) => {
    e.stopPropagation();
    setIsVisible(false);
    setIsOpen(false);
    // Save preference to localStorage
    localStorage.setItem('dailyChallengesVisible', 'false');
  };
  
  // Don't render until challenges are loaded or if button is hidden
  if (loading || !dailyChallenges || dailyChallenges.length === 0 || !isVisible) {
    return null;
  }
  
  const hasClaimable = getPendingClaimCount() > 0;
  
  return (
    <div className={styles.dailyChallengesContainer}>
      <motion.div 
        className={`${styles.toggleButton} ${hasClaimable ? styles.hasPending : ''}`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className={styles.buttonContent} onClick={toggleOpen}>
          <span className={styles.challengeIcon}>🎯</span>
          <span className={styles.dailyText}>
            Daily Challenges {getCompletedCount()}/{dailyChallenges.length}
          </span>
          {hasClaimable && (
            <span className={styles.pendingBadge}>{getPendingClaimCount()}</span>
          )}
        </div>
        <button 
          className={styles.closeButton} 
          onClick={hideButton}
          aria-label="Hide daily challenges"
        >
          ✕
        </button>
      </motion.div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className={styles.challengesPanel}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2>Daily Challenges</h2>
            {dailyChallenges.map((challenge) => (
              <ChallengeItem 
                key={challenge.challenge_id + challenge.assigned_date} 
                challenge={challenge} 
                onClaim={handleClaim}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DailyChallenges; 