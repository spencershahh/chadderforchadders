import Stripe from 'stripe';
import { type NextRequest, NextResponse } from 'next/server';

// Add explicit Next.js types to fix module resolution
export type { NextRequest } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as const
});

export async function POST(req: NextRequest) {
  try {
    const { priceId, userId } = await req.json();

    // Create Checkout Sessions from body params
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?canceled=true`,
      metadata: {
        userId: userId,
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json({ error: 'Error creating checkout session' }, { status: 500 });
  }
} 