import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import AuthModal from '../components/AuthModal';
import styles from './CreditsPage.module.css';

const CreditsPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState(null);
  const [isPendingSubscription, setIsPendingSubscription] = useState(false);

  const subscriptionPackages = [
    {
      id: 'pog',
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
      id: 'pogchamp',
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
      id: 'poggers',
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

  const fetchCurrentSubscription = async () => {
    try {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !currentUser) throw new Error("Please log in to continue.");

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", currentUser.id)
        .single();

      if (userError || !userData?.stripe_customer_id) return null;

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/subscriptions/${userData.stripe_customer_id}`);
      const { subscriptions } = await response.json();
      
      if (subscriptions && subscriptions.length > 0) {
        // Get the tier from metadata
        return subscriptions[0].metadata.tier;
      }
      return null;
    } catch (err) {
      console.error("Error fetching subscription:", err);
      return null;
    }
  };

  const handleSubscription = async (packageId) => {
    try {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setPendingPackageId(packageId);
        setIsPendingSubscription(true);
        setShowAuthModal(true);
        return;
      }

      // Get user data first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        throw new Error('Could not retrieve user data');
      }

      // Find the selected package and get its priceId
      const selectedPackage = subscriptionPackages.find(pkg => pkg.id === packageId);
      if (!selectedPackage) {
        throw new Error('Invalid package selected');
      }

      // Create a Stripe Checkout session for subscription
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const requestData = {
        userId: user.id,
        email: userData.email,
        packageId: selectedPackage.id,
        priceId: selectedPackage.priceId,
        return_url: `${window.location.origin}/settings`
      };

      const response = await fetch(`${API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to create checkout session');
      }
      
      window.location.href = responseData.url;
    } catch (err) {
      console.error("Subscription error:", err);
      setError(err.message);
      toast.error(err.message || 'Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadCurrentSubscription = async () => {
      const tier = await fetchCurrentSubscription();
      setCurrentSubscription(tier);
    };
    
    loadCurrentSubscription();
  }, []);

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