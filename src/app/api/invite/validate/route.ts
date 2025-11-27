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
} from '@/services/inviteCodeService';

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
        { status: 400 }
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
        { status: 400 }
      );
    }

    // Validate invite code (unless first user)
    const validationResult = await validateInviteCode(inviteCode, normalizedWallet);

    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error || 'Invalid invite code',
        },
        { status: 400 }
      );
    }

    // If first user, no need to record usage
    if (validationResult.isFirstUser) {
      return NextResponse.json({
        success: true,
        isFirstUser: true,
        message: 'Welcome, founding member!',
      });
    }

    // Record invite code usage for analytics
    if (validationResult.referrerWallet && inviteCode) {
      await recordInviteCodeUsage(
        inviteCode,
        normalizedWallet,
        validationResult.referrerWallet
      );

      // Update new user's profile with referrer info
      await updateUserWithReferrer(normalizedWallet, validationResult.referrerWallet);
    }

    // Return success
    return NextResponse.json({
      success: true,
      referrerWallet: validationResult.referrerWallet,
      message: 'Invite code validated successfully',
    });
  } catch (error) {
    console.error('Error validating invite code:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while validating your invite code',
      },
      { status: 500 }
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
        { status: 400 }
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
        { status: 404 }
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
      { status: 500 }
    );
  }
}
