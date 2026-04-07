import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Notify Executive Pod about events requiring approval
 */
async function notifyExecutivePod(notification: {
  type: string;
  donationId?: string;
  amount?: number;
  userWallet?: string;
  paymentMethod?: string;
  message?: string;
}) {
  try {
    console.log('📢 Executive Pod Notification:', notification);
    // TODO: Implement actual notification (email/Discord/in-app)
  } catch (error) {
    console.error('❌ Failed to notify Executive Pod:', error);
  }
}

/**
 * Calculate settlement hold period based on amount and payment method
 * $10 minimum for all cards
 */
function calculateSettlementPeriod(amount: number, paymentMethod: string): number {
  // ACH has no chargeback risk
  if (paymentMethod === 'us_bank_account') {
    return 0; // Instant after Stripe confirms (3-5 business days handled by Stripe)
  }

  // Credit cards: tiered settlement
  if (amount < 100) {
    return Number(process.env.STRIPE_SETTLEMENT_SMALL) || 3; // 3 days
  } else if (amount < 500) {
    return Number(process.env.STRIPE_SETTLEMENT_MEDIUM) || 5; // 5 days
  } else {
    return Number(process.env.STRIPE_SETTLEMENT_LARGE) || 7; // 7 days
  }
}

/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events for donation processing
 *
 * Event Types:
 * - payment_intent.succeeded: Payment confirmed
 * - payment_intent.payment_failed: Payment failed
 * - charge.dispute.created: Chargeback filed
 * - charge.dispute.closed: Chargeback resolved
 */
