// src/app/api/auth/onchainkit/route.ts
// Authentication endpoint for Coinbase Embedded Wallets.
//
// Multi-wallet identity (Phase 1, 2026-05-24):
//   CDP creates a new EVM wallet per device by architectural design.
//   This endpoint must recognize the same user across their multiple
//   CDP wallets. The resolution order:
//     1. user_wallets lookup by incoming address — exact match means
//        same user on a known device. Issue JWT.
//     2. user_profiles lookup by email — existing user signing in
//        from an unrecognized device. Return requiresLinking.
//     3. user_profiles lookup by wallet — legacy path, existing user
//        whose canonical wallet hasn't been backfilled into
//        user_wallets yet. Backfill and issue JWT.
//     4. Otherwise: new user. Create everything, including the
//        canonical user_wallets row.
//   See docs/spec-platform-identity-multi-wallet.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import { issueSupabaseSession, sessionIssuance } from '@/lib/issueSession';
import {
  findUserByWallet,
  insertCanonicalWallet,
  linkProvenCdpWallets,
  touchWalletSeen,
} from '@/services/userWalletsService';

// IMPORTANT: Must use Node.js runtime (not Edge) because jsonwebtoken requires crypto module
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Embedded Wallet Authentication Endpoint
 *
 * Coinbase authenticates the person (email / Google / Apple) and holds the
 * keys, but that trust lives between Coinbase and the browser. This route
 * must independently prove that the browser calling it actually holds that
 * Coinbase session for the claimed address — otherwise anyone who knows a
 * member's wallet address could obtain their Supabase session.
 *
 * Proof = the CDP end-user access token (sent in `x-cdp-access-token`),
 * validated server-side via `cdp.endUser.validateAccessToken`, whose EVM
 * accounts must include `address`. See src/lib/cdpAuth.ts. FAILS CLOSED.
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

    // ── Proof of wallet control ──────────────────────────────────
    // The caller must present a valid Coinbase end-user access token whose
    // accounts include `address`. Without this, the address in the body is
    // just a claim.
    const verified = await verifyCdpWalletOwnership(req, address, body);
    if (!verified.ok) {
      console.warn(`❌ Auth API: wallet ownership check failed (${verified.status}): ${verified.error}`);
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }
    console.log(`✅ Auth API: CDP user ${verified.userId} proved control of ${normalizedAddress}`);

    // ── Resolution step 1: known CDP wallet → known user ──────────
    // The fastest, most reliable path: if the incoming CDP wallet is
    // already linked, treat this as a returning user on a known device.
    const walletMatch = await findUserByWallet(normalizedAddress);
    if (walletMatch) {
      console.log(
        `✅ Auth API: Recognized wallet ${normalizedAddress} for user ${walletMatch.userId} (canonical=${walletMatch.isCanonical})`,
      );
      // Touch last-seen and proceed straight to JWT issuance below.
      touchWalletSeen(walletMatch.userId, normalizedAddress).catch(() => {});
    }

    let existingUserProfile: { user_id: string; email: string | null; wallet_address: string } | null = null;
    let profileCheckError: any = null;

    if (walletMatch) {
      // Hydrate the profile for downstream code paths (canonical wallet,
      // email update logic).
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, email, wallet_address')
        .eq('user_id', walletMatch.userId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        profileCheckError = error;
      } else if (data) {
        existingUserProfile = data;
      }
    }

    // ── Resolution step 2: existing user, unknown device ─────────
    // If wallet lookup found nothing but the email matches an existing
    // user, this is the cross-device-wallet case — same user, new CDP
    // wallet on this device. We refuse to silently link; the client
    // must go through the one-time-code linking flow.
    if (!walletMatch && email) {
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, email, wallet_address')
        .eq('email', email)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        profileCheckError = error;
      } else if (data) {
        console.warn(
          `🔗 Auth API: Existing user (${data.user_id}) signing in from unrecognized CDP wallet (${normalizedAddress}). Returning requiresLinking.`,
        );
        return NextResponse.json(
          {
            requiresLinking: true,
            userId: data.user_id,
            existingEmail: data.email,
            unrecognizedWallet: normalizedAddress,
            message:
              'This device hasn\'t been linked to your account yet. Enter a one-time code from a device you\'re already signed in on, or create a new account.',
          },
          { status: 200 },
        );
      }
    }

    // ── Resolution step 3: legacy wallet match (backfill) ────────
    // If wallet lookup found nothing in user_wallets but user_profiles
    // does have this address, we have a legacy user whose canonical
    // wallet hasn't been added to user_wallets yet. (Should only happen
    // for users who signed up before the migration was applied or for
    // any backfill that missed.) Recover by inserting the canonical row.
    if (!existingUserProfile && !walletMatch) {
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, email, wallet_address')
        .eq('wallet_address', normalizedAddress)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        profileCheckError = error;
      } else if (data) {
        existingUserProfile = data;
        console.log(
          `🩹 Auth API: Legacy user_profiles match for ${normalizedAddress} — backfilling user_wallets canonical row`,
        );
        await insertCanonicalWallet(data.user_id, normalizedAddress);
      }
    }

    if (profileCheckError) {
      console.error('❌ Auth API: Database error:', profileCheckError);
      throw profileCheckError;
    }

    // For embedded wallets, Coinbase has already verified the user's identity
    // (email OTP or Google OAuth). We trust isEmbedded and proceed without email
    // when the CDP SDK doesn't surface it post-redirect (e.g. Google OAuth flow).
    if (!email && !existingUserProfile && !isEmbedded) {
      console.warn('❌ Auth API: No verified email provided for non-embedded new user');
      return NextResponse.json({
        error: 'Email verification required',
        code: 'EMAIL_REQUIRED',
        message: 'Please complete email verification to continue',
      }, { status: 400 });
    }

    // Use real email if provided, fall back to stored email, then wallet-based placeholder.
    // The wallet placeholder allows embedded-wallet users (e.g. Google OAuth) to
    // create a Supabase auth entry even when the CDP SDK doesn't surface the email
    // post-redirect. We update the email later if/when we receive it.
    const userEmail = email || existingUserProfile?.email || `${normalizedAddress}@wallet.spiritdao`;

    console.log(`📧 Auth API: Using ${existingUserProfile ? 'existing' : 'verified'} email: ${userEmail}`);

    let userId: string | null = null;

    if (existingUserProfile) {
      userId = existingUserProfile.user_id;
      console.log(`✅ Auth API: Found existing user: ${userId} (canonical wallet: ${existingUserProfile.wallet_address || normalizedAddress})`);

      if (!userId) {
        throw new Error('User profile exists but user_id is null');
      }

      // Update profile with email if provided and not already set.
      // Use canonical wallet (from the found profile), not the CDP wallet —
      // the CDP wallet may differ when a user switches auth methods.
      if (email) {
        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({ email })
          .eq('wallet_address', existingUserProfile.wallet_address)
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

      // Insert the canonical user_wallets row. This is the user's
      // first linked wallet and becomes their default identity for
      // multi-wallet resolution.
      try {
        await insertCanonicalWallet(userId, normalizedAddress);
        console.log(
          `✅ Auth API: Canonical user_wallets row created for ${normalizedAddress}`,
        );
      } catch (walletErr) {
        console.error(
          '⚠️ Auth API: Failed to insert canonical user_wallets row (non-fatal — auth.onchainkit will backfill on next sign-in):',
          walletErr,
        );
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

      // Subscribe new user to Paragraph mailing list.
      // Use the RESOLVED userEmail, not the request-body `email`. For OAuth /
      // embedded-wallet signups the email is frequently absent from the auth
      // request and arrives later, so gating on `email` here silently skips
      // exactly those users. Only skip the wallet placeholder (no real email
      // yet — the backfill route subscribes them once a real email lands).
      const isRealEmail =
        !!userEmail && !userEmail.endsWith('@wallet.spiritdao');
      if (isRealEmail) {
        try {
          const paragraphApiKey = process.env.PARAGRAPH_API;
          if (paragraphApiKey) {
            const paragraphRes = await fetch('https://public.api.paragraph.com/api/v1/subscribers', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${paragraphApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email: userEmail }),
            });
            if (!paragraphRes.ok) {
              const errBody = await paragraphRes.text();
              console.error(`⚠️ Auth API: Paragraph subscription failed (${paragraphRes.status}): ${errBody}`);
            } else {
              console.log(`✅ Auth API: Subscribed ${userEmail} to Paragraph`);
            }
          }
        } catch (paragraphError) {
          console.error('⚠️ Auth API: Paragraph subscription error (non-critical):', paragraphError);
        }
      }
    }

    if (!userId) {
      throw new Error('Failed to retrieve or create user ID');
    }

    // Record every address this CDP session proved the user owns — the smart
    // account they signed in with AND the EOA that owns it. The password vault
    // signs with the EOA, so without this its publish request is refused as an
    // unlinked wallet. Cheap and idempotent after the first sign-in.
    try {
      const linked = await linkProvenCdpWallets({
        userId,
        addresses: verified.accounts,
        viaWallet: normalizedAddress,
      });
      if (linked > 0) {
        console.log(`🔗 Auth API: linked ${linked} additional CDP address(es) for user ${userId}`);
      }
    } catch (linkErr) {
      // Never block sign-in on this; the vault will simply still 403.
      console.error('⚠️ Auth API: could not link CDP sibling wallets:', linkErr);
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

    // New path: Supabase issues the session and the access-token hook stamps
    // the wallet claim from the user's own row. Selected by SESSION_ISSUANCE so
    // it can be turned on, and off, without a deploy. The legacy path below
    // signs with the shared secret and goes away when that secret is revoked.
    if (sessionIssuance() === 'supabase') {
      const issued = await issueSupabaseSession(userId);
      console.log('✅ Auth API: Supabase-issued session (hook stamps wallet)');
      return NextResponse.json({
        supabaseToken: issued.accessToken,
        supabaseRefreshToken: issued.refreshToken,
        userId,
      });
    }

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
