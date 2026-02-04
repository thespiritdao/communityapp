import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Verify Mercury webhook signature
 * Prevents unauthorized webhook spoofing
 */
function verifyMercurySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

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
    // TODO: Implement actual notification system
    console.log('📢 Executive Pod Notification:', notification);
  } catch (error) {
    console.error('❌ Failed to notify Executive Pod:', error);
  }
}

/**
 * POST /api/webhooks/mercury
 *
 * Handles Mercury transaction webhooks for donation tracking
 *
 * Event Types:
 * - transaction.created: New transaction detected (donation arrives)
 * - transaction.updated: Transaction status changed (pending → completed)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const signature = request.headers.get('mercury-signature');
    const body = await request.text();

    const isValid = verifyMercurySignature(
      body,
      signature,
      process.env.MERCURY_WEBHOOK_SECRET!
    );

    if (!isValid) {
      console.error('❌ Invalid Mercury webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);

    console.log('📨 Mercury webhook received:', {
      type: event.type,
      transactionId: event.data?.id
    });

    // ==================================================================
    // HANDLE TRANSACTION CREATED (DONATION ARRIVES)
    // ==================================================================

    if (event.type === 'transaction.created') {
      const transaction = event.data;

      // Only process incoming transactions (credits to your account)
      if (transaction.amount <= 0) {
        console.log('ℹ️ Skipping outgoing transaction');
        return NextResponse.json({ received: true });
      }

      // Skip internal transfers
      if (transaction.counterpartyName?.includes('SpiritDAO')) {
        console.log('ℹ️ Skipping internal transfer');
        return NextResponse.json({ received: true });
      }

      console.log('💰 New donation detected:', {
        transactionId: transaction.id,
        amount: transaction.amount / 100,
        status: transaction.status,
        counterparty: transaction.counterpartyName
      });

      // Check if donation already exists
      const { data: existing } = await supabase
        .from('pending_donations')
        .select('id')
        .eq('mercury_payment_id', transaction.id)
        .single();

      if (existing) {
        console.log('ℹ️ Donation already recorded');
        return NextResponse.json({ received: true });
      }

      const donationAmount = transaction.amount / 100;
      const mercuryFee = donationAmount * 0.008; // 0.8% ACH
      const platformFee = donationAmount * 0.075; // 7.5%
      const systemTokensToMint = donationAmount - mercuryFee - platformFee;

      const settlementDays = transaction.status === 'pending' ? 3 : 0;
      const settlementDate = settlementDays > 0
        ? new Date(Date.now() + settlementDays * 24 * 60 * 60 * 1000)
        : new Date();

      const status = transaction.status === 'pending'
        ? 'awaiting_settlement'
        : 'awaiting_executive_approval';

      // Create donation record
      const { data: donation, error: dbError } = await supabase
        .from('pending_donations')
        .insert({
          mercury_payment_id: transaction.id,
          payment_method: 'ach',
          user_wallet: transaction.note || 'UNKNOWN',
          donor_email: null,
          fiat_amount: donationAmount,
          system_tokens_to_mint: systemTokensToMint,
          org_fee: platformFee,
          mercury_fee: mercuryFee,
          settlement_days: settlementDays,
          settlement_date: settlementDate,
          is_reversible: false,
          status,
          mercury_confirmed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Failed to create donation record:', dbError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      console.log('✅ Donation recorded:', donation.id);

      // If already completed, notify executives
      if (transaction.status === 'completed') {
        await notifyExecutivePod({
          type: 'donation_ready_to_mint',
          donationId: donation.id,
          amount: systemTokensToMint,
          userWallet: transaction.note || 'UNKNOWN',
          paymentMethod: 'ACH (No chargeback risk)'
        });
      }

      return NextResponse.json({ received: true });
    }

    // ==================================================================
    // HANDLE TRANSACTION UPDATED (STATUS CHANGE)
    // ==================================================================

    if (event.type === 'transaction.updated') {
      const transaction = event.data;

      console.log('🔄 Transaction status updated:', {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount / 100
      });

      // Find donation by Mercury transaction ID
      const { data: donation, error: findError } = await supabase
        .from('pending_donations')
        .select('*')
        .eq('mercury_payment_id', transaction.id)
        .single();

      if (findError || !donation) {
        console.log('ℹ️ No matching donation found');
        return NextResponse.json({ received: true });
      }

      // If transaction completed, move to executive approval
      if (transaction.status === 'completed' && donation.status === 'awaiting_settlement') {
        const { error: updateError } = await supabase
          .from('pending_donations')
          .update({ status: 'awaiting_executive_approval' })
          .eq('id', donation.id);

        if (updateError) {
          console.error('❌ Failed to update donation status:', updateError);
          return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        console.log('✅ Donation settled, notifying executives');

        await notifyExecutivePod({
          type: 'donation_ready_to_mint',
          donationId: donation.id,
          amount: donation.system_tokens_to_mint,
          userWallet: donation.user_wallet,
          paymentMethod: 'ACH (No chargeback risk)'
        });
      }

      // If transaction failed
      if (transaction.status === 'failed') {
        await supabase
          .from('pending_donations')
          .update({
            status: 'failed',
            failure_reason: transaction.failureReason || 'Transaction failed'
          })
          .eq('id', donation.id);

        console.error('❌ Transaction failed:', transaction.failureReason);
      }

      return NextResponse.json({ received: true });
    }

    console.log(`ℹ️ Unhandled Mercury event type: ${event.type}`);
    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('❌ Mercury webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/mercury
 * Verification endpoint for Mercury webhook setup
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'active',
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com'}/api/webhooks/mercury`,
    message: 'Mercury webhook endpoint is ready'
  });
}
