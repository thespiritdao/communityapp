/**
 * API Route: Complete Onboarding
 *
 * POST /api/onboarding/complete
 *
 * Called after successful invite validation and NFT/hat minting
 * Triggers airdrop and marks user as onboarded
 */

import { NextRequest, NextResponse } from 'next/server';
import { airdropToUser } from '@/utils/testnetAirdrop';
import { assignInviteCodeToUser } from '@/services/inviteCodeService';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge';

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

    console.log(`📋 Completing onboarding for ${normalizedWallet}...`);
    console.log(`   First user: ${isFirstUser}`);
    console.log(`   Transaction hashes:`, transactionHashes);

    // Step 1: Mint Beta Tester or Executive Leader HAT
    console.log('🎩 Minting HAT...');
    try {
      const mintResponse = await fetch(
        `${request.nextUrl.origin}/api/onboarding/mint-hat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: normalizedWallet,
            isFirstUser,
          }),
        }
      );

      const mintResult = await mintResponse.json();

      if (mintResult.success) {
        console.log('✅ HAT minted successfully:', mintResult.hatName);
        if (mintResult.alreadyHadHat) {
          console.log('   (User already had HAT)');
        }
      } else {
        console.error('⚠️ HAT minting failed:', mintResult.error);
        // Non-critical - user can still use the platform, just without HAT-based permissions
      }
    } catch (mintError) {
      console.error('⚠️ HAT minting error (non-critical):', mintError);
      // Continue onboarding even if HAT mint fails
    }

    // Step 2: Assign invite code to user (if not already assigned)
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('referral_key')
        .eq('wallet_address', normalizedWallet)
        .single();

      if (!profile?.referral_key) {
        console.log('📝 Assigning invite code to user...');
        await assignInviteCodeToUser(normalizedWallet);
      }
    } catch (error) {
      console.error('Error assigning invite code:', error);
      // Non-critical - continue onboarding
    }

    // Step 3: Trigger testnet airdrop (100 SELF + 100 SYSTEM)
    // Airdrop is OPTIONAL - only runs on testnet or when NEXT_PUBLIC_ENABLE_BETA_AIRDROP=true
    console.log('🚰 Attempting airdrop...');
    const airdropResult = await airdropToUser(normalizedWallet);

    // Only fail onboarding if airdrop was expected but had a technical error
    // Skip airdrop gracefully if not available (mainnet) or already received
    if (!airdropResult.success) {
      if (airdropResult.error === 'Airdrop only available on testnet') {
        console.log('ℹ️ Airdrop skipped (mainnet - no airdrop configured)');
      } else if (airdropResult.error === 'Auto-airdrop not enabled') {
        console.log('ℹ️ Airdrop skipped (not enabled in configuration)');
      } else if (airdropResult.alreadyReceived) {
        console.log('ℹ️ User already received airdrop');
      } else {
        // Real error - log but don't fail onboarding
        console.warn('⚠️ Airdrop failed (non-critical):', airdropResult.error);
      }
    } else {
      console.log('✅ Airdrop successful:', airdropResult.transactionHash);
    }

    // Step 4: Mark user as onboarded
    console.log('✅ Marking user as onboarded...');
    const { error: updateError } = await supabase
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
    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      airdrop: airdropResult.success
        ? {
            systemAmount: airdropResult.systemAmount?.toString(),
            selfAmount: airdropResult.selfAmount?.toString(),
            transactionHash: airdropResult.transactionHash,
            alreadyReceived: airdropResult.alreadyReceived,
            skipped: false,
          }
        : {
            skipped: true,
            reason: airdropResult.error || 'Not available on this network',
          },
      isFirstUser,
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

// ============================================================
// GET Handler (Check Onboarding Status)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Wallet address is required',
        },
        { status: 400 },
      );
    }

    const normalizedWallet = walletAddress.toLowerCase();

    // Check onboarding status
    const { data, error } = await supabase
      .from('user_profiles')
      .select('onboarded_at, referral_key')
      .eq('wallet_address', normalizedWallet)
      .single();

    if (error || !data) {
      return NextResponse.json({
        success: true,
        onboarded: false,
        hasProfile: false,
      });
    }

    return NextResponse.json({
      success: true,
      onboarded: !!data.onboarded_at,
      hasProfile: true,
      onboardedAt: data.onboarded_at,
      inviteCode: data.referral_key,
    });
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while checking onboarding status',
      },
      { status: 500 },
    );
  }
}
