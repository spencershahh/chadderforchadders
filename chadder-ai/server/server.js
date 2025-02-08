import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

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

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Add proper CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if(!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'https://chadderai.vercel.app',
      'https://chadder.ai',
      'https://chadderforchadders.onrender.com'
    ];
    
    // Allow all vercel.app subdomains
    if(origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Updated price IDs
const SUBSCRIPTION_PRICES = {
  'pog': 'price_1QnrdfEDfrbbc35YnZ3tVoMS',      // Pog tier
  'pogchamp': 'price_1Qnre1EDfrbbc35YQVAy7Z0E', // Pogchamp tier
  'poggers': 'price_1QnreLEDfrbbc35YV7TtcIld'   // Poggers tier
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

      // Check if user is trying to subscribe to the same tier
      if (activeSubscriptions.data.length > 0) {
        const currentSubscription = activeSubscriptions.data[0];
        if (currentSubscription.metadata.tier === tier) {
          return res.status(400).json({ error: 'You already have this subscription tier!' });
        }
        
        // Cancel existing subscription at period end
        await stripe.subscriptions.update(currentSubscription.id, {
          cancel_at_period_end: true
        });
      }

      // Attach new payment method
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

    // Reset credits and update user's subscription in Supabase
    const { error: dbError } = await supabase
      .from('users')
      .update({
        stripe_customer_id: customer.id,
        subscription_tier: tier,
        subscription_status: 'active',
        credits: 0, // Reset credits
        last_credit_distribution: new Date().toISOString()
      })
      .eq('id', userId);

    if (dbError) throw dbError;

    // Process initial credit distribution for the new tier
    const { error: renewalError } = await supabase.rpc('process_subscription_renewal', {
      p_user_id: userId,
      p_subscription_tier: tier
    });

    if (renewalError) throw renewalError;

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
      case 'checkout.session.completed':
        const session = event.data.object;
        
        // Get the subscription details from the session
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        
        // Extract user ID and tier from metadata
        const userId = session.metadata.userId;
        const tier = session.metadata.tier;
        
        console.log('Processing checkout completion:', {
          userId,
          tier,
          subscription: subscription.id,
          event: event.type
        });

        // Update user's subscription status and reset credits
        const { error: userError } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            tier: tier, // Update both fields for compatibility
            subscription_status: 'active',
            stripe_customer_id: session.customer,
            credits: 0, // Reset credits before distribution
            last_credit_distribution: new Date().toISOString()
          })
          .eq('id', userId);

        if (userError) {
          console.error('Error updating user:', userError);
          throw userError;
        }

        // Process initial credit distribution
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

        console.log('Successfully processed checkout completion for user:', userId);
        break;

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

        // First update the user's subscription status and reset credits
        const { error: userError } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            subscription_status: 'active',
            stripe_customer_id: subscription.customer,
            credits: 0, // Reset credits before distribution
            last_credit_distribution: new Date().toISOString()
          })
          .eq('id', userId);

        if (userError) {
          console.error('Error updating user:', userError);
          throw userError;
        }

        // Then process the subscription renewal with weekly credit distribution
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

// Remove admin middleware and routes
app.get('/api/streamers', async (req, res) => {
  try {
    const streamersData = await fs.readFile(path.join(__dirname, '../src/data/streamers.json'), 'utf8');
    res.json(JSON.parse(streamersData));
  } catch (error) {
    console.error('Error reading streamers:', error);
    res.status(500).json({ error: 'Failed to read streamers' });
  }
});

// Add keep-alive endpoint
app.get('/keep-alive', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/create-portal-session', async (req, res) => {
  try {
    const { userId, return_url } = req.body;
    console.log('Creating portal session for:', { userId, return_url });

    // Get the customer's Stripe ID from your database
    const { data: userData, error } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    console.log('Supabase response:', { userData, error });

    if (error || !userData?.stripe_customer_id) {
      console.error('No Stripe customer found:', { error, userData });
      throw new Error('No Stripe customer found');
    }

    console.log('Found Stripe customer:', userData.stripe_customer_id);

    // Create the portal session with configuration
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url,
      configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID
    });

    console.log('Created portal session:', session.url);
    res.json({ url: session.url });
  } catch (error) {
    console.error('Detailed error in portal session:', {
      message: error.message,
      type: error.type,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to create a Stripe Checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { userId, email, priceId, packageId, return_url } = req.body;

    // Create a new checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: return_url,
      cancel_url: `${return_url}?canceled=true`,
      metadata: {
        userId: userId,
        tier: packageId
      },
      subscription_data: {
        metadata: {
          userId: userId,
          tier: packageId
        }
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available subscription tiers:', Object.keys(SUBSCRIPTION_PRICES));
}); 