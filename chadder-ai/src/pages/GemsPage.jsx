import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import AuthModal from '../components/AuthModal';
import styles from './CreditsPage.module.css'; // We'll keep using the same CSS file for now
import { useAuth } from '../hooks/useAuth';
import WatchAdButton from '../components/WatchAdButton';

const GemsPage = () => {
  const { user, loading: authLoading, error: authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState(null);
  const [isPendingSubscription, setIsPendingSubscription] = useState(false);

  const subscriptionPackages = [
    {
      id: 'common',
      name: 'Common',
      price: 3,
      period: 'weekly',
      gems: 100,
      gemsPerWeek: 25,
      gemsPerDollar: 33.3,
      description: 'Perfect for casual viewers',
      features: [
        '100 gems monthly (25 weekly) 💚',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: false,
      priceId: 'price_1QnrdfEDfrbbc35YnZ3tVoMS'
    },
    {
      id: 'rare',
      name: 'Rare',
      price: 5,
      period: 'weekly',
      gems: 200,
      gemsPerWeek: 50,
      gemsPerDollar: 40.0,
      description: 'Best value for active chatters',
      features: [
        '200 gems monthly (50 weekly) 💎',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: true,
      priceId: 'price_1Qnre1EDfrbbc35YQVAy7Z0E'
    },
    {
      id: 'epic',
      name: 'Epic',
      price: 7,
      period: 'weekly',
      gems: 400,
      gemsPerWeek: 100,
      gemsPerDollar: 57.1,
      description: 'For the true community leaders',
      features: [
        '400 gems monthly (100 weekly) 🔸',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: false,
      priceId: 'price_1QnreLEDfrbbc35YV7TtcIld'
    }
  ];

  const handleLogin = () => {
    navigate('/login', { 
      state: { 
        returnTo: '/gems',
        pendingPackageId,
        isPendingSubscription 
      } 
    });
    setShowAuthModal(false);
  };

  const handleSignup = () => {
    navigate('/signup', { 
      state: { 
        returnTo: '/gems',
        pendingPackageId,
        isPendingSubscription 
      } 
    });
    setShowAuthModal(false);
  };

  useEffect(() => {
    let mounted = true;
    
    const fetchAndSetData = async () => {
      if (!user?.id) return;
      try {
        const tier = await fetchCurrentSubscription();
        if (mounted) {
          setCurrentSubscription(tier);
        }
      } catch (err) {
        console.error('Error loading subscription:', err);
        if (mounted) {
          toast.error('Failed to load subscription data');
        }
      }
    };

    // Initial fetch
    if (!authLoading && user) {
      fetchAndSetData();
    }

    // Set up polling instead of real-time for local development
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let pollInterval;

    if (isLocalhost && user) {
      // Poll every 30 seconds in local development
      pollInterval = setInterval(fetchAndSetData, 30000);
    } else if (user) {
      // Only use real-time subscription in production
      try {
        const channel = supabase.channel(`subscription-updates-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${user.id}`
            },
            () => {
              if (mounted) {
                fetchAndSetData();
              }
            }
          )
          .subscribe();

        return () => {
          mounted = false;
          if (channel) {
            supabase.removeChannel(channel);
          }
        };
      } catch (error) {
        console.error('Real-time subscription error:', error);
        // Fallback to polling if real-time fails
        pollInterval = setInterval(fetchAndSetData, 30000);
      }
    }

    return () => {
      mounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [user, authLoading]);

  const fetchCurrentSubscription = async () => {
    try {
      if (!user) return null;

      // Get user data with subscription info
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("stripe_customer_id, subscription_tier, subscription_status")
        .eq("id", user.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid the multiple rows error

      if (userError) {
        console.error('Database error:', userError);
        throw userError;
      }

      // If we have a subscription status in the database, use that
      if (userData?.subscription_tier && userData.subscription_status === 'active') {
        return userData.subscription_tier;
      }

      // If we have a Stripe customer ID, verify with Stripe
      if (userData?.stripe_customer_id) {
        const API_URL = import.meta.env.VITE_API_URL || 'https://chadderforchadders.onrender.com';
        const response = await fetch(`${API_URL}/subscriptions/${userData.stripe_customer_id}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch subscription data from Stripe');
        }
        
        const { subscriptions } = await response.json();
        
        if (subscriptions && subscriptions.length > 0) {
          return subscriptions[0].metadata.tier;
        }
      }
      
      return null;
    } catch (err) {
      console.error("Error fetching subscription:", err);
      throw err;
    }
  };

  const handleSubscription = async (packageId) => {
    try {
      setLoading(true);
      setError('');

      // Check auth state
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setPendingPackageId(packageId);
        setIsPendingSubscription(true);
        setShowAuthModal(true);
        return;
      }

      // Get user data with subscription info
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, stripe_customer_id, subscription_status')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Database error:', userError);
        throw userError;
      }

      if (!userData) {
        throw new Error('Could not retrieve user data');
      }

      // If user already has an active subscription, redirect to customer portal
      if (userData.stripe_customer_id && userData.subscription_status === 'active') {
        const API_URL = import.meta.env.VITE_API_URL || 'https://chadderforchadders.onrender.com';
        const response = await fetch(`${API_URL}/create-portal-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            customerId: userData.stripe_customer_id,
            returnUrl: window.location.origin + '/gems'
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create customer portal session');
        }

        const { url } = await response.json();
        window.location.href = url;
        return;
      }

      // Otherwise, create a checkout session for a new subscription
      const selectedPackage = subscriptionPackages.find(pkg => pkg.id === packageId);
      if (!selectedPackage) {
        throw new Error('Invalid package selected');
      }

      const API_URL = import.meta.env.VITE_API_URL || 'https://chadderforchadders.onrender.com';
      const response = await fetch(`${API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: selectedPackage.priceId,
          customerId: userData.stripe_customer_id,
          customerEmail: userData.email,
          userId: user.id,
          tier: packageId,
          successUrl: window.location.origin + '/gems?success=true',
          cancelUrl: window.location.origin + '/gems?canceled=true'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message || 'Failed to process subscription');
      toast.error(err.message || 'Failed to process subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleGemsEarned = () => {
    toast.success('You earned gems from watching an ad!');
    // Refresh the page to update the gem balance
    window.location.reload();
  };

  return (
    <div className={styles.creditsPage}>
      <div className={styles.header}>
        <h1>Get Gems</h1>
        <p className={styles.subtitle}>
          Support your favorite streamers and help them win prizes!
        </p>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
        </div>
      )}

      <div className={styles.adSection}>
        <h2>Watch Ads for Free Gems</h2>
        <p>You can earn gems by watching short advertisements</p>
        <div className={styles.adButtonContainer}>
          <WatchAdButton onGemsEarned={handleGemsEarned} />
        </div>
      </div>

      <div className={styles.subscriptionSection}>
        <h2>Subscribe for Weekly Gems</h2>
        <p className={styles.sectionDescription}>
          Choose a subscription plan to receive gems every week
        </p>

        <div className={styles.packageGrid}>
          {subscriptionPackages.map((pkg) => (
            <div 
              key={pkg.id} 
              className={`${styles.packageCard} ${pkg.popular ? styles.popularPackage : ''} ${currentSubscription === pkg.id ? styles.currentPackage : ''}`}
            >
              {pkg.popular && <div className={styles.popularBadge}>Most Popular</div>}
              {currentSubscription === pkg.id && <div className={styles.currentBadge}>Current Plan</div>}
              
              <h3 className={styles.packageName}>{pkg.name}</h3>
              <div className={styles.packagePrice}>
                <span className={styles.currency}>$</span>
                <span className={styles.amount}>{pkg.price}</span>
                <span className={styles.period}>/{pkg.period}</span>
              </div>
              
              <div className={styles.creditsAmount}>
                {pkg.gems} <span>gems</span>
              </div>
              
              <div className={styles.creditsDetails}>
                <span>{pkg.gemsPerWeek} gems weekly</span>
              </div>
              
              <div className={styles.creditsPerDollar}>
                <span>{pkg.gemsPerDollar.toFixed(1)} gems per $</span>
              </div>
              
              <p className={styles.packageDescription}>{pkg.description}</p>
              
              <ul className={styles.featureList}>
                {pkg.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
              
              <button 
                className={`${styles.subscribeButton} ${currentSubscription === pkg.id ? styles.manageButton : ''}`}
                onClick={() => handleSubscription(pkg.id)}
                disabled={loading}
              >
                {loading ? 'Processing...' : currentSubscription === pkg.id ? 'Manage Subscription' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    </div>
  );
};

export default GemsPage; 