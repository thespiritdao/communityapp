import { ORG_EIN, ORG_NAME } from '@/config/deployment';
import { appUrl } from '@/config/deployment';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_DIRECT_DONATION_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/donations/direct-checkout
 *
 * Creates a Stripe Checkout Session for direct operational donations.
 * Uses the OLD Stripe account (STRIPE_DIRECT_DONATION_KEY) — 100% tax-deductible,
 * no token minting, all funds go to SpiritDAO operations.
 *
 * Flow:
 * 1. Validate inputs (min $1)
 * 2. Create Stripe Checkout Session on old account
 * 3. Store pending record in database
 * 4. Return checkout URL for client redirect
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, email, walletAddress } = body;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    const minAmount = 1;

    if (!amount || Number(amount) < minAmount) {
      return NextResponse.json(
        { error: `Minimum donation is $${minAmount}` },
        { status: 400 }
      );
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email address required' },
        { status: 400 }
      );
    }

    const fiatAmount = Number(amount);

    // =====================================================
    // 2. CREATE STRIPE CHECKOUT SESSION (OLD ACCOUNT)
    // =====================================================

    const baseUrl = appUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'us_bank_account'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(fiatAmount * 100),
            product_data: {
              name: `Direct Donation to ${ORG_NAME}`,
              description: `${ORG_NAME} is a 501(c)(3) nonprofit (EIN: ${ORG_EIN}). This donation is 100% tax-deductible. No goods or services are provided in exchange for this contribution.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        walletAddress,
        donationType: 'direct_donation',
        donorEmail: email,
      },
      success_url: `${baseUrl}/donate/direct-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/donate`,
    });

    console.log('Direct donation checkout session created:', session.id);

    // =====================================================
    // 3. STORE PENDING RECORD IN DATABASE
    // =====================================================

    const { data: donation, error: dbError } = await supabase
      .from('pending_donations')
      .insert({
        stripe_payment_id: session.id,
        payment_method: 'direct',
        user_wallet: walletAddress,
        donor_email: email,
        fiat_amount: fiatAmount,
        system_tokens_to_mint: 0,
        community_tokens_to_mint: 0,
        org_fee: 0,
        stripe_fee: 0,
        settlement_days: 0,
        is_reversible: false,
        status: 'direct_donation_pending',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error storing direct donation:', dbError);
      return NextResponse.json(
        { error: 'Failed to record donation', details: dbError.message },
        { status: 500 }
      );
    }

    console.log('Direct donation stored in database:', donation.id);

    // =====================================================
    // 4. RETURN CHECKOUT URL
    // =====================================================

    return NextResponse.json({
      success: true,
      url: session.url,
      donationId: donation.id,
    });
  } catch (error: any) {
    console.error('Direct checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
