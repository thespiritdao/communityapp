/**
 * API Route: Validate Invite Code
 *
 * POST /api/invite/validate
 *
 * Validates an invite code before allowing user registration
 * Handles first user exception automatically
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateInviteCode,
  recordInviteCodeUsage,
  updateUserWithReferrer,
  isFirstUser,
} from '@/services/inviteCodeService';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'edge';

// ============================================================
// Request Types
// ============================================================

interface ValidateInviteRequest {
  inviteCode: string;
  walletAddress: string;
}

// ============================================================
// POST Handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: ValidateInviteRequest = await request.json();
    const { inviteCode, walletAddress } = body;

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

    // CRITICAL FIX: Validate invite code using ADMIN client to bypass RLS
    // The client-side validateInviteCode uses regular supabase client which fails due to RLS
    const normalizedCode = inviteCode?.toUpperCase().trim() || '';

    // Exception: First user doesn't need invite code
    if (isFirstUser(normalizedWallet)) {
      return NextResponse.json({
        success: true,
        isFirstUser: true,
        message: 'Welcome, founding member!',
      });
    }

    // Validate code format
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid invite code format. Must be 6 characters.',
        },
        { status: 400 },
      );
    }

    // Check if code exists in database (using ADMIN client to bypass RLS)
    console.log(`🔍 Validating invite code: ${normalizedCode} for wallet: ${normalizedWallet}`);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address, referral_key')
      .eq('referral_key', normalizedCode)
      .maybeSingle();

    if (profileError) {
      console.error('Database error validating invite code:', profileError);
      return NextResponse.json(
        {
          success: false,
          error: 'An error occurred while validating your invite code.',
        },
        { status: 500 },
      );
    }

    if (!profile) {
      console.warn(`❌ Invite code not found: ${normalizedCode}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid invite code. Please check and try again.',
        },
        { status: 400 },
      );
    }

    console.log(`✅ Found profile for invite code: ${normalizedCode} - ${profile.wallet_address}`);

    // Prevent self-referral
    if (profile.wallet_address.toLowerCase() === normalizedWallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'You cannot use your own invite code.',
        },
        { status: 400 },
      );
    }

    // CRITICAL FIX: Check if wallet already has a profile from this invite code
    // If they do, they're a returning user who needs to complete onboarding
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address, invited_by, onboarded_at')
      .eq('wallet_address', normalizedWallet)
      .maybeSingle();

    if (existingProfile && existingProfile.invited_by) {
      console.log('✅ Returning user with existing invite relationship');
      // User already has a profile with invite relationship - let them continue
      // They might be completing an incomplete onboarding
      return NextResponse.json({
        success: true,
        referrerWallet: existingProfile.invited_by,
        message: 'Welcome back! Continuing your onboarding.',
        isReturningUser: true,
      });
    }

    // Check if code has already been used by this wallet (only for truly new users)
    const { data: existingValidation } = await supabaseAdmin
      .from('referral_validations')
      .select('id')
      .eq('invite_code', normalizedCode)
      .eq('used_by_wallet', normalizedWallet)
      .single();

    if (existingValidation) {
      return NextResponse.json(
        {
          success: false,
          error: 'You have already used this invite code.',
        },
        { status: 400 },
      );
    }

    // Record invite code usage for analytics
    await recordInviteCodeUsage(
      normalizedCode,
      normalizedWallet,
      profile.wallet_address,
    );

    // Update new user's profile with referrer info
    await updateUserWithReferrer(
      normalizedWallet,
      profile.wallet_address,
    );

    // Return success
    console.log(`✅ Invite code validation successful for ${normalizedWallet}`);
    return NextResponse.json({
      success: true,
      referrerWallet: profile.wallet_address,
      message: 'Invite code validated successfully',
    });
  } catch (error) {
    console.error('Error validating invite code:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while validating your invite code',
      },
      { status: 500 },
    );
  }
}

// ============================================================
// GET Handler (Optional - Get User's Own Invite Code)
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

    // Import getUserInviteCode
    const { getUserInviteCode } = await import('@/services/inviteCodeService');

    const inviteCode = await getUserInviteCode(walletAddress);

    if (!inviteCode) {
      return NextResponse.json(
        {
          success: false,
          error: 'No invite code found for this wallet',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      inviteCode,
    });
  } catch (error) {
    console.error('Error fetching invite code:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while fetching invite code',
      },
      { status: 500 },
    );
  }
}
