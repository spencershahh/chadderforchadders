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

// Configure express to use JSON for regular routes
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Add proper CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Always allow webhook requests (they come from Stripe)
    if (!origin || origin === 'https://api.stripe.com') {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:5173',
      'https://chadderai.vercel.app',
      'https://chadder.ai',
      'https://chadderforchadders.onrender.com',
      'https://www.chadderforchadders.onrender.com'
    ];
    
    // Allow all vercel.app subdomains and specified origins
    if (allowedOrigins.includes(origin) || 
        origin.endsWith('.vercel.app') || 
        origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature']
}));

// Updated price IDs
const SUBSCRIPTION_PRICES = {
  'common': 'price_1QnrdfEDfrbbc35YnZ3tVoMS',      // Common tier
  'rare': 'price_1Qnre1EDfrbbc35YQVAy7Z0E',        // Rare tier
  'epic': 'price_1QnreLEDfrbbc35YV7TtcIld'         // Epic tier
};

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'ok', prices: SUBSCRIPTION_PRICES });
});

// Create payment intent for one-time payments
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, credits } = req.body;
    
    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: { 
        credits,
        type: 'one_time'
      }
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create subscription with direct card payment
app.post('/create-subscription', async (req, res) => {
  try {
    const { paymentMethod, email, tier, credits, userId } = req.body;

    // First, check if customer exists
    let customer;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      
      // Get active subscriptions
      const activeSubscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });

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
        metadata: {
          user_id: userId
        }
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: SUBSCRIPTION_PRICES[tier] }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: { 
        credits,
        tier,
        user_id: userId,
        type: 'subscription'
      },
      expand: ['latest_invoice.payment_intent']
    });

    res.json({ 
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      customerId: customer.id,
      subscriptionId: subscription.id
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
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

// Add this near your other constants
const PRIZE_POOL_PERCENTAGE = 0.55; // 55% of revenue goes to prize pool

// Add this helper function
async function updatePrizePool() {
  try {
    console.log('Starting prize pool update calculation');
    const { data, error } = await supabase.rpc('calculate_weekly_prize_pool');
    
    if (error) {
      console.error('Error in calculate_weekly_prize_pool RPC:', error);
      throw error;
    }
    
    console.log('Prize pool calculation result:', data);
    
    // Notify clients about the updated prize pool
    await supabase.from('prize_pool')
      .select('*')
      .eq('is_active', true)
      .order('week_start', { ascending: false })
      .limit(1)
      .single()
      .then(({ data: poolData, error: poolError }) => {
        if (poolError) {
          console.error('Error fetching updated prize pool:', poolError);
        } else {
          console.log('Current prize pool state:', poolData);
        }
      });

    return data;
  } catch (err) {
    console.error('Error updating prize pool:', err);
    throw err;
  }
}

// Update webhook handler to handle both payment types
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('Webhook event received:', event.type, JSON.stringify(event.data.object, null, 2));
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session);
        
        // Get the subscription
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        console.log('Subscription retrieved:', subscription);

        const userId = session.metadata.userId;
        const tier = session.metadata.tier;
        
        console.log('Updating user:', { userId, tier });

        // Update user's subscription status
        const { error: userError } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            subscription_status: 'active',
            stripe_customer_id: session.customer,
            credits: 0, // Reset credits before distribution
            last_credit_distribution: null // Set to null to ensure immediate distribution
          })
          .eq('id', userId);

        if (userError) {
          console.error('Error updating user:', userError);
          throw userError;
        }

        // Process credit distribution
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

        // Update prize pool
        await updatePrizePool();

        // Calculate amount per week based on tier
        const amountPerWeek = tier === 'common' ? 3 : tier === 'rare' ? 5 : tier === 'epic' ? 7 : 0;

        // Update subscription amount for prize pool calculation
        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            amount_per_week: amountPerWeek,
            status: 'active',
            subscription_tier: tier, // Explicitly set the tier
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (subscriptionError) {
          console.error('Error updating subscription:', subscriptionError);
          throw subscriptionError;
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log('Subscription updated:', subscription);
        
        if (subscription.status === 'active') {
          const userId = subscription.metadata.user_id;
          const tier = subscription.metadata.tier;
          
          console.log('Updating user subscription:', { userId, tier });

          // Update user's subscription status
          const { error: userError } = await supabase
            .from('users')
            .update({
              subscription_tier: tier,
              subscription_status: 'active',
              credits: 0, // Reset credits before distribution
              last_credit_distribution: null // Set to null to ensure immediate distribution
            })
            .eq('id', userId);

          if (userError) {
            console.error('Error updating user:', userError);
            throw userError;
          }

          // Process credit distribution
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

          // Update prize pool
          await updatePrizePool();

          // Calculate amount per week based on tier
          const amountPerWeek = tier === 'common' ? 3 : tier === 'rare' ? 5 : tier === 'epic' ? 7 : 0;

          // Update subscription amount for prize pool calculation
          const { error: subscriptionError } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              amount_per_week: amountPerWeek,
              status: 'active',
              subscription_tier: tier, // Explicitly set the tier
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });

          if (subscriptionError) {
            console.error('Error updating subscription:', subscriptionError);
            throw subscriptionError;
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata.userId;

        console.log('Subscription deleted:', { userId });

        const { error: statusError } = await supabase
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_tier: 'free'
          })
          .eq('id', userId);

        if (statusError) {
          console.error('Error updating user status:', statusError);
          throw statusError;
        }

        // Update subscription amount for prize pool calculation
        await supabase.from('subscriptions')
          .delete()
          .eq('user_id', userId);
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    // Send 200 to acknowledge receipt but log the error
    res.status(200).json({ error: err.message, received: true });
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
    const { userId } = req.body;
    console.log('Creating portal session for:', { userId });

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
      return_url: 'https://chadderai.vercel.app/dashboard',
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
    const { userId, email, priceId, packageId } = req.body;

    // First, try to find or create a Stripe customer
    let stripeCustomerId;
    
    // Check if user already has a Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    if (userData?.stripe_customer_id) {
      stripeCustomerId = userData.stripe_customer_id;
    } else {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: userId
        }
      });
      stripeCustomerId = customer.id;

      // Update user with new Stripe customer ID
      const { error: updateError } = await supabase
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', userId);

      if (updateError) throw updateError;
    }

    // Create a new checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: 'https://chadderai.vercel.app/settings?session_id={CHECKOUT_SESSION_ID}&success=true',
      cancel_url: 'https://chadderai.vercel.app/credits?canceled=true',
      metadata: {
        userId: userId,
        tier: packageId
      },
      subscription_data: {
        metadata: {
          userId: userId,
          tier: packageId
        }
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      client_reference_id: userId // Add this to ensure we have a backup reference
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to get current prize pool
app.get('/prize-pool', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prize_pool')
      .select('*')
      .eq('is_active', true)
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    res.json({
      amount: data?.current_amount || 0,
      weekStart: data?.week_start,
      weekEnd: data?.week_end
    });
  } catch (error) {
    console.error('Error fetching prize pool:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available subscription tiers:', Object.keys(SUBSCRIPTION_PRICES));
}); 