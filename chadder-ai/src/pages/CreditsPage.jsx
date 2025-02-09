import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import AuthModal from '../components/AuthModal';
import styles from './CreditsPage.module.css';
import { useAuth } from '../hooks/useAuth';

const CreditsPage = () => {
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
      votes: 100,
      votesPerWeek: 25,
      votesPerDollar: 33.3,
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
      votes: 200,
      votesPerWeek: 50,
      votesPerDollar: 40.0,
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
      votes: 400,
      votesPerWeek: 100,
      votesPerDollar: 57.1,
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
        returnTo: '/credits',
        pendingPackageId,
        isPendingSubscription 
      } 
    });
    setShowAuthModal(false);
  };

  const handleSignup = () => {
    navigate('/signup', { 
      state: { 
        returnTo: '/credits',
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

      // Verify session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData?.session) {
        // Try to refresh the session
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          throw new Error('No active session');
        }
      }

      // Get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Database error:', userError);
        throw userError;
      }

      if (!userData) {
        throw new Error('Could not retrieve user data');
      }

      // Find the selected package
      const selectedPackage = subscriptionPackages.find(pkg => pkg.id === packageId);
      if (!selectedPackage) {
        throw new Error('Invalid package selected');
      }

      // Create Stripe checkout session
      const API_URL = import.meta.env.VITE_API_URL || 'https://chadderforchadders.onrender.com';
      const siteUrl = import.meta.env.VITE_APP_URL || 'https://chadderai.vercel.app';
      
      const requestData = {
        userId: user.id,
        email: userData.email,
        packageId: selectedPackage.id,
        priceId: selectedPackage.priceId
      };

      const response = await fetch(`${API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const responseData = await response.json();
      window.location.href = responseData.url;
    } catch (err) {
      console.error("Subscription error:", err);
      setError(err.message || 'Failed to process subscription');
      toast.error(err.message || 'Failed to create checkout session');
      
      if (err.message?.includes('No active session') || err.message?.includes('JWT expired')) {
        setPendingPackageId(packageId);
        setIsPendingSubscription(true);
        setShowAuthModal(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.creditsPage}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>Weekly Voting Power</h1>
        <p className={styles.headerSubtitle}>
          Subscribe to gain voting power, access exclusive streamer lists, and contribute to weekly donation pools
        </p>
      </div>

      <div className={styles.pricingGrid}>
        {subscriptionPackages.map((pkg) => (
          <div 
            key={pkg.id}
            className={`${styles.pricingCard} ${pkg.popular ? styles.popular : ''}`}
          >
            {pkg.popular && (
              <div className={styles.popularBadge}>MOST POPULAR</div>
            )}
            <h3 className={styles.cardTitle}>{pkg.name}</h3>
            <p className={styles.cardDescription}>{pkg.description}</p>
            
            <div className={styles.priceContainer}>
              <div className={styles.price}>
                <span className={styles.currency}>$</span>
                {pkg.price}
                <span className={styles.period}>/w</span>
              </div>
              <div className={styles.creditsAmount}>
                {pkg.votes} Gems Monthly
              </div>
              <div className={styles.creditsDetails}>
                ({pkg.votesPerWeek} gems weekly)
              </div>
              <div className={styles.creditsPerDollar}>
                {pkg.votesPerDollar.toFixed(1)} gems per $1
              </div>
            </div>

            <div className={styles.featuresList}>
              {pkg.features.map((feature, index) => (
                <div key={index} className={styles.featureItem}>
                  <span className={styles.featureIcon}>✓</span>
                  {feature}
                </div>
              ))}
            </div>

            {currentSubscription === pkg.id ? (
              <button
                className={`${styles.actionButton} ${styles.currentTier}`}
                disabled={true}
              >
                Current Tier
              </button>
            ) : (
              <button
                className={styles.actionButton}
                onClick={() => handleSubscription(pkg.id)}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Subscribe Now'}
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setPendingPackageId(null);
          setIsPendingSubscription(false);
        }}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    </div>
  );
};

export default CreditsPage;