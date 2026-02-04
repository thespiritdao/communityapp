import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/donations/create-payment
 *
 * Creates a Mercury payment intent for fiat donations
 * Supports both ACH (bank account) and credit card payments
 *
 * Flow:
 * 1. Validate donation amount (min $10)
 * 2. Calculate fees and $SYSTEM tokens to mint
 * 3. Create Mercury payment intent
 * 4. Store pending donation in database
 * 5. Return payment details to frontend
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      amount,
      donorEmail,
      userWallet,
      paymentMethod // 'ach' or 'card'
    } = body;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!amount || amount < 10) {
      return NextResponse.json(
        { error: 'Minimum donation is $10' },
        { status: 400 }
      );
    }

    if (!userWallet) {
      return NextResponse.json(
        { error: 'User wallet address required' },
        { status: 400 }
      );
    }

    if (!['ach', 'card'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method. Use "ach" or "card"' },
        { status: 400 }
      );
    }

    // =====================================================
    // 2. CALCULATE FEES AND TOKENS
    // =====================================================

    const fiatAmount = Number(amount);

    // Mercury fees
    const mercuryFeePercentage = paymentMethod === 'ach' ? 0.008 : 0.029; // 0.8% ACH, 2.9% card
    const mercuryFeeFixed = paymentMethod === 'ach' ? 0 : 0.30; // $0.30 for cards
    const mercuryFee = (fiatAmount * mercuryFeePercentage) + mercuryFeeFixed;

    // Platform fee (7.5% of original amount)
    const platformFee = fiatAmount * 0.075;

    // User receives remaining amount in $SYSTEM tokens
    const systemTokensToMint = fiatAmount - mercuryFee - platformFee;

    // Settlement period
    const settlementDays = paymentMethod === 'ach' ? 0 : 5; // ACH instant, card 5-day hold
    const settlementDate = settlementDays > 0
      ? new Date(Date.now() + settlementDays * 24 * 60 * 60 * 1000)
      : new Date();

    console.log('💰 Donation calculation:', {
      fiatAmount,
      mercuryFee: mercuryFee.toFixed(2),
      platformFee: platformFee.toFixed(2),
      systemTokensToMint: systemTokensToMint.toFixed(2),
      settlementDays,
      paymentMethod
    });

    // =====================================================
    // 3. CREATE MERCURY PAYMENT INTENT
    // =====================================================

    const mercuryResponse = await fetch('https://api.mercury.com/api/v1/payments/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MERCURY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(fiatAmount * 100), // Convert to cents
        currency: 'usd',
        payment_method: paymentMethod,
        description: `SpiritDAO Donation - ${userWallet.slice(0, 10)}...`,
        metadata: {
          userWallet,
          systemTokenAmount: systemTokensToMint.toFixed(8),
          platformFee: platformFee.toFixed(2),
          donorEmail: donorEmail || 'anonymous'
        }
      })
    });

    if (!mercuryResponse.ok) {
      const errorData = await mercuryResponse.json();
      console.error('❌ Mercury payment creation failed:', errorData);
      return NextResponse.json(
        { error: 'Payment processor error', details: errorData.message },
        { status: 500 }
      );
    }

    const payment = await mercuryResponse.json();

    console.log('✅ Mercury payment created:', {
      paymentId: payment.id,
      amount: fiatAmount,
      method: paymentMethod
    });

    // =====================================================
    // 4. STORE PENDING DONATION IN DATABASE
    // =====================================================

    const { data: donation, error: dbError } = await supabase
      .from('pending_donations')
      .insert({
        mercury_payment_id: payment.id,
        payment_method: paymentMethod,
        user_wallet: userWallet,
        donor_email: donorEmail || null,
        fiat_amount: fiatAmount,
        system_tokens_to_mint: systemTokensToMint,
        org_fee: platformFee,
        mercury_fee: mercuryFee,
        settlement_days: settlementDays,
        settlement_date: settlementDate,
        is_reversible: paymentMethod === 'card',
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
    // 5. RETURN PAYMENT DETAILS TO FRONTEND
    // =====================================================

    return NextResponse.json({
      success: true,
      donation: {
        id: donation.id,
        mercuryPaymentId: payment.id,
        amount: fiatAmount,
        systemTokens: systemTokensToMint.toFixed(2),
        platformFee: platformFee.toFixed(2),
        mercuryFee: mercuryFee.toFixed(2),
        settlementDays,
        settlementDate: settlementDate.toISOString(),
        paymentMethod,
        isReversible: paymentMethod === 'card'
      },
      // Frontend needs these to complete payment flow
      paymentIntent: {
        clientSecret: payment.client_secret, // For card payments
        confirmationUrl: payment.confirmation_url, // For ACH bank connection
        redirectUrl: payment.hosted_url // Alternative Mercury-hosted payment page
      }
    });

  } catch (error: any) {
    console.error('❌ Donation creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/donations/create-payment?donationId=xxx
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
        mintedAt: donation.minted_at
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