export async function POST(request: NextRequest) {
  try {
    // =====================================================
    // 1. VERIFY WEBHOOK SIGNATURE
    // =====================================================

    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('❌ Missing Stripe signature');
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log('📨 Stripe webhook received:', {
      type: event.type,
      id: event.id
    });

    // =====================================================
    // 2. HANDLE PAYMENT SUCCESS
    // =====================================================

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.log('✅ Payment succeeded:', {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        paymentMethod: paymentIntent.payment_method_types[0]
      });

      // Get actual payment method used
      const paymentMethod = paymentIntent.payment_method_types[0];
      const amount = paymentIntent.amount / 100;

      // Calculate actual Stripe fee (available after payment)
      const charge = paymentIntent.latest_charge
        ? await stripe.charges.retrieve(paymentIntent.latest_charge as string)
        : null;

      const actualStripeFee = charge
        ? (charge.balance_transaction
            ? (await stripe.balanceTransactions.retrieve(
                charge.balance_transaction as string
              )).fee / 100
            : amount * (paymentMethod === 'us_bank_account' ? 0.008 : 0.029) + 0.30)
        : amount * 0.029 + 0.30;

      // Recalculate tokens with actual Stripe fee
      // Platform fee is 8% of NET (post-Stripe) so we never lose money
      // 4% ops (cash, not minted) + 4% community pool ($SYSTEM to Exec Pod treasury)
      const netAfterStripe = amount - actualStripeFee;
      const platformFeePercentage = Number(process.env.DONATION_PLATFORM_FEE_PERCENTAGE) || 8;
      const platformFee = netAfterStripe * (platformFeePercentage / 100);
      const communityTokensToMint = netAfterStripe * ((platformFeePercentage / 2) / 100); // 4%
      const systemTokensToMint = netAfterStripe - platformFee;

      // Calculate settlement period
      const settlementDays = calculateSettlementPeriod(amount, paymentMethod);
      const settlementDate = settlementDays > 0
        ? new Date(Date.now() + settlementDays * 24 * 60 * 60 * 1000)
        : new Date();

      const newStatus = settlementDays > 0
        ? 'awaiting_settlement'
        : 'awaiting_executive_approval';

      // Update donation record
      const { data: donation, error: updateError } = await supabase
        .from('pending_donations')
        .update({
          payment_method: paymentMethod,
          stripe_fee: actualStripeFee,
          system_tokens_to_mint: systemTokensToMint,
          community_tokens_to_mint: communityTokensToMint,
          settlement_days: settlementDays,
          settlement_date: settlementDate,
          is_reversible: paymentMethod !== 'us_bank_account',
          status: newStatus,
          stripe_confirmed_at: new Date().toISOString()
        })
        .eq('stripe_payment_id', paymentIntent.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update donation:', updateError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      console.log(`📊 Donation status: ${newStatus}, settlement: ${settlementDays} days`);

      // If ACH (instant) or completed, notify executives
      if (settlementDays === 0) {
        await notifyExecutivePod({
          type: 'donation_ready_to_mint',
          donationId: donation.id,
          amount: systemTokensToMint,
          userWallet: donation.user_wallet,
          paymentMethod: paymentMethod === 'us_bank_account' ? 'ACH (No chargeback risk)' : 'Credit Card'
        });
      }

      return NextResponse.json({ received: true });
    }

    // =====================================================
    // 3. HANDLE PAYMENT FAILURE
    // =====================================================

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.error('❌ Payment failed:', {
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error?.message
      });

      await supabase
        .from('pending_donations')
        .update({
          status: 'failed',
          failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed'
        })
        .eq('stripe_payment_id', paymentIntent.id);

      return NextResponse.json({ received: true });
    }

    // =====================================================
    // 4. HANDLE CHARGEBACK (CRITICAL)
    // =====================================================

    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;

      console.error('🚨 CHARGEBACK ALERT:', {
        chargeId: dispute.charge,
        amount: dispute.amount / 100,
        reason: dispute.reason
      });

      // Find donation by charge ID
      const charge = await stripe.charges.retrieve(dispute.charge as string);
      const paymentIntentId = charge.payment_intent;

      const { data: donation } = await supabase
        .from('pending_donations')
        .select('*')
        .eq('stripe_payment_id', paymentIntentId)
        .single();

      if (!donation) {
        console.error('❌ Donation not found for disputed charge');
        return NextResponse.json({ received: true });
      }

      if (donation.status === 'minted') {
        // CRITICAL: Tokens already minted
        console.error('🚨🚨🚨 CRITICAL: Chargeback after token mint!');

        await notifyExecutivePod({
          type: 'CRITICAL_CHARGEBACK',
          donationId: donation.id,
          amount: donation.system_tokens_to_mint,
          userWallet: donation.user_wallet,
          message: `⚠️ URGENT: $${donation.fiat_amount} chargeback after minting ${donation.system_tokens_to_mint} $SYSTEM tokens!`
        });
      } else {
        console.log('✅ Chargeback caught before minting');
      }

      // Mark as disputed
      await supabase
        .from('pending_donations')
        .update({
          status: 'disputed',
          disputed_at: new Date().toISOString(),
          dispute_reason: dispute.reason || 'Chargeback filed'
        })
        .eq('id', donation.id);

      return NextResponse.json({ received: true });
    }

    // =====================================================
    // 5. HANDLE DISPUTE RESOLUTION
    // =====================================================

    if (event.type === 'charge.dispute.closed') {
      const dispute = event.data.object as Stripe.Dispute;

      console.log('⚖️ Dispute resolved:', {
        chargeId: dispute.charge,
        status: dispute.status
      });

      const charge = await stripe.charges.retrieve(dispute.charge as string);
      const paymentIntentId = charge.payment_intent;

      if (dispute.status === 'won') {
        // You won the dispute - restore donation
        await supabase
          .from('pending_donations')
          .update({ status: 'awaiting_executive_approval' })
          .eq('stripe_payment_id', paymentIntentId);

        console.log('✅ Dispute won, donation restored');
      } else {
        // You lost the dispute - keep as disputed
        console.log('❌ Dispute lost, donation remains disputed');
      }

      return NextResponse.json({ received: true });
    }

    console.log(`ℹ️ Unhandled Stripe event type: ${event.type}`);
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('❌ Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/stripe
 * Verification endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    message: 'Stripe webhook endpoint is ready'
  });
}
