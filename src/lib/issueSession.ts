// src/lib/issueSession.ts
//
// Ask Supabase to start a session for a user our server has already
// authenticated, instead of signing a token ourselves.
//
// Wallet sign-in and device linking both end the same way: the server has
// proved that the caller controls a wallet and knows which account it belongs
// to, and now needs a Supabase session to hand back. They used to sign that
// session with the shared JWT secret. Once that secret is revoked there is
// nothing to sign with, so the session has to come from Supabase.
//
// How: Supabase's admin API will mint a single-use token for a known user
// (the same mechanism behind a magic link, without sending any email), and
// that token exchanges for a full session — access token signed with the
// project's current key, plus a refresh token Supabase actually honours,
// which the old self-signed pair never was.
//
// The wallet claim that 106 row-security policy references read is stamped
// by the custom access token hook at issue time, from the user's own row.
// This helper does not put it there and must not try to: the hook is the
// authority, precisely so a token can never carry a wallet its user does not
// own. See supabase/migrations/20260921000001_custom_access_token_hook.sql.

import { createClient } from '@supabase/supabase-js';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Issue a Supabase session for an existing auth user.
 *
 * Throws on any failure; callers decide what to tell the client. Never
 * returns a partial session.
 */
export async function issueSupabaseSession(userId: string): Promise<IssuedSession> {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The single-use token is issued by email, so look the address up rather
  // than trusting a caller-supplied one.
  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !found?.user?.email) {
    throw new Error(`issueSupabaseSession: no auth user with an email for ${userId}`);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: found.user.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error(`issueSupabaseSession: could not mint a sign-in token (${linkError?.message ?? 'no token'})`);
  }

  // Exchange it as a plain client would. The result is an ordinary session.
  const plain = createClient(url, env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await plain.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verifyError || !session?.access_token || !session.refresh_token) {
    throw new Error(`issueSupabaseSession: token exchange failed (${verifyError?.message ?? 'no session'})`);
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
  };
}
