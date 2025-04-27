import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { AchievementList } from '../components/AchievementDisplay';
import { motion } from 'framer-motion';
import styles from './Profile.module.css';

const Profile = () => {
  const { progression, loading, xpProgress } = useGamification();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'achievements', 'stats'
  
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading your profile...</p>
      </div>
    );
  }
  
  const level = progression?.level || 1;
  const xp = progression?.xp || 0;
  const streak = progression?.daily_streak || 0;
  
  return (
    <div className={styles.profileContainer}>
      <header className={styles.profileHeader}>
        <h1>Your Profile</h1>
        <div className={styles.profileStats}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{level}</div>
            <div className={styles.statLabel}>Level</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{xp}</div>
            <div className={styles.statLabel}>XP</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{streak}</div>
            <div className={styles.statLabel}>Day Streak</div>
          </div>
        </div>
        
        <div className={styles.xpProgressContainer}>
          <div className={styles.xpProgressLabel}>
            <span>Level Progress</span>
            <span>{Math.round(xpProgress)}%</span>
          </div>
          <div className={styles.xpProgressBar}>
            <motion.div 
              className={styles.xpProgressFill}
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </header>
      
      <nav className={styles.profileNav}>
        <button 
          className={`${styles.navButton} ${activeTab === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`${styles.navButton} ${activeTab === 'achievements' ? styles.active : ''}`}
          onClick={() => setActiveTab('achievements')}
        >
          Achievements
        </button>
        <button 
          className={`${styles.navButton} ${activeTab === 'stats' ? styles.active : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </nav>
      
      <main className={styles.profileContent}>
        {activeTab === 'overview' && (
          <div className={styles.overviewSection}>
            <div className={styles.overviewCard}>
              <h2>Daily Login Streak</h2>
              <div className={styles.streakDisplay}>
                <div className={styles.streakValue}>{streak}</div>
                <div className={styles.streakLabel}>DAYS</div>
              </div>
              <p className={styles.streakInfo}>
                {streak === 0 
                  ? "Start your streak by logging in daily!" 
                  : `You've logged in for ${streak} consecutive days!`}
              </p>
              <div className={styles.streakRewardInfo}>
                <h3>Upcoming Rewards</h3>
                <ul className={styles.rewardsList}>
                  <li className={streak >= 1 ? styles.achieved : ''}>
                    <span>Day 1:</span> <span>5 Gems</span>
                  </li>
                  <li className={streak >= 3 ? styles.achieved : ''}>
                    <span>Day 3:</span> <span>15 Gems</span>
                  </li>
                  <li className={streak >= 7 ? styles.achieved : ''}>
                    <span>Day 7:</span> <span>50 Gems + Special Emote</span>
                  </li>
                  <li className={streak >= 14 ? styles.achieved : ''}>
                    <span>Day 14:</span> <span>100 Gems + Profile Badge</span>
                  </li>
                  <li className={streak >= 30 ? styles.achieved : ''}>
                    <span>Day 30:</span> <span>250 Gems + Exclusive Channel Feature</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className={styles.overviewCard}>
              <h2>Gems & Credits</h2>
              <div className={styles.resourceButtons}>
                <Link to="/gems" className={styles.resourceButton}>
                  <span className={styles.resourceIcon}>💎</span>
                  <span>Get More Gems</span>
                </Link>
                <Link to="/credits" className={styles.resourceButton}>
                  <span className={styles.resourceIcon}>🪙</span>
                  <span>Get More Credits</span>
                </Link>
              </div>
            </div>
            
            <div className={styles.overviewCard}>
              <h2>Recent Achievements</h2>
              <div className={styles.recentAchievements}>
                {progression && progression.achievements && progression.achievements.length > 0 ? (
                  progression.achievements
                    .filter(a => a.completed)
                    .sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at))
                    .slice(0, 3)
                    .map(achievement => (
                      <div key={achievement.id} className={styles.recentAchievement}>
                        <div className={styles.achievementIcon}>🏆</div>
                        <div className={styles.achievementDetails}>
                          <h3>{achievement.title}</h3>
                          <p>{achievement.description}</p>
                          <span className={styles.achievementDate}>
                            {new Date(achievement.earned_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className={styles.noAchievements}>
                    You haven't earned any achievements yet. Complete activities to earn achievements!
                  </p>
                )}
                <button 
                  className={styles.viewAllButton}
                  onClick={() => setActiveTab('achievements')}
                >
                  View All Achievements
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'achievements' && (
          <div className={styles.achievementsSection}>
            <AchievementList />
          </div>
        )}
        
        {activeTab === 'stats' && (
          <div className={styles.statsSection}>
            <div className={styles.statsGrid}>
              <div className={styles.statBlock}>
                <div className={styles.statBlockIcon}>👁️</div>
                <div className={styles.statBlockValue}>{progression?.total_watch_time || 0}</div>
                <div className={styles.statBlockLabel}>Streams Watched</div>
              </div>
              
              <div className={styles.statBlock}>
                <div className={styles.statBlockIcon}>💬</div>
                <div className={styles.statBlockValue}>{progression?.total_chats_sent || 0}</div>
                <div className={styles.statBlockLabel}>Chat Messages</div>
              </div>
              
              <div className={styles.statBlock}>
                <div className={styles.statBlockIcon}>❤️</div>
                <div className={styles.statBlockValue}>{progression?.total_votes || 0}</div>
                <div className={styles.statBlockLabel}>Votes Cast</div>
              </div>
              
              <div className={styles.statBlock}>
                <div className={styles.statBlockIcon}>🔍</div>
                <div className={styles.statBlockValue}>{progression?.total_dig_deeper_uses || 0}</div>
                <div className={styles.statBlockLabel}>Dig Deeper Uses</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;