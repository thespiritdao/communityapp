/**
 * API Route: Complete Onboarding
 *
 * POST /api/onboarding/complete
 *
 * Called after successful invite validation and NFT/hat minting
 * Marks user as onboarded (tokens available via faucet at /faucet)
 *
 * Server-side writes use the service-role client: this route has no Supabase
 * session, and anon holds no table grants. Status checks live in
 * /api/onboarding/status (the old unauthenticated GET here was removed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignInviteCodeToUser } from '@/services/inviteCodeService';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';

// nodejs (not edge): @coinbase/cdp-sdk needs the Node crypto runtime.
export const runtime = 'nodejs';

// ============================================================
// Request Types
// ============================================================

interface CompleteOnboardingRequest {
  walletAddress: string;
  isFirstUser: boolean;
  transactionHashes?: {
    poc?: string;
    hat?: string;
  };
}

// ============================================================
// POST Handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CompleteOnboardingRequest = await request.json();
    const { walletAddress, isFirstUser, transactionHashes } = body;

    // Validate required fields
    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Wallet address is required',
        },
        { status: 400 },
      );
    }

    // Normalize wallet address
    const normalizedWallet = walletAddress.toLowerCase();

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address format',
        },
        { status: 400 },
      );
    }

    // The caller must prove control of the wallet being marked onboarded.
    const verified = await verifyCdpWalletOwnership(
      request,
      walletAddress,
      body as unknown as Record<string, unknown>,
    );
    if (!verified.ok) {
      return NextResponse.json(
        { success: false, error: verified.error },
        { status: verified.status },
      );
    }

    console.log(`📋 Completing onboarding for ${normalizedWallet}...`);
    console.log(`   First user: ${isFirstUser}`);
    console.log(`   Transaction hashes:`, transactionHashes);

    // Step 1: Assign invite code to user (if not already assigned)
    try {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('referral_key')
        .eq('wallet_address', normalizedWallet)
        .single();

      if (!profile?.referral_key) {
        console.log('📝 Assigning invite code to user...');
        await assignInviteCodeToUser(normalizedWallet, supabaseAdmin);
      }
    } catch (error) {
      console.error('Error assigning invite code:', error);
      // Non-critical - continue onboarding
    }

    // Step 2: Mark user as onboarded
    console.log('✅ Marking user as onboarded...');
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        onboarded_at: new Date().toISOString(),
      })
      .eq('wallet_address', normalizedWallet);

    if (updateError) {
      console.error('Error updating onboarding status:', updateError);
      // Non-critical - user is onboarded even if this fails
    }

    // Success response
    console.log(`🎉 Onboarding complete for ${normalizedWallet}`);
    console.log('💰 User can claim tokens from faucet at /faucet');
    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      isFirstUser,
      faucetAvailable: true,
      faucetUrl: '/faucet',
    });
  } catch (error) {
    console.error('❌ Error completing onboarding:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while completing onboarding',
      },
      { status: 500 },
    );
  }
}
