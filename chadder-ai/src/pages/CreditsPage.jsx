import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const CreditsPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const creditPackages = [
    {
      id: 0,
      name: 'Coin Purse',
      credits: 10,
      price: 2,
      popular: false,
      features: ['10 credits'],
      description: 'Try it out!',
    },
    { 
      id: 1, 
      name: 'Small Pouch',
      credits: 40, 
      price: 5, 
      popular: false,
      features: ['40 credits'],
      description: 'A starter pack of credits', 
    },
    { 
      id: 2, 
      name: 'Pog Stash',
      credits: 150, 
      price: 10, 
      popular: true,
      features: ['150 credits'],
      description: 'Most popular power-up'
    },
    { 
      id: 3, 
      name: 'Treasure Chest',
      credits: 350, 
      price: 20, 
      popular: false,
      features: ['350 credits'],
      description: 'For the chat champions'
    },
    { 
      id: 4, 
      name: 'Big Bag',
      credits: 2500, 
      price: 100, 
      popular: false,
      features: ['2500 credits'],
      description: 'Ultimate chat arsenal'
    },
    { 
      id: 5, 
      name: 'Psycho',
      credits: 30000, 
      price: 1000, 
      popular: false,
      features: ['30000 credits'],
      description: 'Legendary tier wealth'
    },
  ];

  const subscriptionPackages = [
    {
      id: 'sub1',
      name: 'Pog',
      credits: 25,
      monthlyCredits: 100,
      price: 3,
      popular: false,
      features: ['100 credits monthly (25 weekly)', 'Auto-renewal', 'Cancel anytime'],
      description: 'Perfect for casual viewers',
    },
    {
      id: 'sub2',
      name: 'Pogchamp',
      credits: 50,
      monthlyCredits: 200,
      price: 5,
      popular: true,
      features: ['200 credits monthly (50 weekly)', 'Auto-renewal', 'Cancel anytime'],
      description: 'Best value for active chatters',
    },
    {
      id: 'sub3',
      name: 'Poggers',
      credits: 100,
      monthlyCredits: 400,
      price: 7,
      popular: false,
      features: ['400 credits monthly (100 weekly)', 'Auto-renewal', 'Cancel anytime'],
      description: 'For the true community leaders',
    },
  ];

  const handlePurchase = async (package_id) => {
    setLoading(true);
    setError('');
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Please log in to purchase credits');

      // Here you would integrate with your payment processor
      // For now, we'll just show an alert
      alert('Payment processing will be implemented soon!');
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscription = async (package_id) => {
    setLoading(true);
    setError('');
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Please log in to subscribe');

      // Here you would integrate with your subscription payment processor
      alert('Subscription processing will be implemented soon!');
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateValuePerDollar = (credits, price) => {
    return (credits / price).toFixed(1);
  };

  const toggleBillingPeriod = (period) => {
    setBillingPeriod(period);
  };

  const calculatePackageDonationBomb = (credits, price) => {
    const stripeFee = price * 0.029 + 0.30;
    const netRevenue = price - stripeFee;
    const wacp = netRevenue / credits;
    const estimatedUsedCredits = credits * 0.5;
    const donationBomb = estimatedUsedCredits * wacp * 0.55;
    return donationBomb.toFixed(2);
  };

  const calculateCustomCredits = (amount) => {
    if (!amount || amount <= 0) return 0;
    
    // Convert amount to number and round to 2 decimal places
    const value = Number(parseFloat(amount).toFixed(2));

    // Tiered credit calculation
    if (value >= 1000) {
      return Math.floor(value * 30); // Dragon Hoard tier (30 credits/$)
    } else if (value >= 100) {
      return Math.floor(value * 25); // Loot Vault tier (25 credits/$)
    } else if (value >= 20) {
      return Math.floor(value * 17.5); // Treasure Chest tier (17.5 credits/$)
    } else if (value >= 10) {
      return Math.floor(value * 15); // Pog Stash tier (15 credits/$)
    } else if (value >= 5) {
      return Math.floor(value * 8); // Small Pouch tier (8 credits/$)
    } else {
      return Math.floor(value * 5); // Coin Purse tier (5 credits/$)
    }
  };

  const renderPricingHeader = (pkg) => (
    <div className="pricing-header">
      <h3>{pkg.name}</h3>
      <p className="package-description">{pkg.description}</p>
      <div className="price">
        <span className="currency">$</span>
        <span className="amount">{pkg.price}</span>
        {pkg.monthlyCredits && <span className="period">/w</span>}
      </div>
      <div className="credits-amount">
        {pkg.monthlyCredits ? (
          <div className="credits-breakdown">
            <span className="monthly-credits">{pkg.monthlyCredits} Credits Monthly</span>
            <span className="weekly-credits">({pkg.credits} credits weekly)</span>
          </div>
        ) : (
          <span>{pkg.credits} Credits</span>
        )}
      </div>
      <div className="value-indicator">
        {calculateValuePerDollar(pkg.monthlyCredits || pkg.credits, pkg.price)} credits per $1
      </div>
    </div>
  );

  return (
    <div className="credits-page">
      <div className={`credits-page ${billingPeriod}-view`}>
        <div className="credits-header">
          <span className="credits-badge">CREDITS</span>
          <h1>Power Up Your Experience</h1>
          <p>Choose between monthly subscriptions or one-time purchases</p>
        </div>

        <section className="subscription-section">
          <h2 className="section-title">Weekly Subscriptions</h2>
          <p className="section-description">Get credits automatically every week</p>
          
          <div className="pricing-container">
            {subscriptionPackages.map((pkg) => (
              <div 
                key={pkg.id} 
                className={`pricing-card subscription ${pkg.popular ? 'popular' : ''} ${pkg.period}`}
              >
                {pkg.popular && (
                  <div className="popular-tag">
                    <span>MOST POPULAR</span>
                  </div>
                )}
                
                {renderPricingHeader(pkg)}

                <div className="pricing-features">
                  <ul>
                    {pkg.features.map((feature, index) => (
                      <li key={index}>
                        <span className="feature-check">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <button 
                  className={`purchase-btn subscription-btn ${pkg.popular ? 'popular-btn' : ''}`}
                  onClick={() => handleSubscription(pkg.id)}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-spinner">Processing...</span>
                  ) : (
                    <>Subscribe Now</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="section-divider">
          <span className="divider-text">OR</span>
        </div>

        <section className="one-time-section">
          <h2 className="section-title">One-Time Packages</h2>
          <p className="section-description">Purchase credits as needed</p>
          
          <div className="pricing-container">
            {creditPackages.map((pkg) => (
              <div 
                key={pkg.id} 
                className={`pricing-card ${pkg.popular ? 'popular' : ''}`}
              >
                {pkg.popular && (
                  <div className="popular-tag">
                    <span>MOST POPULAR</span>
                  </div>
                )}
                
                {renderPricingHeader(pkg)}

                <div className="pricing-features">
                  <ul>
                    {pkg.features.map((feature, index) => (
                      <li key={index}>
                        <span className="feature-check">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <button 
                  className={`purchase-btn ${pkg.popular ? 'popular-btn' : ''}`}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-spinner">Processing...</span>
                  ) : (
                    <>Get {pkg.credits} Credits</>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="custom-amount-section">
            <h3>Custom Amount</h3>
            <div className="custom-amount-calculator">
              <div className="input-wrapper">
                <span className="currency-symbol">$</span>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="custom-amount-input"
                />
              </div>
              <div className="credits-preview">
                {customAmount && customAmount >= 2 ? (
                  <>
                    <span className="credits-icon">🪙</span>
                    <span className="credits-amount">
                      {calculateCustomCredits(customAmount)} Credits
                    </span>
                  </>
                ) : (
                  <span className="min-amount-notice">
                    Minimum amount is $2
                  </span>
                )}
              </div>
              <button
                className="purchase-btn"
                onClick={() => handlePurchase('custom')}
                disabled={loading || !customAmount || customAmount < 2}
              >
                {loading ? (
                  <span className="loading-spinner">Processing...</span>
                ) : (
                  <>Get Credits</>
                )}
              </button>
            </div>
          </div>
        </section>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
};

export default CreditsPage; 