#!/usr/bin/env node
// scripts/verify-issued-session.mjs
//
// Proves that a Supabase-issued session satisfies what the app needs from it:
// the right user, signed with the project's current key, a refresh token that
// works, and — once the custom access token hook is enabled — the wallet
// stamped as a top-level claim so the row-security policies can see it.
//
// Creates one throwaway account and removes it. Exit 1 on any failure.
//
//   node scripts/verify-issued-session.mjs

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !ANON || !SERVICE) {
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const header = (t) => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());

const results = [];
const step = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

// Same steps the app's helper takes, spelled out so a failure points at the step.
async function issue(userId) {
  const { data: found } = await admin.auth.admin.getUserById(userId);
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email });
  if (le) throw new Error('generateLink: ' + le.message);
  const plain = createClient(SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await plain.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error) throw new Error('verifyOtp: ' + error.message);
  return data.session;
}

let userId = null;
const wallet = '0x' + 'c0ffee'.repeat(6) + 'c0ff';
try {
  const email = `issued-session-check-${Date.now()}@spiritdao.org`;
  const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (ce) throw new Error('createUser: ' + ce.message);
  userId = cu.user.id;
  // Give the throwaway a canonical wallet, which is what the hook reads.
  const { error: we } = await admin.from('user_wallets').insert({ user_id: userId, wallet_address: wallet, is_canonical: true, wallet_type: 'device' });
  if (we) throw new Error('user_wallets insert: ' + we.message);

  const session = await issue(userId);
  const claims = decode(session.access_token);
  const alg = header(session.access_token).alg;

  step('session issued for the right user', claims.sub === userId);
  step('signed with the project key, not a shared secret', alg !== 'HS256', `alg=${alg}`);
  step('ordinary member role and audience', claims.role === 'authenticated' && claims.aud === 'authenticated');

  const hookLive = claims.wallet_address === wallet;
  step('hook stamped the wallet as a top-level claim', hookLive,
    hookLive ? '' : 'ABSENT: enable Authentication > Hooks > Customize Access Token > public.custom_access_token_hook');
  if (hookLive) step('hook stamped the same wallet into user metadata', claims.user_metadata?.wallet_address === wallet);

  const plain = createClient(SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rf, error: re } = await plain.auth.refreshSession({ refresh_token: session.refresh_token });
  step('refresh token is honoured by Supabase', !re && !!rf?.session?.access_token, re?.message ?? '');

  // The thing that matters: a policy that reads the top-level claim.
  const asMember = createClient(SB, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const { data: mine, error: me } = await asMember.from('user_wallets').select('wallet_address').eq('user_id', userId);
  step('session can read its own wallet row through row security', !me && (mine?.length ?? 0) === 1, me?.message ?? `rows=${mine?.length}`);
} catch (e) {
  console.log('ERROR', e?.message ?? e);
  results.push(false);
} finally {
  if (userId) {
    await admin.from('user_wallets').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
    console.log('cleanup: throwaway account removed');
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
