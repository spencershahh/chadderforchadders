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
  'common': 'price_1QnrdfEDfrbbc35YnZ3tVoMS',      // Common tier (was pog)
  'rare': 'price_1Qnre1EDfrbbc35YQVAy7Z0E',        // Rare tier (was pogchamp)
  'epic': 'price_1QnreLEDfrbbc35YV7TtcIld'         // Epic tier (was poggers)
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

    // Process initial credit distribution
    console.log('Starting credit distribution for tier:', tier);
    console.log('User ID:', userId);
    console.log('Current timestamp:', new Date().toISOString());
    
    // Get current credits before update
    const { data: beforeUser } = await supabase
      .from('users')
      .select('credits, subscription_tier')
      .eq('id', userId)
      .single();
    console.log('Credits before update:', beforeUser?.credits);

    const { data: renewalData, error: renewalError } = await supabase.rpc(
      'process_subscription_renewal',
      {
        p_user_id: userId,
        p_subscription_tier: tier
      }
    );

    if (renewalError) {
      console.error('Error processing renewal in Supabase:', renewalError);
      throw renewalError;
    }
    console.log('Credit distribution result:', renewalData);

    // Verify the credits were updated
    const { data: updatedUser, error: verifyError } = await supabase
      .from('users')
      .select('credits, subscription_tier, last_credit_distribution')
      .eq('id', userId)
      .single();

    if (verifyError) {
      console.error('Error verifying credit update:', verifyError);
    } else {
      console.log('Updated user data:', {
        credits: updatedUser.credits,
        tier: updatedUser.subscription_tier,
        lastDistribution: updatedUser.last_credit_distribution
      });
    }

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

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  console.log('Received webhook request');
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Raw body length:', req.body?.length);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Stripe-Signature:', sig);

  // Verify webhook secret is configured
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set in environment!');
    return res.status(500).send('Webhook secret is not configured');
  }

  try {
    // Convert raw body buffer to string if needed
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
    
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('Webhook verified successfully');
    console.log('Event type:', event.type);
    console.log('Event data:', JSON.stringify(event.data, null, 2));
  } catch (err) {
    console.error('Webhook verification failed:', {
      error: err.message,
      signature: sig,
      secretLength: process.env.STRIPE_WEBHOOK_SECRET?.length,
      bodyLength: req.body?.length
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        let userId, tier, customerId;

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          userId = session.metadata.userId;
          tier = session.metadata.tier;
          customerId = session.customer;
        } else {
          const subscription = event.data.object;
          userId = subscription.metadata.user_id;
          tier = subscription.metadata.tier;
          customerId = subscription.customer;
        }

        console.log('Processing subscription event:', {
          userId,
          tier,
          customerId,
          event: event.type
        });

        // Update user's subscription status
        const { error: userError } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            subscription_status: 'active',
            stripe_customer_id: customerId,
            credits: 0, // Reset credits before distribution
            last_credit_distribution: new Date().toISOString()
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

        // Record subscription revenue if it's a new subscription or renewal
        if (event.type !== 'customer.subscription.updated' || 
            event.data.object.status === 'active') {
          const { error: revenueError } = await supabase
            .from('subscription_revenue')
            .insert([{
              user_id: userId,
              amount: event.data.object.items.data[0].price.unit_amount / 100,
              subscription_id: event.data.object.id,
              subscription_tier: tier,
              payment_status: 'succeeded'
            }]);

          if (revenueError) {
            console.error('Error recording revenue:', revenueError);
            throw revenueError;
          }
        }

        // Update prize pool
        await updatePrizePool();
        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.pending_update_expired':
      case 'customer.subscription.pending_update_applied': {
        const subscription = event.data.object;
        const userId = subscription.metadata.user_id;
        const status = event.type === 'customer.subscription.paused' ? 'paused' : 
                      event.type === 'customer.subscription.deleted' ? 'cancelled' : 
                      subscription.status;

        console.log('Processing subscription status change:', {
          userId,
          status,
          event: event.type
        });

        const { error: statusError } = await supabase
          .from('users')
          .update({
            subscription_status: status === 'cancelled' ? 'inactive' : status,
            subscription_tier: status === 'cancelled' ? 'free' : undefined
          })
          .eq('id', userId);

        if (statusError) {
          console.error('Error updating subscription status:', statusError);
          throw statusError;
        }

        // Update prize pool after subscription changes
        await updatePrizePool();
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = subscription.metadata.user_id;

        console.log('Processing failed payment:', {
          userId,
          invoiceId: invoice.id
        });

        const { error: failureError } = await supabase
          .from('users')
          .update({
            subscription_status: 'past_due'
          })
          .eq('id', userId);

        if (failureError) {
          console.error('Error updating subscription status:', failureError);
          throw failureError;
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
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
      success_url: `${return_url}?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${return_url}?canceled=true`,
      metadata: {
        userId: userId,
        tier: packageId,
        return_url: return_url
      },
      subscription_data: {
        metadata: {
          userId: userId,
          tier: packageId
        }
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_creation: 'always'
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