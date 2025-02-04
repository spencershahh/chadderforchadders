import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all active subscribers
    const { data: users, error: userError } = await supabaseClient
      .from('users')
      .select('id, subscription_tier, subscription_status, last_credit_distribution')
      .eq('subscription_status', 'active')

    if (userError) throw userError

    // Process each active subscriber
    for (const user of users) {
      // Check if it's time for distribution (weekly)
      const lastDistribution = user.last_credit_distribution ? new Date(user.last_credit_distribution) : new Date(0)
      const now = new Date()
      const weekInMs = 7 * 24 * 60 * 60 * 1000
      
      if (now.getTime() - lastDistribution.getTime() >= weekInMs) {
        // Process credit distribution
        const { error: txError } = await supabaseClient.rpc('process_subscription_renewal', {
          p_user_id: user.id,
          p_subscription_tier: user.subscription_tier
        })

        if (txError) {
          console.error(`Error processing subscription for user ${user.id}:`, txError)
          continue
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Weekly credits processed successfully' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}) 