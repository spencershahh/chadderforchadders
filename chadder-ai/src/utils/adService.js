import { supabase } from '../supabaseClient';

/**
 * Ad Service for managing rewarded ads
 * Handles integration with Google AdSense for web
 */
class AdService {
  constructor() {
    this.isInitialized = false;
    this.adUnitId = import.meta.env.VITE_ADSENSE_AD_UNIT_ID;
    this.adProvider = 'adsense';
    this.gemsPerAd = 10; // Default gems awarded per ad
    this.adInstance = null;
  }
  
  /**
   * Initialize the ad service and load the Google AdSense SDK
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize() {
    if (this.isInitialized) return true;
    
    try {
      // Load Google AdSense and Publisher Tag
      await this.loadAdSenseSDK();
      
      this.isInitialized = true;
      console.log('AdSense service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize AdSense service:', error);
      return false;
    }
  }
  
  /**
   * Load the Google AdSense and GPT scripts
   * @returns {Promise<void>}
   * @private
   */
  async loadAdSenseSDK() {
    return new Promise((resolve, reject) => {
      if (window.adsbygoogle) {
        resolve();
        return;
      }
      
      // Add AdSense script
      const adSenseScript = document.createElement('script');
      adSenseScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      adSenseScript.async = true;
      adSenseScript.crossOrigin = 'anonymous';
      adSenseScript.setAttribute('data-ad-client', import.meta.env.VITE_ADSENSE_CLIENT_ID);
      
      adSenseScript.onload = () => {
        console.log('AdSense script loaded');
        resolve();
      };
      adSenseScript.onerror = (error) => {
        console.error('Error loading AdSense script:', error);
        reject(error);
      };
      
      document.head.appendChild(adSenseScript);
    });
  }
  
