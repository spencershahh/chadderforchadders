import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Supabase client with the correct env variable names
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,        // matches your .env
  process.env.VITE_SUPABASE_ANON_KEY    // matches your .env
);

// Add some debugging
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('Stripe secret key is missing!');
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const app = express();

// Add proper CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://chadderal.vercel.app',
    process.env.VITE_APP_URL // fallback to environment variable
  ].filter(Boolean),  // removes any undefined/null values
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Updated price IDs
const SUBSCRIPTION_PRICES = {
  'pog': 'price_1QnrdfEDfrbbc35YnZ3tVoMS',      // Replace with your Stripe price ID for Pog tier
  'pogchamp': 'price_1Qnre1EDfrbbc35YQVAy7Z0E', // Replace with your Stripe price ID for Pogchamp tier
  'poggers': 'price_1QnreLEDfrbbc35YV7TtcIld'   // Replace with your Stripe price ID for Poggers tier
};

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'ok', prices: SUBSCRIPTION_PRICES });
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, credits } = req.body;
    
    console.log('Creating payment intent:', { amount, credits });
    
    // Convert amount to cents (amount is already in dollars)
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: { 
        credits,
        frequency: 'weekly'
      }
    });

    console.log('Payment intent created:', paymentIntent.id);
    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Stripe error details:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-subscription', async (req, res) => {
  try {
    const { paymentMethod, email, tier, credits, userId } = req.body;
    console.log('Creating subscription:', { tier, credits, userId });

    // First, check if customer exists and get any active subscriptions
    let customer;
    const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      
      // Get active subscriptions
      const activeSubscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });

      // If there's an active subscription, cancel it first
      if (activeSubscriptions.data.length > 0) {
        const currentSubscription = activeSubscriptions.data[0];
        // Cancel immediately instead of at period end
        await stripe.subscriptions.del(currentSubscription.id);
      }

      // Update payment method
      await stripe.paymentMethods.attach(paymentMethod, { customer: customer.id });
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        payment_method: paymentMethod,
        email: email,
        invoice_settings: {
          default_payment_method: paymentMethod,
        },
      });
    }

    // Create new subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: SUBSCRIPTION_PRICES[tier] }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: { 
        credits,
        tier,
        user_id: userId
      },
      expand: ['latest_invoice.payment_intent']
    });

    // Update user's subscription in Supabase
    const { error: dbError } = await supabase
      .from('users')
      .update({
        stripe_customer_id: customer.id,
        subscription_tier: tier,
        subscription_status: 'active'
      })
      .eq('id', userId);

    if (dbError) throw dbError;

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to handle subscription cancellation
app.post('/cancel-subscription', async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    res.json({ subscription });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to fetch subscriptions
app.get('/subscriptions/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      expand: ['data.default_payment_method']
    });

    res.json({ subscriptions: subscriptions.data });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Webhook event type:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const userId = subscription.metadata.user_id;
        const tier = subscription.metadata.tier;

        console.log('Processing subscription:', {
          userId,
          tier,
          event: event.type
        });

        // First update the user's subscription status directly
        const { error: userError } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            subscription_status: 'active',
            stripe_customer_id: subscription.customer
          })
          .eq('id', userId);

        if (userError) {
          console.error('Error updating user:', userError);
          throw userError;
        }

        // Then process the subscription renewal
        const { error: renewalError } = await supabase.rpc(
          'process_subscription_renewal',
          {
            p_user_id: userId,
            p_subscription_tier: tier
          }
        );

        if (renewalError) {
          console.error('Error processing renewal:', renewalError);
          throw renewalError;
        }

        console.log('Successfully processed subscription for user:', userId);
        break;

      case 'customer.subscription.deleted':
        const cancelledSub = event.data.object;
        const cancelledUserId = cancelledSub.metadata.user_id;

        console.log('Processing subscription cancellation:', {
          userId: cancelledUserId
        });

        // Update user's subscription status to inactive
        const { error: cancelError } = await supabase
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_tier: 'free'
          })
          .eq('id', cancelledUserId);

        if (cancelError) {
          console.error('Error cancelling subscription:', cancelError);
          throw cancelError;
        }

        console.log('Successfully cancelled subscription for user:', cancelledUserId);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    // Send a 200 response even on error to prevent Stripe from retrying
    res.status(200).json({ 
      error: err.message,
      received: true 
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available subscription tiers:', Object.keys(SUBSCRIPTION_PRICES));
}); 