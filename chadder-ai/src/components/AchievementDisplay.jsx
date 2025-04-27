import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGamification } from '../hooks/useGamification';
import styles from './AchievementDisplay.module.css';

const AchievementDisplay = () => {
  const { achievements, newAchievement } = useGamification();
  const [displayedAchievement, setDisplayedAchievement] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  
  // Show achievement popup when a new achievement is earned
  useEffect(() => {
    if (newAchievement) {
      setDisplayedAchievement(newAchievement);
      setShowPopup(true);
      
      // Hide popup after 5 seconds
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [newAchievement]);
  
  // Achievement popup component
  const AchievementPopup = () => {
    if (!displayedAchievement) return null;
    
    return (
      <AnimatePresence>
        {showPopup && (
          <motion.div 
            className={styles.achievementPopup}
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className={styles.popupIcon}>🏆</div>
            <div className={styles.popupContent}>
              <h3>Achievement Unlocked!</h3>
              <h4>{displayedAchievement.title}</h4>
              <p>{displayedAchievement.description}</p>
              <div className={styles.popupRewards}>
                <span>+{displayedAchievement.xp_reward} XP</span>
                {displayedAchievement.gem_reward > 0 && (
                  <span>+{displayedAchievement.gem_reward} 💎</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };
  
  return (
    <>
      <AchievementPopup />
    </>
  );
};

// Achievement list component for display on profile page
export const AchievementList = () => {
  const { achievements, loading } = useGamification();
  const [filter, setFilter] = useState('all'); // 'all', 'completed', 'in-progress'
  
  if (loading) {
    return <div className={styles.loading}>Loading achievements...</div>;
  }
  
  const completedAchievements = achievements.filter(a => a.completed);
  const inProgressAchievements = achievements.filter(a => !a.completed);
  
  const filteredAchievements = filter === 'all' 
    ? achievements 
    : filter === 'completed' 
      ? completedAchievements 
      : inProgressAchievements;
  
  return (
    <div className={styles.achievementListContainer}>
      <div className={styles.achievementStats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{completedAchievements.length}</span>
          <span className={styles.statLabel}>Completed</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{inProgressAchievements.length}</span>
          <span className={styles.statLabel}>In Progress</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{achievements.length}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>
      
      <div className={styles.filterButtons}>
        <button 
          className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button 
          className={`${styles.filterButton} ${filter === 'completed' ? styles.active : ''}`}
          onClick={() => setFilter('completed')}
        >
          Completed
        </button>
        <button 
          className={`${styles.filterButton} ${filter === 'in-progress' ? styles.active : ''}`}
          onClick={() => setFilter('in-progress')}
        >
          In Progress
        </button>
      </div>
      
      <div className={styles.achievementGrid}>
        {filteredAchievements.length === 0 ? (
          <div className={styles.noAchievements}>
            {filter === 'completed' 
              ? 'You haven\'t completed any achievements yet.' 
              : filter === 'in-progress' 
                ? 'No achievements in progress.' 
                : 'No achievements found.'}
          </div>
        ) : (
          filteredAchievements.map((userAchievement) => {
            const achievement = userAchievement.achievement;
            const progress = userAchievement.progress || 0;
            const total = achievement.requirement_count || 1;
            const progressPercent = Math.min((progress / total) * 100, 100);
            
            return (
              <motion.div 
                key={achievement.id}
                className={`${styles.achievementCard} ${userAchievement.completed ? styles.completed : ''}`}
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.2 }}
              >
                <div className={styles.achievementIcon}>
                  {userAchievement.completed ? '🏆' : '🔒'}
                </div>
                <div className={styles.achievementInfo}>
                  <h3>{achievement.title}</h3>
                  <p>{achievement.description}</p>
                  
                  {!userAchievement.completed && (
                    <div className={styles.achievementProgress}>
                      <div className={styles.progressBar}>
                        <div 
                          className={styles.progressFill} 
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className={styles.progressText}>
                        {progress} / {total}
                      </div>
                    </div>
                  )}
                  
                  {userAchievement.completed && (
                    <div className={styles.completedDate}>
                      Completed: {new Date(userAchievement.earned_at).toLocaleDateString()}
                    </div>
                  )}
                  
                  <div className={styles.achievementRewards}>
                    <span className={styles.xpReward}>+{achievement.xp_reward} XP</span>
                    {achievement.gem_reward > 0 && (
                      <span className={styles.gemReward}>+{achievement.gem_reward} 💎</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AchievementDisplay; 