import { appUrl } from '@/config/deployment';
import { PODS } from '@/config/deployment';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SYSTEM_DONATION_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EXEC_POD_ID = (PODS.governance ?? '');
const BASE_URL = appUrl();

/**
 * Notify all active Executive Pod members of a donation event via in-app notification.
 * Pulls member wallets directly from pod_members; hat ID from pods.token_address.
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
    // Fetch active EP members
    // pod_members keys members by `wallet` (not wallet_address) and
    // revoked_by_governance defaults to false (not null).
    const { data: members, error: membersError } = await supabase
      .from('pod_members')
      .select('wallet')
      .eq('pod_id', EXEC_POD_ID)
      .eq('is_active', true)
      .or('revoked_by_governance.is.null,revoked_by_governance.eq.false');

    if (membersError || !members?.length) {
      console.warn('⚠️ No EP members found for notification:', membersError?.message);
      return;
    }

    const isReadyToMint = notification.type === 'donation_ready_to_mint';
    const isCritical    = notification.type === 'CRITICAL_CHARGEBACK';

    const title = isCritical
      ? '🚨 Chargeback After Token Mint'
      : isReadyToMint
        ? 'New Donation Ready to Approve'
        : 'Donation Update';

    const amountDisplay = notification.amount != null
      ? `${Number(notification.amount).toFixed(2)} $SYSTEM`
      : '';

    const methodLabel = notification.paymentMethod || '';

    const message = isCritical
      ? (notification.message || `Chargeback filed after minting ${amountDisplay}`)
      : isReadyToMint
        ? `${amountDisplay} donation received via ${methodLabel}. Open the Donations tab to approve.`
        : (notification.message || 'A donation requires your attention.');

    const contextUrl = notification.donationId
      ? `/pods/${EXEC_POD_ID}/manage?tab=donations`
      : `/pods/${EXEC_POD_ID}/manage?tab=donations`;

    // Send in-app notification to each EP member
    await Promise.allSettled(
      members.map(({ wallet: wallet_address }) =>
        fetch(`${BASE_URL}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          },
          body: JSON.stringify({
            recipient_address: wallet_address,
            sender_address: '0x0000000000000000000000000000000000000000',
            notification_type: 'pod_approval_request',
            title,
            message,
            context_url: contextUrl,
            context_type: 'donation',
            context_id: notification.donationId,
            priority: isCritical ? 'urgent' : 'high',
            category: 'governance',
          }),
        })
      )
    );

    console.log(`📢 Notified ${members.length} EP member(s) — ${notification.type}`);
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
        process.env.STRIPE_SYSTEM_WEBHOOK_SECRET!
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

      const amount = paymentIntent.amount / 100;

      // Retrieve the charge to get actual payment method and fee data
      const charge = paymentIntent.latest_charge
        ? await stripe.charges.retrieve(paymentIntent.latest_charge as string)
        : null;

      // Get actual payment method from the charge (not payment_method_types which is just the allowed list)
      const paymentMethod = charge?.payment_method_details?.type
        ?? (paymentIntent.payment_method_types.includes('us_bank_account')
            && paymentIntent.payment_method_types.length === 1
              ? 'us_bank_account'
              : 'card');

      console.log('✅ Payment succeeded:', {
        paymentIntentId: paymentIntent.id,
        amount,
        paymentMethod,
        chargeId: charge?.id,
      });

      // Calculate actual Stripe fee from Stripe's balance transaction (most accurate)
      // Fallback: estimate based on actual payment method type
      // ACH: 0.8% capped at $5, no flat fee  |  Card: 2.9% + $0.30
      let actualStripeFee: number;
      if (charge?.balance_transaction) {
        const balanceTx = await stripe.balanceTransactions.retrieve(
          charge.balance_transaction as string
        );
        actualStripeFee = balanceTx.fee / 100;
      } else if (paymentMethod === 'us_bank_account') {
        actualStripeFee = Math.min(amount * 0.008, 5);
      } else {
        actualStripeFee = amount * 0.029 + 0.30;
      }

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

      // Update donation record (may not exist if payment came via Stripe Checkout or other flow)
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
        // No matching pending_donations row — payment may have come through Stripe Checkout
        // or another flow. Log it and return 200 so Stripe doesn't retry.
        console.warn('⚠️ No pending_donations row found for payment:', {
          paymentIntentId: paymentIntent.id,
          amount,
          paymentMethod,
          description: paymentIntent.description,
          metadata: paymentIntent.metadata,
        });
        return NextResponse.json({ received: true, note: 'No matching donation record' });
      }

      console.log(`📊 Donation status: ${newStatus}, settlement: ${settlementDays} days`);

      // Notify EP — immediately actionable for ACH, heads-up for card (settlement pending)
      await notifyExecutivePod({
        type: 'donation_ready_to_mint',
        donationId: donation.id,
        amount: systemTokensToMint,
        userWallet: donation.user_wallet,
        paymentMethod: settlementDays === 0
          ? 'ACH — ready to approve now'
          : `Card — settles in ${settlementDays} day${settlementDays !== 1 ? 's' : ''}`,
      });

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
