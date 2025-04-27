import { useState, useEffect } from 'react';
import { useGamification } from '../hooks/useGamification';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import styles from './XpProgressBar.module.css';

const XpProgressBar = () => {
  const navigate = useNavigate();
  const { 
    progression, 
    xpProgress, 
    levelUpAnimation, 
    getNextLevelXp,
    loading 
  } = useGamification();
  
  // We need a local state to animate progress changes
  const [displayedProgress, setDisplayedProgress] = useState(0);
  
  // Update displayed progress when the actual progress changes
  useEffect(() => {
    if (!loading) {
      setDisplayedProgress(xpProgress);
    }
  }, [xpProgress, loading]);

  // Don't render anything until loading is complete
  if (loading || !progression) {
    return null;
  }
  
  const currentXp = progression.xp || 0;
  const nextLevelXp = getNextLevelXp;
  const xpNeeded = nextLevelXp - currentXp;
  
  return (
    <div className={styles.progressContainer} onClick={() => navigate('/profile')}>
      <AnimatePresence>
        {levelUpAnimation && (
          <motion.div 
            className={styles.levelUpAnimation}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
          >
            LEVEL UP!
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className={styles.progressBarWrapper}>
        <motion.div 
          className={styles.progressBar}
          initial={{ width: 0 }}
          animate={{ width: `${displayedProgress}%` }}
          transition={{ duration: 0.5 }}
        />
        <div className={styles.progressInfo}>
          <span className={styles.currentXp}>{currentXp}</span>
          <span className={styles.nextLevelXp}>{nextLevelXp}</span>
        </div>
      </div>
      
      <div className={styles.xpNeeded}>
        {xpNeeded} XP to next level
      </div>
    </div>
  );
};

export default XpProgressBar; 