/**
 * API Route: Check Invite Code (Pre-Authentication)
 *
 * POST /api/invite/check
 *
 * Validates an invite code EXISTS before wallet creation
 * Does NOT require wallet address - used for pre-auth validation
 * Does NOT record usage - that happens later after wallet is created
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'edge';

// ============================================================
// Request Types
// ============================================================

interface CheckInviteRequest {
  inviteCode: string;
}

// ============================================================
// POST Handler - Pre-Authentication Code Check
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CheckInviteRequest = await request.json();
    const { inviteCode } = body;

    const normalizedCode = inviteCode?.toUpperCase().trim() || '';

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
    console.log(`🔍 Checking if invite code exists: ${normalizedCode}`);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address, referral_key')
      .eq('referral_key', normalizedCode)
      .maybeSingle();

    if (profileError) {
      console.error('Database error checking invite code:', profileError);
      return NextResponse.json(
        {
          success: false,
          error: 'An error occurred while checking your invite code.',
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

    console.log(`✅ Invite code exists: ${normalizedCode}`);

    // Return success - code is valid
    // NOTE: We don't record usage yet - that happens after wallet is created
    return NextResponse.json({
      success: true,
      message: 'Invite code is valid',
      referrerWallet: profile.wallet_address,
    });
  } catch (error) {
    console.error('Error checking invite code:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while checking your invite code',
      },
      { status: 500 },
    );
  }
}
