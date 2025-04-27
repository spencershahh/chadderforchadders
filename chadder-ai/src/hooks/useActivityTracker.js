import { useCallback } from 'react';
import { useGamificationContext } from './GamificationProvider';
import { useAuth } from './AuthProvider';

/**
 * Custom hook for tracking user activities
 */
export function useActivityTracker() {
  const { trackActivity } = useGamificationContext();
  const { user } = useAuth();
  
  /**
   * Track when a user watches a stream
   * @param {string} streamerId - The ID of the streamer being watched
   * @param {string} streamerUsername - The username of the streamer
   */
  const trackStreamWatch = useCallback((streamerId, streamerUsername) => {
    if (!user) return;
    
    trackActivity('watch_stream', 1, { 
      streamerId,
      streamerUsername
    });
  }, [user, trackActivity]);
  
  /**
   * Track when a user sends a chat message
   * @param {string} streamerId - The ID of the streamer's chat
   * @param {number} messageCount - Number of messages (default 1)
   */
  const trackChatMessage = useCallback((streamerId, messageCount = 1) => {
    if (!user) return;
    
    trackActivity('send_chat', messageCount, { 
      streamerId
    });
  }, [user, trackActivity]);
  
  /**
   * Track when a user votes for a streamer
   * @param {string} streamerId - The ID of the streamer
   * @param {number} amount - The amount of votes/gems used
   */
  const trackVote = useCallback((streamerId, amount = 1) => {
    if (!user) return;
    
    trackActivity('vote', amount, { 
      streamerId,
      amount
    });
  }, [user, trackActivity]);
  
  /**
   * Track when a user uses Dig Deeper feature
   * @param {number} count - Number of dig deeper uses (default 1)
   */
  const trackDigDeeper = useCallback((count = 1) => {
    if (!user) return;
    
    trackActivity('dig_deeper', count);
  }, [user, trackActivity]);
  
  return {
    trackStreamWatch,
    trackChatMessage,
    trackVote,
    trackDigDeeper
  };
} 