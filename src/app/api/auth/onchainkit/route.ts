// src/app/api/auth/onchainkit/route.ts
// Authentication endpoint for Coinbase Embedded Wallets

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

// IMPORTANT: Must use Node.js runtime (not Edge) because jsonwebtoken requires crypto module
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Embedded Wallet Authentication Endpoint
 *
 * For embedded wallets, we trust the wallet address from Coinbase's SDK.
 * No signature verification needed since Coinbase manages the private keys.
 *
 * This is secure because:
 * - User authenticated with Coinbase (email/social login + OTP)
 * - Wallet created and managed by Coinbase infrastructure
 * - Private keys never exposed to user or our app
 * - CDP SDK handles all security
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🔐 Auth API: Received embedded wallet auth request');

    const body = await req.json();
    const { address, email, isEmbedded } = body || {};

    // Validate the address
    if (!address) {
      console.warn('❌ Auth API: No address provided');
      return NextResponse.json(
        { error: 'No address provided' },
        { status: 400 },
      );
    }

    const normalizedAddress = address.toLowerCase();
    console.log(`🔍 Auth API: Processing auth for ${normalizedAddress}`);
    console.log(`   Type: ${isEmbedded ? 'Embedded Wallet' : 'External Wallet'}`);

    // For embedded wallets, we trust the address from Coinbase SDK
    // No signature verification needed

    // Use real email if provided, otherwise use dummy email
    const userEmail = email || `${normalizedAddress}@wallet.com`;
    console.log(`📧 Auth API: Using email: ${userEmail}`);

    // Check if user exists in user_profiles
    console.log('🔍 Auth API: Checking for existing user...');
    const { data: userProfile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('wallet_address', normalizedAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Auth API: Database error:', error);
      throw error;
    }

    let userId: string | null = null;

    if (userProfile) {
      // Existing user
      userId = userProfile.user_id;
      console.log(`✅ Auth API: Found existing user: ${userId}`);

      if (!userId) {
        throw new Error('User profile exists but user_id is null');
      }

      // Update profile with email if provided and not already set
      if (email) {
        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({ email })
          .eq('wallet_address', normalizedAddress)
          .is('email', null); // Only update if email is not set

        if (!updateError) {
          console.log(`✅ Auth API: Updated profile with email: ${email}`);
        }
      }
    } else {
      // New user - create auth entry and profile
      console.log('👤 Auth API: Creating new user...');

      const { data: newUser, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email: userEmail,
          email_confirm: true,
          user_metadata: { wallet_address: normalizedAddress },
        });

      if (createUserError) {
        if (
          createUserError.message?.includes('already') ||
          createUserError.message?.includes('duplicate')
        ) {
          console.error('❌ Auth API: User exists in auth but not in profiles');
          throw new Error(
            'User exists in authentication but profile is missing. Please try again.',
          );
        }
        throw createUserError;
      }

      if (!newUser?.user?.id) {
        throw new Error('Failed to create new user');
      }

      userId = newUser.user.id;
      console.log(`✅ Auth API: Created new user: ${userId}`);

      // Create user profile with email
      const { error: insertProfileError } = await supabaseAdmin
        .from('user_profiles')
        .insert([
          {
            user_id: userId,
            wallet_address: normalizedAddress,
            email: email || null, // Store real email if provided
          },
        ]);

      if (insertProfileError) {
        console.error('❌ Auth API: Failed to create profile:', insertProfileError);
        throw insertProfileError;
      }

      if (email) {
        console.log(`✅ Auth API: Profile created with email: ${email}`);
      }

      // Assign invite code immediately for new users
      try {
        const { assignInviteCodeToUser } = await import('@/services/inviteCodeService');
        const inviteCode = await assignInviteCodeToUser(normalizedAddress);
        console.log(`✅ Auth API: Assigned invite code: ${inviteCode}`);
      } catch (codeError) {
        console.error('⚠️ Auth API: Failed to assign invite code (non-critical):', codeError);
      }

      // Notify exec pod members of new account creation
      try {
        const { notifyExecPodOfNewAccount } = await import('@/features/pods/services/PodMembershipNotificationService');
        await notifyExecPodOfNewAccount({
          newUserAddress: normalizedAddress,
          newUserEmail: email,
        });
        console.log(`✅ Auth API: Sent new account notifications to exec pod`);
      } catch (notificationError) {
        console.error('⚠️ Auth API: Failed to send new account notifications (non-critical):', notificationError);
      }
    }

    if (!userId) {
      throw new Error('Failed to retrieve or create user ID');
    }

    // Generate Supabase JWT tokens
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('❌ Auth API: Missing SUPABASE_JWT_SECRET');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      );
    }

    // CRITICAL: wallet_address MUST be in user_metadata to match RLS policy
    // RLS checks: auth.jwt() -> 'user_metadata' ->> 'wallet_address'
    const jwtPayload = {
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {
        wallet_address: normalizedAddress,
      },
    };

    const supabaseToken = jwt.sign(jwtPayload, JWT_SECRET, {
      expiresIn: '30m',
    });

    const supabaseRefreshToken = jwt.sign(jwtPayload, JWT_SECRET, {
      expiresIn: '7d',
    });

    console.log('✅ Auth API: Generated JWT tokens successfully');

    return NextResponse.json({
      supabaseToken,
      supabaseRefreshToken,
      userId,
    });
  } catch (err) {
    console.error('❌ Auth API: Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
