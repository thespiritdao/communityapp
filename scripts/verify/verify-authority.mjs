#!/usr/bin/env node
// scripts/verify/verify-authority.mjs — does the deployed server decide authority
// from the chain the way src/lib/podAuthority.ts intends?
//
// Mints a session for the TN lead and for an ordinary TN member and hits
// routes that now decide through the resolver. Lead must be allowed, member
// must be refused. Exit 1 on any mismatch.
//
//   node scripts/verify/verify-authority.mjs [--base https://app.example.org]

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { realSession, signOutTestSessions } from './lib/testSessions.mjs';
import { resolveTestPods, verifyBaseUrl } from './lib/verifyConfig.mjs';

dotenv.config({ path: '.env' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = verifyBaseUrl();

const admin = createClient(SB, SERVICE);
// TN = the test community pod (see lib/verifyConfig.mjs).
const { testPodId: TN, leaderHatId: TN_LEADER_HAT, leaderRoleId: TN_LEADER_ROLE } = await resolveTestPods(admin);
const token = (uid) => realSession(admin, SB, ANON, uid);

const { data: pod } = await admin.from('pods').select('pod_leads').eq('id', TN).single();
const lead = pod.pod_leads[0].toLowerCase();
const { data: lp } = await admin.from('user_profiles').select('user_id').eq('wallet_address', lead).single();
const { data: rows } = await admin.from('pod_members').select('wallet').eq('pod_id', TN).eq('is_active', true).eq('role', 'member').limit(20);
const { data: profs } = await admin.from('user_profiles').select('user_id, wallet_address').in('wallet_address', rows.map((r) => r.wallet));
const mp = profs.find((p) => p.wallet_address.toLowerCase() !== lead);
const member = mp.wallet_address.toLowerCase();

const sessions = { lead: await token(lp.user_id), member: await token(mp.user_id) };
console.log(`lead ${lead.slice(0, 10)}…  member ${member.slice(0, 10)}…  against ${BASE}\n`);

// Reads that any member may make are not authority checks. These are the
// write paths the routes gate on leadership; a body that fails validation
// lets a lead prove they passed the guard (400) without creating anything,
// while a member must be stopped by the guard first (403).
// [label, method, path, body, who, expectStatus]
const cases = [
  ['create survey (isPodLeader → resolver)', 'POST', `/api/pods/${TN}/surveys`, {}, 'lead', 400],
  ['create survey (isPodLeader → resolver)', 'POST', `/api/pods/${TN}/surveys`, {}, 'member', 403],
  ['update agent config (isPodLeader → resolver)', 'PUT', '/api/community-agent/config', { podId: TN, config: {} }, 'member', 403],
  ['survey results (isPodLeader → resolver)', 'GET', `/api/pods/${TN}/surveys/00000000-0000-0000-0000-000000000000/results`, null, 'member', 403],
];

let failed = 0;
for (const [label, method, path, body, who, expect] of cases) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${sessions[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const ok = res.status === expect;
  if (!ok) failed++;
  console.log(`${ok ? '  OK   ' : '  FAIL '} ${who.padEnd(6)} ${label} — HTTP ${res.status} (expected ${expect})`);
}

// requirePodPermission → hasPodPermission → chain. The eligibility PUT runs
// the guard before validating the body, so an empty body distinguishes
// "passed the guard" (400) from "refused by it" (403) without writing.
{
  for (const [who, expect] of [['lead', 400], ['member', 403]]) {
    const res = await fetch(`${BASE}/api/pods/roles/${TN_LEADER_ROLE}/eligibility`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sessions[who]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ok = res.status === expect;
    if (!ok) failed++;
    console.log(`${ok ? '  OK   ' : '  FAIL '} ${who.padEnd(6)} role eligibility PUT (requirePodPermission roleAssignment → resolver) — HTTP ${res.status} (expected ${expect})`);
  }
}
// Membership routes (Phase 1 step 2). None of these writes anything: the
// member is refused by the guard, and the lead's request names a wallet that
// does not wear the hat, which the route must refuse after checking the chain.
{
  const NOBODY = '0x000000000000000000000000000000000000dead';
  const call = (who, method, path, body) => fetch(BASE + path, {
    method, headers: { Authorization: `Bearer ${sessions[who]}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const checks = [
    ['member', 'POST', `/api/pods/${TN}/members`, { wallet: member, hatId: TN_LEADER_HAT, role: 'leader' }, 403, 'add member'],
    ['member', 'PATCH', `/api/pods/${TN}/members`, { wallet: lead, hatId: TN_LEADER_HAT }, 403, 'deactivate member'],
    ['member', 'DELETE', `/api/pods/${TN}/members`, null, 403, 'purge members'],
    ['member', 'POST', `/api/pods/${TN}/members/reindex`, null, 403, 'reindex'],
    ['member', 'POST', `/api/pods/${TN}/members/claim-hat`, null, 409, 'claim management hat (does not wear it)'],
    ['lead', 'POST', `/api/pods/${TN}/members`, { wallet: NOBODY, hatId: TN_LEADER_HAT, role: 'leader', notify: false }, 409, 'add a wallet that does not wear the hat'],
    ['lead', 'PATCH', `/api/pods/${TN}/members`, { wallet: lead, hatId: TN_LEADER_HAT }, 409, 'deactivate a wallet that still wears the hat'],
  ];
  for (const [who, method, path, body, expect, label] of checks) {
    const res = await call(who, method, path, body);
    const ok = res.status === expect;
    if (!ok) failed++;
    console.log(`${ok ? '  OK   ' : '  FAIL '} ${who.padEnd(6)} ${label} — HTTP ${res.status} (expected ${expect})`);
  }
}

await signOutTestSessions(admin);
console.log(`\n${failed === 0 ? 'Authority decisions match the chain.' : `${failed} mismatch(es).`}`);
process.exit(failed ? 1 : 0);
