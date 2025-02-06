import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import CheckoutForm from '../components/CheckoutForm';
import { toast } from 'react-hot-toast';
import { UpgradeDialog } from '../components/UpgradeDialog';
import AuthModal from '../components/AuthModal';
import styles from './CreditsPage.module.css';

const CreditsPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [selectedCredits, setSelectedCredits] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState({ show: false });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState(null);
  const [isPendingSubscription, setIsPendingSubscription] = useState(false);

  const subscriptionPackages = [
    {
      id: 'pog',
      name: 'Pog',
      price: 3,
      period: 'weekly',
      votes: 100,
      votesPerWeek: 25,
      votesPerDollar: 33.3,
      description: 'Perfect for casual viewers',
      features: [
        '100 votes monthly (25 weekly)',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: false
    },
    {
      id: 'pogchamp',
      name: 'Pogchamp',
      price: 5,
      period: 'weekly',
      votes: 200,
      votesPerWeek: 50,
      votesPerDollar: 40.0,
      description: 'Best value for active chatters',
      features: [
        '200 votes monthly (50 weekly)',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: true
    },
    {
      id: 'poggers',
      name: 'Poggers',
      price: 7,
      period: 'weekly',
      votes: 400,
      votesPerWeek: 100,
      votesPerDollar: 57.1,
      description: 'For the true community leaders',
      features: [
        '400 votes monthly (100 weekly)',
        'Access to streamer list',
        'Weekly donation pool participation',
        'Cancel anytime'
      ],
      popular: false
    }
  ];

  const handlePurchase = async (packageId, isSubscription = false) => {
    setLoading(true);
    setError('');
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setPendingPackageId(packageId);
        setIsPendingSubscription(isSubscription);
        setShowAuthModal(true);
        return;
      }

      const selectedPkg = isSubscription 
        ? subscriptionPackages.find(pkg => pkg.id === packageId)
        : oneTimePackages.find(pkg => pkg.id === packageId);

      if (!selectedPkg) throw new Error('Invalid package');

      setShowPayment(true);
      setSelectedAmount(selectedPkg.price);
      setSelectedCredits(selectedPkg.votes);
      setSelectedPackage(selectedPkg);
      
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPurchase = async () => {
    if (!customAmount || customAmount < 2) {
      toast.error('Minimum amount is $2');
      return;
    }

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setShowAuthModal(true);
        return;
      }

      const votes = calculateCustomCredits(customAmount);
      setSelectedAmount(Number(customAmount));
      setSelectedCredits(votes);
      setSelectedPackage({
        id: 'custom',
        name: 'Custom Amount',
        price: Number(customAmount),
        votes: votes
      });
      setShowPayment(true);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }
  };

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

  const calculateCustomCredits = (amount) => {
    if (!amount || amount <= 0) return 0;
    const value = Number(parseFloat(amount).toFixed(2));
    
    if (value >= 100) return Math.floor(value * 15);
    if (value >= 50) return Math.floor(value * 13);
    if (value >= 25) return Math.floor(value * 11);
    if (value >= 10) return Math.floor(value * 10);
    return Math.floor(value * 8);
  };

  const handlePaymentSuccess = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Please log in to continue');

      if (selectedPackage.period) {
        const { error: renewalError } = await supabase.rpc('process_subscription_renewal', {
          p_user_id: user.id,
          p_subscription_tier: selectedPackage.id
        });

        if (renewalError) throw renewalError;
      }

      setShowPayment(false);
      toast.success('Purchase successful!');
      
    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Error processing payment');
    }
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
      const currentTier = await fetchCurrentSubscription();
      
      if (currentTier === packageId) {
        toast.error("You already have this subscription tier!");
        return;
      }

      const selected = subscriptionPackages.find(pkg => pkg.id === packageId);
      if (!selected) {
        toast.error("Invalid subscription package");
        return;
      }

      // Get user data
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please log in to continue.");

      // Update user's subscription status
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription_tier: packageId,
          subscription_status: 'active',
          last_credit_distribution: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // If there's a current subscription, show upgrade dialog
      if (currentTier) {
        const currentPlan = subscriptionPackages.find(pkg => pkg.id === currentTier);
        if (!currentPlan) {
          toast.error("Error loading current plan");
          return;
        }
        setShowUpgradeDialog({
          show: true,
          currentPlan,
          newPlan: selected
        });
        return;
      }

      // For new subscriptions
      setSelectedPackage(selected);
      setShowPayment(true);
    } catch (err) {
      console.error("Subscription error:", err);
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleUpgradeClick = (newPlan) => {
    try {
      // Find current plan using currentSubscription state
      const currentPlan = subscriptionPackages.find(pkg => pkg.id === currentSubscription);
      
      if (!currentPlan) {
        toast.error('Error loading current plan');
        return;
      }

      setShowUpgradeDialog({
        show: true,
        currentPlan: {
          name: currentPlan.name,
          votes: currentPlan.votes,
          price: currentPlan.price,
          votesPerDollar: currentPlan.votesPerDollar
        },
        newPlan: {
          name: newPlan.name,
          votes: newPlan.votes,
          price: newPlan.price,
          votesPerDollar: newPlan.votesPerDollar
        }
      });
    } catch (err) {
      console.error('Error in handleUpgradeClick:', err);
      toast.error('Failed to process upgrade');
    }
  };

  const handleUpgradeConfirm = async (newPlan) => {
    setSelectedPackage(newPlan);
    setShowPayment(true);
  };

  const calculateValuePerDollar = (votes, price) => {
    return (votes / price).toFixed(1);
  };

  const calculatePackageDonationBomb = (votes, price) => {
    const stripeFee = price * 0.029 + 0.30;
    const netRevenue = price - stripeFee;
    return (netRevenue * 0.55).toFixed(2); // 55% of net revenue goes to prize pool
  };

  const handleClosePayment = () => {
    setShowPayment(false);
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
                {pkg.votes} Votes Monthly
              </div>
              <div className={styles.creditsDetails}>
                ({pkg.votesPerWeek} votes weekly)
              </div>
              <div className={styles.creditsPerDollar}>
                {pkg.votesPerDollar.toFixed(1)} votes per $1
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

      {showPayment && selectedPackage && (
        <CheckoutForm 
          amount={selectedAmount}
          credits={selectedCredits}
          selectedTier={selectedPackage.id}
          onSuccess={handlePaymentSuccess}
          onClose={handleClosePayment}
        />
      )}

      {showUpgradeDialog.show && (
        <UpgradeDialog
          currentPlan={showUpgradeDialog.currentPlan}
          newPlan={showUpgradeDialog.newPlan}
          onCancel={() => setShowUpgradeDialog({ show: false })}
          onConfirm={() => {
            handlePurchase(showUpgradeDialog.newPlan.id, true);
            setShowUpgradeDialog({ show: false });
          }}
        />
      )}

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