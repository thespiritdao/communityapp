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

    // Check if user exists in user_profiles.
    // IMPORTANT: Multiple accounts can share the same CDP embedded wallet address
    // (e.g. family members on the same device). Email is the reliable unique
    // identifier from Coinbase — look up by email first, fall back to wallet.
    console.log('🔍 Auth API: Checking for existing user...');

    let existingUserProfile: { user_id: string; email: string | null; wallet_address: string } | null = null;
    let profileCheckError: any = null;

    // 1. Try email lookup first (most reliable — email is unique per Coinbase account)
    if (email) {
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, email, wallet_address')
        .eq('email', email)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') { profileCheckError = error; }
      else if (data) {
        existingUserProfile = data;
        console.log(`✅ Auth API: Found existing user by email: ${data.user_id} (wallet: ${data.wallet_address})`);
      }
    }

    // 2. Fall back to wallet address lookup only if email lookup found nothing
    if (!existingUserProfile) {
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, email, wallet_address')
        .eq('wallet_address', normalizedAddress)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') { profileCheckError = error; }
      else if (data) {
        existingUserProfile = data;
        console.log(`✅ Auth API: Found existing user by wallet: ${data.user_id}`);
      }
    }

    if (profileCheckError) {
      console.error('❌ Auth API: Database error:', profileCheckError);
      throw profileCheckError;
    }

    // SECURITY: Require verified email from CDP for NEW users only
    // Existing users can re-authenticate without email (they already have one in DB)
    if (!email && !existingUserProfile) {
      console.warn('❌ Auth API: No verified email provided for new user');
      return NextResponse.json({
        error: 'Email verification required',
        code: 'EMAIL_REQUIRED',
        message: 'Please complete email verification to continue',
      }, { status: 400 });
    }

    // LEGACY FALLBACK: For users who signed in before we stored emails
    // Use @wallet.com fallback ONLY if user exists but has no email stored
    const userEmail = email || existingUserProfile?.email ||
      (existingUserProfile ? `${normalizedAddress}@wallet.com` : undefined);

    console.log(`📧 Auth API: Using ${existingUserProfile ? 'existing' : 'verified'} email: ${userEmail}`);

    let userId: string | null = null;

    if (existingUserProfile) {
      userId = existingUserProfile.user_id;
      console.log(`✅ Auth API: Found existing user: ${userId} (canonical wallet: ${existingUserProfile.wallet_address || normalizedAddress})`);

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

    // Sign a JWT directly with the Supabase JWT secret.
    // This is the correct approach for wallet-based auth — we know exactly which
    // userId and wallet_address to embed, bypassing email-based session flows that
    // would pick the wrong auth user when multiple accounts share an email.
    // The RLS policy reads wallet_address from this JWT claim directly.
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('❌ Auth API: Missing SUPABASE_JWT_SECRET');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // For existing users, embed their profile wallet (not the CDP EVM address).
    // Multiple accounts can share the same CDP embedded wallet; the profile wallet
    // is the canonical identity used by RLS policies, conference tokens, etc.
    const canonicalWallet = existingUserProfile?.wallet_address || normalizedAddress;

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      iat: now,
      exp: now + 60 * 60 * 24 * 7, // 7 days
      wallet_address: canonicalWallet,
      user_metadata: {
        wallet_address: canonicalWallet,
      },
    };

    const supabaseToken = jwt.sign(jwtPayload, JWT_SECRET, { algorithm: 'HS256' });

    // Separate long-lived refresh token (30 days)
    const refreshPayload = {
      ...jwtPayload,
      exp: now + 60 * 60 * 24 * 30, // 30 days
      token_type: 'refresh',
    };
    const supabaseRefreshToken = jwt.sign(refreshPayload, JWT_SECRET, { algorithm: 'HS256' });

    console.log('✅ Auth API: Generated JWT tokens (access: 7d, refresh: 30d)');

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
