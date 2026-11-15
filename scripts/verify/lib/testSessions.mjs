// scripts/verify/lib/testSessions.mjs
// Real Supabase-issued sessions for the verification scripts.
//
// Until 2026-09-25 the scripts minted their own HS256 tokens with the legacy
// shared secret. That secret is revoked and the app refuses such tokens, so
// the scripts now get a session exactly the way the app does
// (src/lib/issueSession.ts): an admin magic-link token redeemed with
// verifyOtp. Nothing is emailed. The access-token hook stamps the account's
// canonical wallet, as it does for a real sign-in.
//
// Every session issued here is signed out again by signOutTestSessions().

import { createClient } from '@supabase/supabase-js';

const issued = [];

export async function realSession(admin, url, anonKey, userId) {
  const { data: u, error: ue } = await admin.auth.admin.getUserById(userId);
  if (ue || !u?.user?.email) throw new Error(`no auth account/email for ${userId}: ${ue?.message ?? 'missing email'}`);
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (le) throw new Error('generateLink: ' + le.message);
  const plain = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await plain.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error || !data.session) throw new Error('verifyOtp: ' + (error?.message ?? 'no session'));
  issued.push(data.session.access_token);
  return data.session.access_token;
}

/** The wallet claim the hook stamped into a token. */
export function tokenWallet(token) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  return (claims.wallet_address ?? claims.user_metadata?.wallet_address ?? '').toLowerCase();
}

export async function signOutTestSessions(admin) {
  for (const t of issued.splice(0)) {
    await admin.auth.admin.signOut(t, 'local').catch(() => {});
  }
}
