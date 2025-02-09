import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Ensure required environment variables are present
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Required environment variables are missing:', {
    url: !!supabaseUrl,
    serviceKey: !!supabaseServiceRoleKey
  });
  process.exit(1);
}

const app = express();
app.use(express.json());

// Initialize Supabase client with service role key
const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

interface User {
  id: string;
  subscription_tier: string;
  subscription_status: string;
  last_credit_distribution: string | null;
}

app.post('/process-weekly-credits', async (_req: Request, res: Response) => {
  try {
    // Get all active subscribers
    const { data: users, error: userError } = await supabaseClient
      .from('users')
      .select('id, subscription_tier, subscription_status, last_credit_distribution')
      .eq('subscription_status', 'active');

    if (userError) throw userError;

    // Process each active subscriber
    for (const user of users as User[]) {
      // Check if it's time for distribution (weekly)
      const lastDistribution = user.last_credit_distribution ? new Date(user.last_credit_distribution) : new Date(0);
      const now = new Date();
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      
      if (now.getTime() - lastDistribution.getTime() >= weekInMs) {
        // Process credit distribution
        const { error: txError } = await supabaseClient.rpc('process_subscription_renewal', {
          p_user_id: user.id,
          p_subscription_tier: user.subscription_tier
        });

        if (txError) {
          console.error(`Error processing subscription for user ${user.id}:`, txError);
          continue;
        }
      }
    }

    res.json({ message: 'Weekly credits processed successfully' });
  } catch (error) {
    console.error('Error processing weekly credits:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const PORT = process.env.PORT || 3002;

// Start the server
app.listen(PORT, () => {
  console.log(`Weekly credits processor listening on port ${PORT}`);
}); 