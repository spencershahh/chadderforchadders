import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://deno.land/x/supabase_js@2.0.0/mod.ts'

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all active subscriptions that need renewal
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('is_active', true)
      .lte('next_renewal_date', new Date().toISOString())

    if (subError) throw subError

    // Process each subscription
    for (const sub of subscriptions) {
      // Begin transaction
      const { error: txError } = await supabaseClient.rpc('process_subscription_renewal', {
        p_subscription_id: sub.id,
        p_credits_amount: sub.credits_per_week
      })

      if (txError) {
        console.error(`Error processing subscription ${sub.id}:`, txError)
        continue
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