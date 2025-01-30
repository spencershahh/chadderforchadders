import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('Stripe-Signature') as string;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      // Add credits to user account
      await addCreditsToUser(session.metadata.userId, 100); // Adjust credit amount as needed
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

async function addCreditsToUser(userId: string, credits: number) {
  // Implement your database logic here to add credits to the user
  // Example with Prisma:
  // await prisma.user.update({
  //   where: { id: userId },
  //   data: {
  //     credits: {
  //       increment: credits
  //     }
  //   }
  // });
} 