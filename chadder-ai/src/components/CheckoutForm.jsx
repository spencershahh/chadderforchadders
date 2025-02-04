import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../supabaseClient';
import './CheckoutForm.css';

const CheckoutForm = ({ amount, credits, selectedTier, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);

  const updateUserCredits = async (newCredits) => {
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        throw new Error('Please log in again');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          additional_credits: newCredits,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;
      
      return true;
    } catch (err) {
      console.error('Error updating credits:', err);
      throw new Error('Failed to update credits: ' + err.message);
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
      // Test server connection first
      const testResponse = await fetch('http://localhost:3001/test');
      if (!testResponse.ok) {
        throw new Error('Server not responding');
      }

      // Create payment method
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });

      if (paymentMethodError) {
        throw new Error(paymentMethodError.message);
      }

      // Get user email from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      const userEmail = session?.user?.email;

      if (!userEmail) {
        throw new Error('Please log in to subscribe');
      }

      // Create subscription
      const response = await fetch('http://localhost:3001/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: paymentMethod.id,
          email: userEmail,
          tier: selectedTier,
          credits: Number(credits)
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

      onSuccess();
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || 'Failed to process payment');
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
          <h3>Complete Purchase</h3>
          <div className="amount-display">
            <p>Total: ${amount}/week</p>
            <p>{credits} credits monthly ({credits/4} weekly)</p>
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
          <button type="submit" disabled={!stripe || processing}>
            {processing ? 'Processing...' : `Pay $${amount}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CheckoutForm; 