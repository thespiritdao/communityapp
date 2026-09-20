// scripts/wallet-link-e2e.mjs
// Headless end-to-end test of the wallet-linking routes against production.
// Run: node scripts/wallet-link-e2e.mjs   (needs .env with service-role key and JWT secret)
// Creates two throwaway auth users, drives the API with locally minted app
// JWTs and a throwaway external key, and removes everything it created.
// The device-code REDEMPTION half needs a real Coinbase session token and is
// only asserted to fail closed here.
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// Read .env when it exists (local runs); fall back to the process environment
// so this also runs in CI, where secrets arrive as environment variables.
const env = (() => {
  const fromFile = fs.existsSync('.env')
    ? Object.fromEntries(
        fs.readFileSync('.env', 'utf8').split(/\r?\n/)
          .filter(l => /^[A-Z_]+=/.test(l))
          .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
      )
    : {};
  return { ...fromFile, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) };
})();

for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET']) {
  if (!env[k]) { console.error(`Missing ${k}`); process.exit(1); }
}
const BASE = 'https://app.spiritdao.org';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const step = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const randWallet = () => '0x' + crypto.randomBytes(20).toString('hex');
const mint = (sub, wallet) => jwt.sign(
  { sub, aud: 'authenticated', role: 'authenticated', wallet_address: wallet, user_metadata: { wallet_address: wallet } },
  env.SUPABASE_JWT_SECRET, { expiresIn: '10m' },
);
const api = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const created = { users: [], wallets: [] };
async function makeUser(tag) {
  const wallet = randWallet();
  const email = `wallet-link-test+${tag}-${Date.now()}@spiritdao.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { wallet_address: wallet, test: true } });
  if (error) throw new Error('createUser: ' + error.message);
  const id = data.user.id;
  created.users.push(id);
  const p = await admin.from('user_profiles').insert({ user_id: id, wallet_address: wallet, first_name: 'Wallet-link', last_name: `Test ${tag}`, email });
  if (p.error) throw new Error('profile insert: ' + p.error.message);
  const w = await admin.from('user_wallets').insert({ user_id: id, wallet_address: wallet, is_canonical: true, wallet_type: 'device' });
  if (w.error) throw new Error('user_wallets insert: ' + w.error.message);
  created.wallets.push(wallet);
  return { id, wallet, token: mint(id, wallet) };
}

async function cleanup() {
  for (const id of created.users) {
    await admin.from('user_wallet_link_codes').delete().eq('user_id', id);
    await admin.from('wallet_link_nonces').delete().eq('user_id', id);
    await admin.from('user_wallets').delete().eq('user_id', id);
    await admin.from('user_profiles').delete().eq('user_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log('cleanup: deleteUser failed for', id, error.message);
  }
  const left = await admin.from('user_profiles').select('user_id').in('user_id', created.users);
  console.log(`cleanup: ${created.users.length} test users removed; profiles left: ${left.data?.length ?? '?'}`);
}

try {
  const A = await makeUser('A');
  const B = await makeUser('B');

  // ── Device-link code issuance ─────────────────────────────────────────────
  let r = await api('/api/auth/link-code', { method: 'POST', token: A.token, body: {} });
  step('link-code issues a code for a linked wallet', r.status === 200 && /^[A-Z0-9]{6}$/.test(r.json?.code ?? ''), `HTTP ${r.status} code=${r.json?.code ? 'ok' : JSON.stringify(r.json)}`);
  const code = r.json?.code;
  const codeRow = code ? await admin.from('user_wallet_link_codes').select('user_id, consumed_at, expires_at').eq('code', code).maybeSingle() : { data: null };
  step('code row stored for the right user, unconsumed, 10-min TTL', codeRow.data?.user_id === A.id && !codeRow.data?.consumed_at && (new Date(codeRow.data?.expires_at) - Date.now()) > 8 * 60 * 1000);

  r = await api('/api/auth/link-code', { method: 'POST', token: A.token, body: { issuingWallet: randWallet() } });
  step('link-code refuses an issuing wallet not linked to the user', r.status === 403, `HTTP ${r.status}`);

  r = await api('/api/auth/link-code', { method: 'POST', body: {} });
  step('link-code refuses without a JWT', r.status === 401, `HTTP ${r.status}`);

  // ── Redemption half is CDP-gated: must fail closed without a CDP token ────
  r = await api('/api/auth/link-confirm', { method: 'POST', body: { code: code ?? 'ABCDEF', newWallet: randWallet() } });
  step('link-confirm refuses without a CDP access token (fails closed)', r.status === 401 || r.status === 503, `HTTP ${r.status} ${r.json?.error ?? ''}`);
  const codeAfter = code ? await admin.from('user_wallet_link_codes').select('consumed_at').eq('code', code).maybeSingle() : { data: null };
  step('failed redemption did not burn the code', codeAfter.data && !codeAfter.data.consumed_at);

  // ── Linked-wallets listing ────────────────────────────────────────────────
  r = await api('/api/auth/linked-wallets', { token: A.token });
  step('linked-wallets lists the canonical wallet', r.status === 200 && r.json?.wallets?.length === 1 && r.json.wallets[0].isCanonical === true, `HTTP ${r.status} n=${r.json?.wallets?.length}`);

  // ── External wallet link: nonce → sign → confirm ──────────────────────────
  const ext = privateKeyToAccount(generatePrivateKey());
  const extAddr = ext.address.toLowerCase();
  r = await api('/api/auth/link-external/nonce', { method: 'POST', token: A.token, body: { address: ext.address } });
  step('nonce issued for external address', r.status === 200 && !!r.json?.nonce && !!r.json?.message, `HTTP ${r.status}`);
  const { nonce, message } = r.json ?? {};

  const badSig = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: message ?? 'x' });
  r = await api('/api/auth/link-external/confirm', { method: 'POST', token: A.token, body: { address: ext.address, signature: badSig, nonce } });
  step('confirm rejects a signature from a different key', r.status === 401, `HTTP ${r.status}`);

  const sig = await ext.signMessage({ message });
  r = await api('/api/auth/link-external/confirm', { method: 'POST', token: B.token, body: { address: ext.address, signature: sig, nonce } });
  step('confirm rejects a nonce issued to a different user', r.status === 400, `HTTP ${r.status} ${r.json?.error ?? ''}`);

  r = await api('/api/auth/link-external/confirm', { method: 'POST', token: A.token, body: { address: ext.address, signature: sig, nonce } });
  step('confirm links the external wallet with a valid signature', r.status === 200 && r.json?.ok === true, `HTTP ${r.status} ${r.json?.error ?? ''}`);
  created.wallets.push(extAddr);

  r = await api('/api/auth/link-external/confirm', { method: 'POST', token: A.token, body: { address: ext.address, signature: sig, nonce } });
  step('replaying the same nonce is refused', r.status === 400, `HTTP ${r.status} ${r.json?.error ?? ''}`);

  r = await api('/api/auth/link-external/nonce', { method: 'POST', token: B.token, body: { address: ext.address } });
  step('another user cannot request a nonce for an already-linked address', r.status === 409, `HTTP ${r.status}`);

  r = await api('/api/auth/linked-wallets', { token: A.token });
  const extRow = r.json?.wallets?.find(w => w.walletAddress === extAddr);
  step('linked-wallets now shows both, external typed correctly', r.json?.wallets?.length === 2 && extRow?.walletType === 'external' && extRow?.isCanonical === false, `n=${r.json?.wallets?.length} type=${extRow?.walletType}`);

  // ── Identity resolution after linking ─────────────────────────────────────
  // A session presenting the linked wallet must resolve to the same account
  // and see the same wallet set as a session presenting the canonical one.
  const extToken = mint(A.id, extAddr);
  r = await api('/api/auth/linked-wallets', { token: extToken });
  const canonicalSeen = r.json?.wallets?.some(w => w.walletAddress === A.wallet && w.isCanonical);
  step('a session on the linked wallet resolves to the same account', r.status === 200 && r.json?.wallets?.length === 2 && canonicalSeen, `HTTP ${r.status} n=${r.json?.wallets?.length}`);
  r = await api('/api/auth/link-code', { method: 'POST', token: extToken, body: {} });
  step('a session on the linked wallet can issue link codes too', r.status === 200, `HTTP ${r.status}`);

  // ── Revocation ────────────────────────────────────────────────────────────
  r = await api('/api/auth/linked-wallets', { method: 'DELETE', token: A.token, body: { walletAddress: A.wallet } });
  step('revoking the canonical wallet is refused', r.status >= 400, `HTTP ${r.status}`);
  r = await api('/api/auth/linked-wallets', { method: 'DELETE', token: A.token, body: { walletAddress: extAddr } });
  step('revoking the external wallet succeeds', r.status === 200, `HTTP ${r.status}`);
  r = await api('/api/auth/linked-wallets', { token: A.token });
  step('after revocation only the canonical wallet remains', r.json?.wallets?.length === 1, `n=${r.json?.wallets?.length}`);
} catch (e) {
  console.log('ERROR', e?.message ?? e);
} finally {
  await cleanup();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
