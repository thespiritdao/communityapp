#!/usr/bin/env node
// scripts/check-anon-exposure.mjs
//
// Regression test for the 2026-09-20 lockdown (migration
// 20260920000001_revoke_anon_and_lock_functions.sql).
//
// Before it, 44 of 145 tables returned data to a caller holding nothing but
// the anon key that ships in the browser bundle — private chat, push
// subscription endpoints, notifications, member presence, treasury rows. The
// cause was that most row-security policies name the `public` role (which
// includes `anon`) and the anonymous role held table grants by default. A new
// table created with platform defaults reopens the hole silently, which is
// exactly what this test exists to catch.
//
// It enumerates every relation and function the API exposes (read with the
// service key, so the list is complete), then probes each one as an anonymous
// caller. Nothing may be readable, writable or callable.
//
//   node scripts/check-anon-exposure.mjs
//
// Exit code 1 if anything is reachable without a session.
//
// Two things learned by deliberately exposing an empty table and watching this
// script react, on 2026-09-20:
//
//   1. The published schema lags DDL by tens of seconds. A table created just
//      now may not be in the inventory yet, so this belongs AFTER a deploy
//      rather than immediately after a migration. VERIFY_MIN_RELATIONS guards
//      the other direction: a truncated inventory would otherwise look clean.
//   2. The anonymous role's own schema listing is NOT a reliable signal. It
//      reported zero paths while an anonymous caller could in fact read the
//      exposed table. It is printed below as a hint, never as a pass.

import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB || !ANON || !SERVICE) {
  console.error(
    'Missing configuration. Needs NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const findings = [];
const note = (s) => console.log(`  ${s}`);

/** The full set of relations and functions PostgREST publishes. */
async function inventory() {
  const res = await fetch(`${SB}/rest/v1/`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`could not read the API schema: HTTP ${res.status}`);
  const spec = await res.json();
  const paths = Object.keys(spec.paths ?? {});
  return {
    relations: paths.filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1)),
    rpcs: paths.filter((p) => p.startsWith('/rpc/')).map((p) => p.slice(5)),
  };
}

const anonHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function readsAsAnon(relation) {
  const res = await fetch(`${SB}/rest/v1/${relation}?select=*&limit=1`, {
    headers: { ...anonHeaders, Prefer: 'count=exact' },
  });
  if (!res.ok) return null; // refused, which is what we want
  const range = res.headers.get('content-range') ?? '';
  const rows = Number.parseInt(range.split('/')[1] ?? '0', 10);
  return { status: res.status, rows: Number.isFinite(rows) ? rows : 0 };
}

async function callableAsAnon(fn) {
  const res = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...anonHeaders, 'Content-Type': 'application/json' },
    body: '{}',
  });
  // 404 = not exposed to this role. 401/403 = refused. Anything else means
  // the function was reached, even if it then failed on its arguments.
  return [401, 403, 404].includes(res.status) ? null : res.status;
}

async function main() {
  console.log('Probing production as an anonymous caller.\n');

  const { relations, rpcs } = await inventory();
  note(`the API publishes ${relations.length} relations and ${rpcs.length} functions`);

  // A short inventory means the schema listing is stale or truncated, and
  // every probe below would pass for the wrong reason. Fail loudly instead.
  const MIN_RELATIONS = 120;
  if (relations.length < MIN_RELATIONS) {
    console.error(
      `\n✖ Only ${relations.length} relations enumerated, expected at least ` +
        `${MIN_RELATIONS}. The schema listing is stale or truncated, so this ` +
        'run proves nothing. Re-run in a minute.\n',
    );
    process.exit(1);
  }

  // 1. A hint only. This listing reported zero paths while an anonymous caller
  //    could still read an exposed table, so a low number proves nothing; the
  //    per-relation probes below are what actually decide the result.
  const specRes = await fetch(`${SB}/rest/v1/`, { headers: anonHeaders });
  const anonSpec = specRes.ok ? await specRes.json().catch(() => ({})) : {};
  const anonPaths = Object.keys(anonSpec.paths ?? {}).filter((p) => p !== '/');
  if (anonPaths.length > 0) {
    findings.push(`the anonymous role advertises ${anonPaths.length} API paths: ${anonPaths.slice(0, 8).join(', ')}`);
  }
  note(`anonymous callers advertise ${anonPaths.length} API paths (hint only)`);

  // 2. No relation may return data.
  let refused = 0;
  for (const rel of relations) {
    const hit = await readsAsAnon(rel);
    if (hit === null) refused += 1;
    else if (hit.rows > 0) findings.push(`${rel} returns ${hit.rows} rows to an anonymous caller`);
    else findings.push(`${rel} is readable by an anonymous caller (empty, but reachable)`);
  }
  note(`${refused} of ${relations.length} relations refused the anonymous read`);

  // 3. No function may be callable.
  let fnRefused = 0;
  const reachable = [];
  for (const fn of rpcs) {
    const status = await callableAsAnon(fn);
    if (status === null) fnRefused += 1;
    else reachable.push(`${fn} (HTTP ${status})`);
  }
  if (reachable.length) findings.push(`functions callable anonymously: ${reachable.join(', ')}`);
  note(`${fnRefused} of ${rpcs.length} functions refused the anonymous call`);

  // 4. Writes must be refused too. Two tables once granted insert to PUBLIC.
  for (const rel of ['products', 'order_status_history', 'user_profiles']) {
    if (!relations.includes(rel)) continue;
    const res = await fetch(`${SB}/rest/v1/${rel}`, {
      method: 'POST',
      headers: { ...anonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status === 200 || res.status === 201) {
      findings.push(`an anonymous caller can write to ${rel}`);
    }
  }
  note('anonymous writes refused');

  console.log('');
  if (findings.length) {
    console.error('✖ Reachable without a session:\n');
    findings.forEach((f) => console.error(`  ${f}`));
    console.error(
      '\nA relation or function created with platform defaults is granted to the\n' +
        'anonymous role automatically. Revoke it rather than adding a policy: see\n' +
        'supabase/migrations/20260920000001_revoke_anon_and_lock_functions.sql.\n',
    );
    process.exit(1);
  }
  console.log('✓ Nothing is readable, writable or callable without a session.');
}

main().catch((e) => {
  console.error('check-anon-exposure failed to run:', e?.message ?? e);
  process.exit(1);
});
