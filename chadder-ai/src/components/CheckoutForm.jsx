import { useState, useEffect } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import './CheckoutForm.css';

const CheckoutForm = ({ amount, credits, selectedTier, isSubscription = false, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (amount && !isSubscription) {
      createPaymentIntent();
    }
  }, [amount]);

  const createPaymentIntent = async () => {
    try {
      const response = await fetch(`${API_URL}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, credits }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const data = await response.json();
      setPaymentIntent(data.clientSecret);
    } catch (err) {
      setError('Failed to initialize payment. Please try again.');
      console.error('Payment intent error:', err);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) {
      setError('Stripe not initialized');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Please log in to continue');
      }

      const cardElement = elements.getElement(CardElement);
      
      if (isSubscription) {
        // Handle subscription flow
        const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
        });

        if (paymentMethodError) {
          throw new Error(paymentMethodError.message);
        }

        const response = await fetch(`${API_URL}/create-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: paymentMethod.id,
            email: session.user.email,
            tier: selectedTier,
            credits: Number(credits),
            userId: session.user.id
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create subscription');
        }

        const { clientSecret, customerId } = await response.json();

        // Update user's stripe_customer_id in Supabase
        const { error: updateError } = await supabase
          .from('users')
          .update({ stripe_customer_id: customerId })
          .eq('id', session.user.id);

        if (updateError) {
          console.error('Error updating customer ID:', updateError);
        }

        // Confirm subscription
        const { error: confirmationError } = await stripe.confirmCardPayment(clientSecret);
        if (confirmationError) {
          throw new Error(confirmationError.message);
        }
      } else {
        // Handle one-time payment flow
        if (!paymentIntent) {
          throw new Error('Payment not initialized');
        }

        const { error: confirmError } = await stripe.confirmCardPayment(paymentIntent, {
          payment_method: {
            card: cardElement,
            billing_details: {
              email: session.user.email,
            },
          },
        });

        if (confirmError) {
          throw new Error(confirmError.message);
        }
      }

      // Payment successful
      onSuccess();
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="payment-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="payment-modal">
        <button className="close-button" onClick={onClose}>&times;</button>
        <form onSubmit={handleSubmit} className="checkout-form">
          <h3>{isSubscription ? 'Subscribe' : 'Complete Purchase'}</h3>
          <div className="amount-display">
            <p>Total: ${amount}{isSubscription ? '/week' : ''}</p>
            <p>{credits} credits {isSubscription ? 'monthly' : ''} 
               {isSubscription ? `(${Math.floor(credits/4)} weekly)` : ''}</p>
          </div>
          <div className="card-element-container">
            <CardElement options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#efeff1',
                  '::placeholder': {
                    color: '#6e6e76',
                  },
                },
                invalid: {
                  color: '#ff4444',
                },
              },
            }} />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button 
            type="submit" 
            disabled={!stripe || processing || (!paymentIntent && !isSubscription)}
          >
            {processing ? 'Processing...' : `Pay $${amount}${isSubscription ? '/week' : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CheckoutForm; 