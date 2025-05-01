import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import { useAuth } from './AuthProvider';

// XP required for each level (follows a logarithmic progression)
const XP_REQUIREMENTS = [
  0,      // Level 1 (starting)
  100,    // Level 2
  300,    // Level 3
  600,    // Level 4
  1000,   // Level 5
  1500,   // Level 6
  2100,   // Level 7
  2800,   // Level 8
  3600,   // Level 9
  4500,   // Level 10
  5500,   // Level 11
  6600,   // Level 12
  7800,   // Level 13
  9100,   // Level 14
  10500,  // Level 15
  12000,  // Level 16
  13600,  // Level 17
  15300,  // Level 18
  17100,  // Level 19
  19000,  // Level 20
];

// Calculate XP needed for a specific level
const getXpForLevel = (level) => {
  if (level <= XP_REQUIREMENTS.length) {
    return XP_REQUIREMENTS[level - 1];
  }
  // For levels beyond our predefined table, use a formula
  return Math.floor(1000 * Math.pow(level, 1.8));
};

export function useGamification() {
  const { user } = useAuth();
  const [progression, setProgression] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [dailyChallenges, setDailyChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelUpAnimation, setLevelUpAnimation] = useState(false);
  const [newAchievement, setNewAchievement] = useState(null);

  // Initialize gamification system
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const initGamification = async () => {
      try {
        setLoading(true);
        await Promise.all([
          fetchUserProgression(),
          fetchUserAchievements(),
          fetchDailyChallenges(),
        ]);

        // Update login streak and record login
        await recordLogin();
      } catch (error) {
        console.error('Error initializing gamification:', error);
      } finally {
        setLoading(false);
      }
    };

    initGamification();

    // Subscription for real-time updates
    const progressionSubscription = supabase
      .channel('progression-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_progression',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setProgression(payload.new);
          }
        }
      )
      .subscribe();

    const achievementsSubscription = supabase
      .channel('achievements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUserAchievements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(progressionSubscription);
      supabase.removeChannel(achievementsSubscription);
    };
  }, [user]);

  // Fetch user progression data
  const fetchUserProgression = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_progression')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProgression(data);
      } else {
        // Create progression record if it doesn't exist
        const { data: newData, error: insertError } = await supabase
          .from('user_progression')
          .insert([{ user_id: user.id }])
          .select()
          .single();

        if (insertError) throw insertError;
        setProgression(newData);
      }
    } catch (error) {
      console.error('Error fetching user progression:', error);
    }
  };

  // Fetch user achievements
  const fetchUserAchievements = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          *,
          achievement:achievements(*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      setAchievements(data || []);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
    }
  };

  // Fetch daily challenges
  const fetchDailyChallenges = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // First check if user already has challenges assigned for today
      const { data: existingChallenges, error: existingError } = await supabase
        .from('user_daily_challenges')
        .select(`
          *,
          challenge:daily_challenges(*)
        `)
        .eq('user_id', user.id)
        .eq('assigned_date', today);

      if (existingError) throw existingError;

      if (existingChallenges && existingChallenges.length > 0) {
        setDailyChallenges(existingChallenges);
        return;
      }

      // If no challenges assigned, get random challenges and assign them
      const { data: availableChallenges, error: challengesError } = await supabase
        .from('daily_challenges')
        .select('*');

      if (challengesError) throw challengesError;

      // Select 3 random challenges
      const selectedChallenges = getRandomItems(availableChallenges, 3);
      
      // Assign them to the user
      const challengesToInsert = selectedChallenges.map(challenge => ({
        user_id: user.id,
        challenge_id: challenge.id,
        assigned_date: today,
      }));

      const { error: insertError } = await supabase
        .from('user_daily_challenges')
        .insert(challengesToInsert);

      if (insertError) throw insertError;

      // Fetch the newly assigned challenges
      await fetchDailyChallenges();
    } catch (error) {
      console.error('Error fetching daily challenges:', error);
    }
  };

  // Record user login and update streak
  const recordLogin = async () => {
    if (!user || !progression) return;

    try {
      const today = new Date();
      const lastLogin = progression.last_login_date 
        ? new Date(progression.last_login_date) 
        : null;

      let newStreak = progression.daily_streak || 0;
      let awardedXp = 0;

      // Check if this is a consecutive day login
      if (lastLogin) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Check if last login was yesterday
        if (lastLogin.toDateString() === yesterday.toDateString()) {
          newStreak += 1;
          awardedXp = 10 * newStreak; // More XP for longer streaks
          
          // Check for streak achievements
          if (newStreak === 7) {
            // Award the 7-day streak achievement
            const { data: streakAchievement } = await supabase
              .from('achievements')
              .select('*')
              .eq('achievement_type', 'login_streak')
              .eq('requirement_count', 7)
              .single();
              
            if (streakAchievement) {
              await awardAchievement(streakAchievement.id);
            }
          }
        } 
        // If not yesterday but still today, don't update anything
        else if (lastLogin.toDateString() === today.toDateString()) {
          return;
        }
        // Otherwise, reset streak
        else {
          newStreak = 1;
          awardedXp = 10;
        }
      } else {
        // First login ever
        newStreak = 1;
        awardedXp = 10;
        
        // Award first login achievement
        const { data: firstLoginAchievement } = await supabase
          .from('achievements')
          .select('*')
          .eq('achievement_type', 'login')
          .eq('requirement_count', 1)
          .single();
          
        if (firstLoginAchievement) {
          await awardAchievement(firstLoginAchievement.id);
        }
      }

      // Update the progression
      await updateProgression({
        daily_streak: newStreak,
        last_login_date: today.toISOString(),
        xp: (progression.xp || 0) + awardedXp
      });

    } catch (error) {
      console.error('Error recording login:', error);
    }
  };

  // Track when user levels up to trigger level_reached achievements
  const checkLevelAchievements = async (newLevel) => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('achievement_type', 'level_reached')
        .lte('requirement_count', newLevel);
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        for (const achievement of data) {
          await awardAchievement(achievement.id);
        }
      }
    } catch (error) {
      console.error('Error checking level achievements:', error);
    }
  };

  // Award XP to the user
  const awardXp = async (amount, reason = '') => {
    if (!user || !progression) return;

    try {
      const newXp = progression.xp + amount;
      let newLevel = progression.level;
      let didLevelUp = false;
      
      // Check if user leveled up
      const nextLevelXp = getXpForLevel(newLevel + 1);
      if (newXp >= nextLevelXp) {
        newLevel++;
        didLevelUp = true;
        
        // Award gems for leveling up
        await awardGems(5, `Level up to level ${newLevel}`);
        
        // Set level up animation
        setLevelUpAnimation({ 
          show: true, 
          level: newLevel 
        });
        
        // Hide animation after 3 seconds
        setTimeout(() => {
          setLevelUpAnimation({ show: false, level: 0 });
        }, 3000);

        // Check for level-based achievements
        await checkLevelAchievements(newLevel);
      }
      
      // Update user progression
      await updateProgression({
        xp: newXp,
        level: newLevel
      });
      
      if (reason) {
        toast.success(`+${amount} XP: ${reason}`);
      }
      
      return { xp: newXp, level: newLevel, leveledUp: didLevelUp };
    } catch (error) {
      console.error('Error awarding XP:', error);
      return null;
    }
  };

  // Award gems to the user
  const awardGems = async (amount, reason = '') => {
    if (!user) return;

    try {
      // Get current gem balance
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gem_balance')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      const currentBalance = userData.gem_balance || 0;
      const newBalance = currentBalance + amount;

      // Update gem balance
      const { error: updateError } = await supabase
        .from('users')
        .update({ gem_balance: newBalance })
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (reason) {
        toast.success(`+${amount} 💎: ${reason}`);
      }

      return newBalance;
    } catch (error) {
      console.error('Error awarding gems:', error);
      return null;
    }
  };

  // Update user progression
  const updateProgression = async (updates) => {
    if (!user) return;
    
    try {
      // Add the update timestamp
      updates.updated_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('user_progression')
        .update(updates)
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      // Update local state
      setProgression(prev => ({
        ...prev,
        ...updates
      }));
      
      return true;
    } catch (error) {
      console.error('Error updating progression:', error);
      return false;
    }
  };

  // Award an achievement to the user
  const awardAchievement = async (achievementId) => {
    if (!user) return;

    try {
      // Check if user already has this achievement
      const { data: existingAchievement, error: existingError } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', user.id)
        .eq('achievement_id', achievementId)
        .single();

      if (existingError && existingError.code !== 'PGRST116') throw existingError;

      if (existingAchievement && existingAchievement.completed) {
        // Already completed
        return null;
      }

      // Get achievement details
      const { data: achievement, error: achievementError } = await supabase
        .from('achievements')
        .select('*')
        .eq('id', achievementId)
        .single();

      if (achievementError) throw achievementError;

      if (existingAchievement) {
        // Increase progress
        const newProgress = (existingAchievement.progress || 0) + 1;
        const completed = newProgress >= achievement.requirement_count;

        const { error: updateError } = await supabase
          .from('user_achievements')
          .update({
            progress: newProgress,
            completed,
            earned_at: completed ? new Date().toISOString() : existingAchievement.earned_at
          })
          .eq('user_id', user.id)
          .eq('achievement_id', achievementId);

        if (updateError) throw updateError;

        if (completed) {
          // Award XP and gems
          await awardXp(achievement.xp_reward, `Achievement: ${achievement.title}`);
          
          if (achievement.gem_reward > 0) {
            await awardGems(achievement.gem_reward, `Achievement: ${achievement.title}`);
          }
          
          // Show achievement notification
          setNewAchievement(achievement);
          setTimeout(() => setNewAchievement(null), 5000);
          
          return achievement;
        }
      } else {
        // Create new user achievement record
        const completed = 1 >= achievement.requirement_count;
        
        const { error: insertError } = await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_id: achievementId,
            progress: 1,
            completed,
            earned_at: completed ? new Date().toISOString() : null
          });

        if (insertError) throw insertError;

        if (completed) {
          // Award XP and gems
          await awardXp(achievement.xp_reward, `Achievement: ${achievement.title}`);
          
          if (achievement.gem_reward > 0) {
            await awardGems(achievement.gem_reward, `Achievement: ${achievement.title}`);
          }
          
          // Show achievement notification
          setNewAchievement(achievement);
          setTimeout(() => setNewAchievement(null), 5000);
          
          return achievement;
        }
      }

      return null;
    } catch (error) {
      console.error('Error awarding achievement:', error);
      return null;
    }
  };

  // Update challenge progress
  const updateChallengeProgress = async (challengeType, amount = 1) => {
    if (!user || !dailyChallenges.length) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Find challenges of this type
      const relevantChallenges = dailyChallenges.filter(
        challenge => challenge.challenge.challenge_type === challengeType && !challenge.completed
      );
      
      for (const userChallenge of relevantChallenges) {
        const challenge = userChallenge.challenge;
        const newProgress = (userChallenge.progress || 0) + amount;
        const completed = newProgress >= challenge.requirement_count;
        
        const { error } = await supabase
          .from('user_daily_challenges')
          .update({
            progress: newProgress,
            completed
          })
          .eq('user_id', user.id)
          .eq('challenge_id', challenge.id)
          .eq('assigned_date', today);
          
        if (error) throw error;
        
        if (completed && !userChallenge.claimed) {
          toast.success(`🎯 Challenge completed: ${challenge.title}`);
        }
      }
      
      // Refresh challenges
      await fetchDailyChallenges();
    } catch (error) {
      console.error('Error updating challenge progress:', error);
    }
  };

  // Claim a completed challenge
  const claimChallenge = async (challengeId, assignedDate) => {
    if (!user) return;

    try {
      // Find the challenge in our state
      const userChallenge = dailyChallenges.find(
        c => c.challenge_id === challengeId && c.assigned_date === assignedDate
      );
      
      if (!userChallenge || !userChallenge.completed || userChallenge.claimed) {
        return false;
      }
      
      const challenge = userChallenge.challenge;
      
      // Mark as claimed
      const { error } = await supabase
        .from('user_daily_challenges')
        .update({ claimed: true })
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .eq('assigned_date', assignedDate);
        
      if (error) throw error;
      
      // Award rewards
      await awardXp(challenge.xp_reward, `Challenge: ${challenge.title}`);
      
      if (challenge.gem_reward > 0) {
        await awardGems(challenge.gem_reward, `Challenge: ${challenge.title}`);
      }
      
      // Update challenges_completed count in progression
      const updatedCount = (progression?.total_challenges_completed || 0) + 1;
      await updateProgression({ total_challenges_completed: updatedCount });
      
      // Check for challenge completion achievements
      const { data: challengeAchievements, error: achError } = await supabase
        .from('achievements')
        .select('*')
        .eq('achievement_type', 'challenges_completed')
        .lte('requirement_count', updatedCount);
        
      if (achError) throw achError;
      
      if (challengeAchievements && challengeAchievements.length > 0) {
        for (const achievement of challengeAchievements) {
          await awardAchievement(achievement.id);
        }
      }
      
      // Refresh challenges
      await fetchDailyChallenges();
      
      return true;
    } catch (error) {
      console.error('Error claiming challenge:', error);
      return false;
    }
  };

  // Track activity and award progress - key function for integrating with app
  const trackActivity = async (activityType, amount = 1, metadata = {}) => {
    if (!user) return;

    try {
      // Update appropriate progression stat
      const progressionUpdates = {};
      
      switch (activityType) {
        case 'watch_stream':
          progressionUpdates.total_watch_time = (progression?.total_watch_time || 0) + amount;
          await updateChallengeProgress('streams_watched', 1);
          await awardXp(5, 'Watched a stream');
          break;
          
        case 'send_chat':
          progressionUpdates.total_chats_sent = (progression?.total_chats_sent || 0) + amount;
          await updateChallengeProgress('chats_sent', amount);
          await awardXp(2 * amount, 'Chat participation');
          break;
          
        case 'vote':
          progressionUpdates.total_votes = (progression?.total_votes || 0) + amount;
          await updateChallengeProgress('votes_cast', amount);
          await awardXp(10 * amount, 'Supported a streamer');
          break;
          
        case 'dig_deeper':
          progressionUpdates.total_dig_deeper_uses = (progression?.total_dig_deeper_uses || 0) + amount;
          await updateChallengeProgress('dig_deeper_uses', amount);
          await awardXp(3 * amount, 'Used Dig Deeper');
          break;
          
        default:
          console.warn('Unknown activity type:', activityType);
          return;
      }
      
      // Update progression if we have updates
      if (Object.keys(progressionUpdates).length > 0) {
        await updateProgression(progressionUpdates);
      }
      
      // Check for achievements based on activity type and counts
      const relevantAchievements = await getAchievementsForActivity(activityType);
      
      for (const achievement of relevantAchievements) {
        await awardAchievement(achievement.id);
      }
      
    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  };

  // Get achievements relevant to an activity type
  const getAchievementsForActivity = async (activityType) => {
    try {
      let achievementType;
      
      switch (activityType) {
        case 'watch_stream': achievementType = 'streams_watched'; break;
        case 'send_chat': achievementType = 'chats_sent'; break;
        case 'vote': achievementType = 'votes_cast'; break;
        case 'dig_deeper': achievementType = 'dig_deeper_uses'; break;
        default: return [];
      }
      
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('achievement_type', achievementType);
        
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error getting achievements for activity:', error);
      return [];
    }
  };

  // Helper function to get random items from array
  const getRandomItems = (array, count) => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  return {
    progression,
    achievements,
    dailyChallenges,
    loading,
    levelUpAnimation,
    newAchievement,
    
    // Methods
    awardXp,
    awardGems,
    awardAchievement,
    updateChallengeProgress,
    claimChallenge,
    trackActivity,
    
    // XP helpers
    getXpForLevel,
    getNextLevelXp: progression ? getXpForLevel(progression.level + 1) : 100,
    
    // Calculated properties
    xpProgress: progression ? (progression.xp - getXpForLevel(progression.level)) / 
      (getXpForLevel(progression.level + 1) - getXpForLevel(progression.level)) * 100 : 0
  };
} 