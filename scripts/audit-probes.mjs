#!/usr/bin/env node
// scripts/audit-probes.mjs — acceptance test for APP_AUDIT_2026-09-15.md.
//
// Re-runs the probes that found the audit's findings, exactly as a browser
// would (anon key + a normal session), plus the ungated-route checks against
// production. Every line must read BLOCKED. Any write that succeeds is
// reverted immediately.
//
//   node scripts/audit-probes.mjs                 # against app.spiritdao.org
//   node scripts/audit-probes.mjs --base http://localhost:3000
//
// Exit code 1 if anything is still open.

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.SUPABASE_JWT_SECRET;
const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'https://app.spiritdao.org';
})();

const TN = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
const EXEC = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
const TN_LEADER_HAT = '0x0000074900020001000000000000000000000000000000000000000000000000';

const admin = createClient(SB, SERVICE);
const anon = createClient(SB, ANON);

let open = 0;
const report = (label, blocked, detail = '') => {
  if (!blocked) open++;
  console.log(`${blocked ? '  BLOCKED ' : '  OPEN ✗  '} ${label}${detail ? ' — ' + detail : ''}`);
};

/** A session for an ordinary TN member who is not a lead. */
async function ordinaryMember() {
  const { data: pod } = await admin.from('pods').select('pod_leads').eq('id', TN).single();
  const leads = (pod.pod_leads || []).map((x) => x.toLowerCase());
  const { data: rows } = await admin
    .from('pod_members').select('id, wallet, role, hat_id')
    .eq('pod_id', TN).eq('is_active', true).eq('role', 'member').limit(20);
  const { data: profs } = await admin
    .from('user_profiles').select('user_id, wallet_address')
    .in('wallet_address', rows.map((r) => r.wallet));
  const row = rows.find((r) => !leads.includes(r.wallet.toLowerCase())
    && profs.some((p) => p.wallet_address.toLowerCase() === r.wallet.toLowerCase()));
  const prof = profs.find((p) => p.wallet_address.toLowerCase() === row.wallet.toLowerCase());
  const w = row.wallet.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { sub: prof.user_id, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 600,
      wallet_address: w, user_metadata: { wallet_address: w } },
    SECRET, { algorithm: 'HS256' },
  );
  const client = createClient(SB, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  return { client, token, wallet: w, row };
}

console.log(`Audit probes against ${SB} and ${BASE}\n`);
const me = await ordinaryMember();
console.log(`ordinary member: ${me.wallet.slice(0, 10)}…\n`);

// ── F1: pod_members escalation ──────────────────────────────────────────────
console.log('F1  pod_members');
{
  let r = await me.client.from('pod_members').update({ role: 'leader' }).eq('id', me.row.id).select('id');
  const ok = !!r.error || !r.data?.length;
  if (!ok) await admin.from('pod_members').update({ role: 'member' }).eq('id', me.row.id);
  report('UPDATE own role -> leader', ok);

  r = await me.client.from('pod_members').update({ hat_id: TN_LEADER_HAT }).eq('id', me.row.id).select('id');
  const ok2 = !!r.error || !r.data?.length;
  if (!ok2) await admin.from('pod_members').update({ hat_id: me.row.hat_id }).eq('id', me.row.id);
  report('UPDATE own hat_id -> leader hat', ok2);

  const { data: ex } = await admin.from('pod_members').select('membership_type, hat_id')
    .eq('pod_id', EXEC).eq('is_active', true).limit(1).single();
  r = await me.client.from('pod_members').insert({
    pod_id: EXEC, wallet: me.wallet, role: 'leader', is_active: true,
    membership_type: ex.membership_type, hat_id: ex.hat_id,
  }).select('id').single();
  const ok3 = !!r.error;
  if (!ok3) await admin.from('pod_members').delete().eq('id', r.data.id);
  report('INSERT self into Executive Pod as leader', ok3);

  const perm = await admin.rpc('check_pod_permission', { p_user_wallet: me.wallet, p_pod_id: TN, p_permission_key: 'treasuryManagement' });
  report('check_pod_permission(treasuryManagement) for member', perm.data !== true, `= ${perm.data}`);
}

// ── F2: forged signature ────────────────────────────────────────────────────
console.log('F2  pod_accountability_signatures');
{
  const { data: someone } = await admin.from('pod_members').select('wallet')
    .eq('pod_id', TN).eq('is_active', true).neq('wallet', me.wallet).limit(1).single();
  const r = await me.client.from('pod_accountability_signatures').insert({
    pod_id: TN, signer_address: someone.wallet, signature_data: 'forged',
    accountability_statement: 'probe', signed_at: new Date().toISOString(), is_valid: true,
  }).select('id').single();
  const ok = !!r.error;
  if (!ok) await admin.from('pod_accountability_signatures').delete().eq('id', r.data.id);
  report('INSERT signature as another member', ok);
}

// ── F3: general_notifications exposure ──────────────────────────────────────
console.log('F3  general_notifications');
{
  const a = await anon.from('general_notifications').select('id').limit(1);
  report('anon reads', !!a.error || !a.data?.length);
  const o = await me.client.from('general_notifications').select('id').neq('recipient_address', me.wallet).limit(1);
  report("member reads others'", !!o.error || !o.data?.length);
}

// ── F5: ungated routes (production) ─────────────────────────────────────────
console.log('F5  routes without a session token');
{
  const post = async (path, body) => {
    const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.status;
  };
  const put = async (path, body) => {
    const res = await fetch(BASE + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.status;
  };
  const isBlocked = (s) => s === 401 || s === 403;
  let s;
  s = await post('/api/pods/notify-exec', { podId: TN, podName: 'probe' });
  report('POST /api/pods/notify-exec', isBlocked(s), `HTTP ${s}`);
  s = await post('/api/pods/notify-leaders', { podId: TN, podName: 'probe', creatorAddress: me.wallet });
  report('POST /api/pods/notify-leaders', isBlocked(s), `HTTP ${s}`);
  s = await post('/api/explorer/member-introduced', { walletAddress: '0x000000000000000000000000000000000000dead', displayName: 'probe' });
  report('POST /api/explorer/member-introduced', isBlocked(s), `HTTP ${s}`);
  s = await post('/api/claims/request', { walletAddress: '0x000000000000000000000000000000000000dead', amount: 1, payoutEmail: 'probe@example.com' });
  report('POST /api/claims/request', isBlocked(s), `HTTP ${s}`);
  s = await put('/api/community-agent/events', { eventId: '00000000-0000-0000-0000-000000000000', action: 'approve', walletAddress: me.wallet });
  report('PUT  /api/community-agent/events', isBlocked(s), `HTTP ${s}`);
}

console.log(`\n${open === 0 ? 'All probes blocked.' : `${open} probe(s) still OPEN.`}`);
process.exit(open === 0 ? 0 : 1);
