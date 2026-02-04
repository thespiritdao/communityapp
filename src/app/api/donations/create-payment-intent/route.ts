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
 * POST /api/donations/create-payment-intent
 *
 * Creates a Stripe PaymentIntent for fiat donations
 * Supports both credit cards and ACH bank accounts
 *
 * Flow:
 * 1. Validate donation amount (min $10)
 * 2. Calculate fees and $SYSTEM tokens
 * 3. Create Stripe PaymentIntent
 * 4. Store pending donation in database
 * 5. Return client_secret for frontend
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      amount,
      userWallet,
      donorEmail,
      paymentMethodTypes = ['card', 'us_bank_account'] // Support both by default
    } = body;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    const minAmount = Number(process.env.DONATION_MIN_AMOUNT) || 10;

    if (!amount || amount < minAmount) {
      return NextResponse.json(
        { error: `Minimum donation is $${minAmount}` },
        { status: 400 }
      );
    }

    if (!userWallet) {
      return NextResponse.json(
        { error: 'User wallet address required' },
        { status: 400 }
      );
    }

    // =====================================================
    // 2. CALCULATE FEES AND TOKENS
    // =====================================================

    const fiatAmount = Number(amount);
    const platformFeePercentage = Number(process.env.DONATION_PLATFORM_FEE_PERCENTAGE) || 7.5;
    const platformFee = fiatAmount * (platformFeePercentage / 100);

    // Stripe fees (estimated, actual calculated after payment)
    // Card: 2.9% + $0.30
    // ACH: 0.8% (no fixed fee)
    const estimatedStripeFeeCard = (fiatAmount * 0.029) + 0.30;
    const estimatedStripeFeeACH = fiatAmount * 0.008;

    // Use card fees as conservative estimate
    const estimatedStripeFee = estimatedStripeFeeCard;

    // User receives after both fees
    const systemTokensToMint = fiatAmount - estimatedStripeFee - platformFee;

    console.log('💰 Donation calculation:', {
      fiatAmount,
      estimatedStripeFee: estimatedStripeFee.toFixed(2),
      platformFee: platformFee.toFixed(2),
      systemTokensToMint: systemTokensToMint.toFixed(2)
    });

    // =====================================================
    // 3. CREATE STRIPE PAYMENT INTENT
    // =====================================================

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(fiatAmount * 100), // Convert to cents
      currency: 'usd',
      payment_method_types: paymentMethodTypes,
      metadata: {
        userWallet,
        systemTokenAmount: systemTokensToMint.toFixed(8),
        platformFee: platformFee.toFixed(2),
        donorEmail: donorEmail || 'anonymous',
        donationType: 'crypto_token_reward'
      },
      description: `SpiritDAO Donation - ${userWallet.slice(0, 10)}...`,
      receipt_email: donorEmail || undefined,
      statement_descriptor_suffix: 'SPIRITDAO' // Max 22 chars, shows on bank statement
    });

    console.log('✅ Stripe PaymentIntent created:', paymentIntent.id);

    // =====================================================
    // 4. STORE PENDING DONATION IN DATABASE
    // =====================================================

    const { data: donation, error: dbError } = await supabase
      .from('pending_donations')
      .insert({
        mercury_payment_id: paymentIntent.id, // Reusing column for Stripe payment intent ID
        payment_method: 'card', // Will update after payment confirms actual method
        user_wallet: userWallet,
        donor_email: donorEmail || null,
        fiat_amount: fiatAmount,
        system_tokens_to_mint: systemTokensToMint,
        org_fee: platformFee,
        mercury_fee: estimatedStripeFee, // Reusing column for Stripe fee
        settlement_days: 0, // Will calculate after payment
        settlement_date: null,
        is_reversible: true, // Cards can chargeback
        status: 'payment_pending'
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database error storing donation:', dbError);
      return NextResponse.json(
        { error: 'Failed to record donation', details: dbError.message },
        { status: 500 }
      );
    }

    console.log('✅ Donation stored in database:', donation.id);

    // =====================================================
    // 5. RETURN CLIENT SECRET TO FRONTEND
    // =====================================================

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      donation: {
        id: donation.id,
        paymentIntentId: paymentIntent.id,
        amount: fiatAmount,
        systemTokens: systemTokensToMint.toFixed(2),
        platformFee: platformFee.toFixed(2),
        estimatedStripeFee: estimatedStripeFee.toFixed(2),
        minAmount,
        supportedMethods: paymentMethodTypes
      }
    });

  } catch (error: any) {
    console.error('❌ Payment intent creation error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
        errorType: error.type || error.constructor?.name,
        errorCode: error.code,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/donations/create-payment-intent?donationId=xxx
 *
 * Check status of a pending donation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const donationId = searchParams.get('donationId');

    if (!donationId) {
      return NextResponse.json(
        { error: 'donationId required' },
        { status: 400 }
      );
    }

    const { data: donation, error } = await supabase
      .from('pending_donations')
      .select('*')
      .eq('id', donationId)
      .single();

    if (error || !donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      donation: {
        id: donation.id,
        status: donation.status,
        amount: donation.fiat_amount,
        systemTokens: donation.system_tokens_to_mint,
        settlementDate: donation.settlement_date,
        createdAt: donation.created_at,
        mintedAt: donation.minted_at,
        paymentMethod: donation.payment_method
      }
    });

  } catch (error: any) {
    console.error('❌ Donation status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
