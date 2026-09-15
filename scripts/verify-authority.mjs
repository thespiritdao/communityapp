#!/usr/bin/env node
// scripts/verify-authority.mjs — does the deployed server decide authority
// from the chain the way src/lib/podAuthority.ts intends?
//
// Mints a session for the TN lead and for an ordinary TN member and hits
// routes that now decide through the resolver. Lead must be allowed, member
// must be refused. Exit 1 on any mismatch.
//
//   node scripts/verify-authority.mjs [--base https://app.spiritdao.org]

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.SUPABASE_JWT_SECRET;
const BASE = (() => { const i = process.argv.indexOf('--base'); return i > -1 ? process.argv[i + 1] : 'https://app.spiritdao.org'; })();
const TN = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

const admin = createClient(SB, SERVICE);
const token = (uid, w) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: uid, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 600, wallet_address: w, user_metadata: { wallet_address: w } }, SECRET, { algorithm: 'HS256' });
};

const { data: pod } = await admin.from('pods').select('pod_leads').eq('id', TN).single();
const lead = pod.pod_leads[0].toLowerCase();
const { data: lp } = await admin.from('user_profiles').select('user_id').eq('wallet_address', lead).single();
const { data: rows } = await admin.from('pod_members').select('wallet').eq('pod_id', TN).eq('is_active', true).eq('role', 'member').limit(20);
const { data: profs } = await admin.from('user_profiles').select('user_id, wallet_address').in('wallet_address', rows.map((r) => r.wallet));
const mp = profs.find((p) => p.wallet_address.toLowerCase() !== lead);
const member = mp.wallet_address.toLowerCase();

const sessions = { lead: token(lp.user_id, lead), member: token(mp.user_id, member) };
console.log(`lead ${lead.slice(0, 10)}…  member ${member.slice(0, 10)}…  against ${BASE}\n`);

// [label, method, path, who, expectAllowed]
const cases = [
  ['surveys list (isPodLeader → resolver)', 'GET', `/api/pods/${TN}/surveys`, 'lead', true],
  ['surveys list (isPodLeader → resolver)', 'GET', `/api/pods/${TN}/surveys`, 'member', false],
  ['agent config (isPodLeader → resolver)', 'GET', `/api/community-agent/config?podId=${TN}`, 'lead', true],
  ['agent config (isPodLeader → resolver)', 'GET', `/api/community-agent/config?podId=${TN}`, 'member', false],
];

let failed = 0;
for (const [label, method, path, who, expectAllowed] of cases) {
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${sessions[who]}` } });
  const allowed = res.status < 400;
  const ok = allowed === expectAllowed;
  if (!ok) failed++;
  console.log(`${ok ? '  OK   ' : '  FAIL '} ${who.padEnd(6)} ${label} — HTTP ${res.status} (expected ${expectAllowed ? 'allowed' : 'refused'})`);
}

// requirePodPermission → hasPodPermission → chain. The eligibility PUT runs
// the guard before validating the body, so an empty body distinguishes
// "passed the guard" (400) from "refused by it" (403) without writing.
{
  const TN_LEADER_ROLE = '51ab564e-892f-4b28-98fd-34b41c7c713f';
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
console.log(`\n${failed === 0 ? 'Authority decisions match the chain.' : `${failed} mismatch(es).`}`);
process.exit(failed ? 1 : 0);
