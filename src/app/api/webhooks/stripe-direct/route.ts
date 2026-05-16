import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { sendDonationReceiptEmail } from '@/lib/donationReceipt';

const stripe = new Stripe(process.env.STRIPE_DIRECT_DONATION_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/webhooks/stripe-direct
 *
 * Webhook endpoint for the OLD Stripe account (direct operational donations).
 * Listens for checkout.session.completed events only.
 *
 * - Verifies signature using STRIPE_DIRECT_DONATION_WEBHOOK_SECRET
 * - Updates pending_donations record to 'direct_donation_completed'
 * - Logs to explorer activity feed
 * - No token minting, no settlement hold, no executive approval
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('Missing Stripe signature on direct donation webhook');
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_DIRECT_DONATION_WEBHOOK_SECRET!,
      );
    } catch (err: any) {
      console.error('Direct donation webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('Direct donation webhook received:', {
      type: event.type,
      id: event.id,
    });

    // =====================================================
    // HANDLE CHECKOUT SESSION COMPLETED
    // =====================================================

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const walletAddress = session.metadata?.walletAddress;
      const amount = (session.amount_total || 0) / 100;

      console.log('Direct donation completed:', {
        sessionId: session.id,
        amount,
        walletAddress,
        email: session.customer_email,
      });

      // Update pending_donations record
      const { data: donation, error: updateError } = await supabase
        .from('pending_donations')
        .update({
          status: 'direct_donation_completed',
          stripe_confirmed_at: new Date().toISOString(),
        })
        .eq('stripe_payment_id', session.id)
        .select()
        .single();

      if (updateError) {
        console.warn('No pending_donations row found for direct donation session:', {
          sessionId: session.id,
          amount,
        });
        // Return 200 so Stripe doesn't retry
        return NextResponse.json({ received: true, note: 'No matching donation record' });
      }

      // Log to explorer activity feed
      await recordExplorerEvent({
        type: 'donation',
        title: `Direct donation of $${amount.toFixed(2)} to SpiritDAO operations fund`,
        actor: walletAddress || null,
        amount_value: amount,
        amount_token: 'USD',
        metadata: {
          donation_type: 'direct',
          donation_id: donation.id,
          stripe_session_id: session.id,
        },
        dedupe_key: `donation:direct:${session.id}`,
      });

      console.log('Direct donation explorer event logged for donation:', donation.id);

      // Send PDF receipt email (fire-and-forget)
      const donorEmail = session.customer_email || donation.donor_email;
      if (donorEmail) {
        // Look up donor name from profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('wallet_address', (walletAddress || '').toLowerCase())
          .maybeSingle();

        const donorName = profile?.first_name
          ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
          : 'Valued Donor';

        const donationDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

        sendDonationReceiptEmail({
          type: 'direct',
          donorName,
          donorEmail,
          donationDate,
          paymentId: session.payment_intent as string || session.id,
          fiatAmount: amount,
        });
      }

      return NextResponse.json({ received: true });
    }

    // Ignore other event types
    console.log(`Unhandled direct donation event type: ${event.type}`);
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Direct donation webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/stripe-direct
 * Verification endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    message: 'Stripe direct donation webhook endpoint is ready',
  });
}