  /**
   * Check if a user can watch an ad (based on cooldown and daily limits)
   * @param {string} userId - The user's ID
   * @returns {Promise<boolean>} Whether the user can watch an ad
   */
  async canWatchAd(userId) {
    if (!userId) return false;
    
    try {
      const { data, error } = await supabase.rpc('can_watch_ad', {
        p_user_id: userId
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error checking if user can watch ad:', error);
      return false;
    }
  }
  
  /**
   * Get the user's ad status (cooldown, remaining ads)
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} The user's ad status
   */
  async getAdStatus(userId) {
    if (!userId) {
      return {
        canWatchAd: false,
        adsRemaining: 0,
        cooldownRemaining: 0
      };
    }
    
    try {
      // Get user data to check ad limits
      const { data: userData, error } = await supabase
        .from('users')
        .select('last_ad_watched, ads_watched_today')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      
      const adsWatchedToday = userData.ads_watched_today || 0;
      const lastAdWatched = userData.last_ad_watched ? new Date(userData.last_ad_watched) : null;
      const now = new Date();
      
      // Calculate cooldown remaining
      let cooldownRemaining = 0;
      if (lastAdWatched) {
        const elapsedSeconds = Math.floor((now - lastAdWatched) / 1000);
        cooldownRemaining = Math.max(0, 30 - elapsedSeconds);
      }
      
      const adsRemaining = 5 - adsWatchedToday;
      const canWatchAd = adsWatchedToday < 5 && cooldownRemaining === 0;
      
      return {
        canWatchAd,
        adsRemaining,
        cooldownRemaining
      };
    } catch (error) {
      console.error('Error getting ad status:', error);
      return {
        canWatchAd: false,
        adsRemaining: 0,
        cooldownRemaining: 0
      };
    }
  }
  
  /**
   * Load a rewarded ad
   * @returns {Promise<boolean>} Whether the ad was loaded successfully
   */
  async loadAd() {
    if (!this.isInitialized) await this.initialize();
    
    return new Promise((resolve, reject) => {
      try {
        // Create container for the ad
        const adContainer = document.createElement('div');
        adContainer.className = 'adsbygoogle';
        adContainer.style.width = '100%';
        adContainer.style.height = '250px';
        adContainer.dataset.adClient = import.meta.env.VITE_ADSENSE_CLIENT_ID;
        adContainer.dataset.adSlot = this.adUnitId;
        adContainer.dataset.adFormat = 'auto';
        adContainer.dataset.fullWidthResponsive = 'true';
        
        // Store for later use
        this.adContainer = adContainer;
        
        resolve(true);
      } catch (error) {
        console.error('Error loading ad:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Show a rewarded ad
   * @returns {Promise<boolean>} Whether the ad was completed successfully
   */
  async showAd() {
    return new Promise((resolve, reject) => {
      try {
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.style.position = 'fixed';
        modalContainer.style.top = '0';
        modalContainer.style.left = '0';
        modalContainer.style.width = '100%';
        modalContainer.style.height = '100%';
        modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        modalContainer.style.zIndex = '9999';
        modalContainer.style.display = 'flex';
        modalContainer.style.flexDirection = 'column';
        modalContainer.style.justifyContent = 'center';
        modalContainer.style.alignItems = 'center';
        
        // Add header text
        const headerText = document.createElement('h2');
        headerText.textContent = 'Watch this ad to earn 10 gems';
        headerText.style.color = 'white';
        headerText.style.marginBottom = '20px';
        modalContainer.appendChild(headerText);
        
        // Add ad container wrapper (to control size)
        const adContainerWrapper = document.createElement('div');
        adContainerWrapper.style.width = '336px';
        adContainerWrapper.style.maxWidth = '100%';
        adContainerWrapper.style.height = '280px';
        adContainerWrapper.style.backgroundColor = '#f1f1f1';
        adContainerWrapper.style.position = 'relative';
        adContainerWrapper.style.overflow = 'hidden';
        adContainerWrapper.appendChild(this.adContainer);
        modalContainer.appendChild(adContainerWrapper);
        
        // Add complete button that appears after 15 seconds
        const completeButton = document.createElement('button');
        completeButton.textContent = 'Complete Ad (Wait...)';
        completeButton.style.marginTop = '20px';
        completeButton.style.padding = '10px 20px';
        completeButton.style.backgroundColor = '#4f46e5';
        completeButton.style.color = 'white';
        completeButton.style.border = 'none';
        completeButton.style.borderRadius = '8px';
        completeButton.style.cursor = 'not-allowed';
        completeButton.style.opacity = '0.5';
        completeButton.disabled = true;
        modalContainer.appendChild(completeButton);
        
        // Add to document
        document.body.appendChild(modalContainer);
        
        // Initialize the ad
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        
        // Set a timer to enable the complete button after 15 seconds (simulating ad completion)
        setTimeout(() => {
          completeButton.textContent = 'Complete Ad and Earn Gems';
          completeButton.style.backgroundColor = '#4f46e5';
          completeButton.style.cursor = 'pointer';
          completeButton.style.opacity = '1';
          completeButton.disabled = false;
          
          // Add click event to complete button
          completeButton.addEventListener('click', () => {
            document.body.removeChild(modalContainer);
            resolve(true);
          });
        }, 15000); // 15 seconds minimum viewing time
        
        // Add close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.color = 'white';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.zIndex = '10000';
        closeButton.addEventListener('click', () => {
          document.body.removeChild(modalContainer);
          resolve(false); // User closed ad early
        });
        modalContainer.appendChild(closeButton);
        
      } catch (error) {
        console.error('Error showing ad:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Award gems to a user for watching an ad
   * @param {string} userId - The user's ID
   * @param {number} gemsAmount - The amount of gems to award
   * @returns {Promise<boolean>} Whether the gems were awarded successfully
   */
  async awardGemsForAd(userId, gemsAmount = this.gemsPerAd) {
    try {
      const { data, error } = await supabase.rpc('award_gems_for_ad', {
        p_user_id: userId,
        p_gems_amount: gemsAmount,
        p_ad_provider: this.adProvider,
        p_ad_unit_id: this.adUnitId
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error awarding gems for ad:', error);
      return false;
    }
  }
}

export const adService = new AdService(); 