#!/usr/bin/env node
// End-to-end check of pod leader invitations against production.
//
// Creates throwaway members and two hidden, inactive test pods (one with a
// single leader, one with three), then exercises:
//   GET/POST /api/pods/[id]/leader-invites
//   POST     /api/pods/[id]/leader-invites/respond
// and removes everything it created (applications, notifications, ledger
// rows, pods, members).
//
// Usage: node scripts/leader-invites-e2e.mjs   (reads .env)

import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { realSession, signOutTestSessions } from './lib/testSessions.mjs';

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

for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) { console.error(`Missing ${k}`); process.exit(1); }
}
const BASE = env.VERIFY_BASE_URL || 'https://app.spiritdao.org';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const step = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const randWallet = () => '0x' + crypto.randomBytes(20).toString('hex');
const mint = (sub) => realSession(admin, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sub);
const api = async (path, { method = 'POST', token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const created = { users: [], wallets: [], pods: [] };
async function makeUser(tag) {
  const wallet = randWallet();
  const email = `leader-invite-test+${tag}-${Date.now()}@spiritdao.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { wallet_address: wallet, test: true } });
  if (error) throw new Error('createUser: ' + error.message);
  const id = data.user.id;
  created.users.push(id);
  created.wallets.push(wallet);
  const p = await admin.from('user_profiles').insert({ user_id: id, wallet_address: wallet, first_name: 'Leader-invite', last_name: `Test ${tag}`, email });
  if (p.error) throw new Error('profile insert: ' + p.error.message);
  const w = await admin.from('user_wallets').insert({ user_id: id, wallet_address: wallet, is_canonical: true, wallet_type: 'device' });
  if (w.error) throw new Error('user_wallets insert: ' + w.error.message);
  return { id, wallet, token: await mint(id) };
}

async function makePod(name, creator, leads) {
  const { data, error } = await admin.from('pods').insert({
    name, description: 'Created and removed by scripts/leader-invites-e2e.mjs',
    created_by_address: creator, pod_leads: leads, is_active: false,
  }).select('id').single();
  if (error) throw new Error('pod insert: ' + error.message);
  created.pods.push(data.id);
  return data.id;
}

const podLeads = async (podId) =>
  ((await admin.from('pods').select('pod_leads').eq('id', podId).single()).data?.pod_leads ?? []).map((l) => l.toLowerCase());

async function cleanup() {
  await signOutTestSessions(admin);
  if (created.pods.length) {
    const { data: apps } = await admin.from('pod_membership_applications').select('id').in('pod_id', created.pods);
    await admin.from('explorer_events').delete().in('pod_id', created.pods);
    if (apps?.length) await admin.from('pod_membership_applications').delete().in('id', apps.map((a) => a.id));
    await admin.from('pods').delete().in('id', created.pods);
  }
  if (created.wallets.length) {
    await admin.from('general_notifications').delete().in('recipient_address', created.wallets);
    await admin.from('notification_preferences').delete().in('user_address', created.wallets);
  }
  for (const id of created.users) {
    await admin.from('user_wallets').delete().eq('user_id', id);
    await admin.from('user_profiles').delete().eq('user_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log('cleanup: deleteUser failed for', id, error.message);
  }
  const leftPods = created.pods.length ? (await admin.from('pods').select('id').in('id', created.pods)).data?.length : 0;
  console.log(`cleanup: ${created.users.length} users, ${created.pods.length} pods removed; pods left: ${leftPods ?? '?'}`);
}

try {
  const [l1, l2, l3, a, b, s] = await Promise.all(['l1', 'l2', 'l3', 'a', 'b', 'stranger'].map(makeUser));
  const solo = await makePod('Leader-invite test (solo, hidden)', l1.wallet, [l1.wallet]);
  const trio = await makePod('Leader-invite test (three leaders, hidden)', l1.wallet, [l1.wallet, l2.wallet, l3.wallet]);

  let r = await api(`/api/pods/${solo}/leader-invites`, { body: { invitees: [a.wallet] } });
  step('invite refuses without a session', r.status === 401, `HTTP ${r.status}`);

  r = await api(`/api/pods/${solo}/leader-invites`, { token: s.token, body: { invitees: [a.wallet] } });
  step('invite refuses a non-leader', r.status === 403, `HTTP ${r.status}`);

  r = await api(`/api/pods/${solo}/leader-invites`, { token: l1.token, body: { invitees: [a.wallet, l1.wallet] } });
  step('leader invites a member (and is told they are already a leader)',
    r.status === 200 && r.json?.invited?.[0] === a.wallet && r.json?.skipped?.[0]?.reason === 'already a leader', `HTTP ${r.status} ${JSON.stringify(r.json)}`);

  r = await api(`/api/pods/${solo}/leader-invites`, { token: l1.token, body: { invitees: [a.wallet] } });
  step('a second invitation to the same person is skipped', r.json?.skipped?.[0]?.reason === 'already invited', JSON.stringify(r.json?.skipped));

  step('the invitee is not a leader before accepting', !(await podLeads(solo)).includes(a.wallet));

  r = await api(`/api/pods/${solo}/leader-invites`, { method: 'GET', token: a.token });
  const inviteId = r.json?.myInvite?.id;
  step('the invitee sees their invitation', r.status === 200 && !!inviteId && r.json?.myInvite?.invitedBy === l1.wallet && r.json?.invites?.length === 0, `HTTP ${r.status}`);

  r = await api(`/api/pods/${solo}/leader-invites`, { method: 'GET', token: l1.token });
  step('the leader sees the open invitation', r.json?.invites?.some((i) => i.address === a.wallet), JSON.stringify(r.json?.invites));

  r = await api(`/api/pods/${solo}/leader-invites`, { method: 'GET', token: s.token });
  step('a stranger sees nothing', r.json?.myInvite === null && r.json?.invites?.length === 0, JSON.stringify(r.json));

  const { data: note } = await admin.from('general_notifications').select('notification_type')
    .eq('recipient_address', a.wallet).eq('notification_type', 'pod_leadership_invitation');
  step('the invitee was notified', (note?.length ?? 0) === 1, `${note?.length ?? 0} notification(s)`);

  r = await api(`/api/pods/${solo}/leader-invites/respond`, { token: s.token, body: { inviteId, accept: true } });
  step('someone else cannot accept the invitation', r.status === 403, `HTTP ${r.status}`);

  r = await api(`/api/pods/${solo}/leader-invites/respond`, { token: a.token, body: { inviteId, accept: true } });
  step('accepting in a one-leader pod makes them a leader right away',
    r.status === 200 && r.json?.outcome === 'leader' && (await podLeads(solo)).includes(a.wallet), `HTTP ${r.status} ${JSON.stringify(r.json)}`);

  r = await api(`/api/pods/${solo}/leader-invites/respond`, { token: a.token, body: { inviteId, accept: true } });
  step('the same invitation cannot be answered twice', r.status === 409, `HTTP ${r.status}`);

  r = await api(`/api/pods/${solo}/leader-invites`, { token: l1.token, body: { invitees: [b.wallet] } });
  const bSolo = (await api(`/api/pods/${solo}/leader-invites`, { method: 'GET', token: b.token })).json?.myInvite?.id;
  r = await api(`/api/pods/${solo}/leader-invites/respond`, { token: b.token, body: { inviteId: bSolo, accept: false } });
  const { data: gone } = await admin.from('pod_membership_applications').select('id').eq('id', bSolo ?? '00000000-0000-0000-0000-000000000000');
  step('declining removes the invitation and adds no leader',
    r.json?.outcome === 'declined' && (gone?.length ?? 1) === 0 && !(await podLeads(solo)).includes(b.wallet), `HTTP ${r.status}`);

  await api(`/api/pods/${trio}/leader-invites`, { token: l1.token, body: { invitees: [b.wallet] } });
  const bTrio = (await api(`/api/pods/${trio}/leader-invites`, { method: 'GET', token: b.token })).json?.myInvite?.id;
  r = await api(`/api/pods/${trio}/leader-invites/respond`, { token: b.token, body: { inviteId: bTrio, accept: true } });
  const { data: app } = await admin.from('pod_membership_applications').select('status, required_votes').eq('id', bTrio).single();
  step('in a three-leader pod, one leader\'s invitation is not enough: accepted → awaiting the other leaders\' votes',
    r.json?.outcome === 'awaiting_votes' && app?.status === 'pending' && app?.required_votes === 2 && !(await podLeads(trio)).includes(b.wallet),
    `HTTP ${r.status} ${JSON.stringify(r.json)} status=${app?.status} required=${app?.required_votes}`);
} catch (err) {
  step('script ran without errors', false, err instanceof Error ? err.message : String(err));
} finally {
  await cleanup();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
