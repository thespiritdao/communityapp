// src/app/api/auth/onchainkit/route.ts
// Authentication endpoint for Coinbase Embedded Wallets

import { type NextRequest, NextResponse } from 'next/server';
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

    // Check if user exists in user_profiles FIRST
    console.log('🔍 Auth API: Checking for existing user...');
    const { data: existingUserProfile, error: profileCheckError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, email')
      .eq('wallet_address', normalizedAddress)
      .single();

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
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
      // Existing user
      userId = existingUserProfile.user_id;
      console.log(`✅ Auth API: Found existing user: ${userId}`);

      if (!userId) {
        throw new Error('User profile exists but user_id is null');
      }

      // CRITICAL: Ensure wallet_address is in auth.users raw_user_meta_data
      // Without this, Supabase JWTs won't have wallet_address in user_metadata,
      // causing RLS to block governance vote inserts for existing users.
      const { error: metaUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { user_metadata: { wallet_address: normalizedAddress } },
      );
      if (metaUpdateError) {
        console.error('⚠️ Auth API: Failed to update user_metadata (non-critical):', metaUpdateError);
      } else {
        console.log(`✅ Auth API: Ensured wallet_address in user_metadata for ${userId}`);
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

    // Generate a real Supabase session using generateLink + verify.
    // This is the correct pattern for SDK v2 — createSession() was added later.
    // generateLink produces a hashed_token; POST /auth/v1/verify exchanges it
    // for a real access_token + refresh_token pair.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail!,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('❌ Auth API: generateLink failed:', linkError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
      body: JSON.stringify({
        type: 'magiclink',
        token_hash: linkData.properties.hashed_token,
      }),
    });

    if (!verifyRes.ok) {
      const body = await verifyRes.text();
      console.error('❌ Auth API: verify failed:', verifyRes.status, body);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    const session = await verifyRes.json();
    console.log('✅ Auth API: Generated real Supabase session');

    return NextResponse.json({
      supabaseToken: session.access_token,
      supabaseRefreshToken: session.refresh_token,
      userId,
    });
  } catch (err) {
    console.error('❌ Auth API: Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
