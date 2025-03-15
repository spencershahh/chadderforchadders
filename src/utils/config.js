import { 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  STRIPE_PUBLISHABLE_KEY,
  TWITCH_CLIENT_ID
} from '@env';

// Provide default values for local development
const config = {
  supabase: {
    url: SUPABASE_URL || 'https://your-project.supabase.co',
    anonKey: SUPABASE_ANON_KEY || 'your-anon-key',
  },
  stripe: {
    publishableKey: STRIPE_PUBLISHABLE_KEY || 'your-stripe-key'
  },
  twitch: {
    clientId: TWITCH_CLIENT_ID || 'your-twitch-client-id'
  }
};

export default config; 