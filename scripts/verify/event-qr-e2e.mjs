#!/usr/bin/env node
// End-to-end check of server-signed event check-in QR codes against production.
//
// Creates throwaway members (organizer, attendee, stranger), a hidden test
// event and a registration, then exercises:
//   POST /api/events/[id]/qr         (issue: owner or organizer only)
//   POST /api/events/[id]/qr/verify  (verify: organizer only; signature,
//                                     event, registration ↔ wallet)
// and removes everything it created (including the explorer_events RSVP row
// the registration trigger writes).
//
// Usage: node scripts/verify/event-qr-e2e.mjs   (reads .env)

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
const BASE = (env.VERIFY_BASE_URL || env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
if (!BASE) { console.error('Set VERIFY_BASE_URL or NEXT_PUBLIC_APP_URL'); process.exit(1); }
const EMAIL_DOMAIN = env.VERIFY_EMAIL_DOMAIN || 'example.org';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const step = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const randWallet = () => '0x' + crypto.randomBytes(20).toString('hex');
const mint = (sub) => realSession(admin, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sub);
const api = async (path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const created = { users: [], events: [], registrations: [] };
async function makeUser(tag) {
  const wallet = randWallet();
  const email = `event-qr-test+${tag}-${Date.now()}@${EMAIL_DOMAIN}`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { wallet_address: wallet, test: true } });
  if (error) throw new Error('createUser: ' + error.message);
  const id = data.user.id;
  created.users.push(id);
  const p = await admin.from('user_profiles').insert({ user_id: id, wallet_address: wallet, first_name: 'Event-QR', last_name: `Test ${tag}`, email });
  if (p.error) throw new Error('profile insert: ' + p.error.message);
  const w = await admin.from('user_wallets').insert({ user_id: id, wallet_address: wallet, is_canonical: true, wallet_type: 'device' });
  if (w.error) throw new Error('user_wallets insert: ' + w.error.message);
  return { id, wallet, token: await mint(id) };
}

async function makeEvent(creator) {
  const { data, error } = await admin.from('events').insert({
    title: 'QR check-in test (automated, hidden)',
    description: 'Created and removed by scripts/verify/event-qr-e2e.mjs',
    event_date: new Date(Date.now() + 86400000).toISOString(),
    creator_address: creator,
    status: 'draft',
  }).select('id').single();
  if (error) throw new Error('event insert: ' + error.message);
  created.events.push(data.id);
  return data.id;
}

async function cleanup() {
  await signOutTestSessions(admin);
  for (const r of created.registrations) {
    await admin.from('explorer_events').delete().eq('dedupe_key', `event_rsvp:${r}`);
  }
  if (created.registrations.length) await admin.from('event_registrations').delete().in('id', created.registrations);
  if (created.events.length) await admin.from('events').delete().in('id', created.events);
  for (const id of created.users) {
    await admin.from('user_wallets').delete().eq('user_id', id);
    await admin.from('user_profiles').delete().eq('user_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log('cleanup: deleteUser failed for', id, error.message);
  }
  const left = await admin.from('explorer_events').select('id')
    .in('dedupe_key', created.registrations.map((r) => `event_rsvp:${r}`));
  console.log(`cleanup: ${created.users.length} users, ${created.events.length} events, ${created.registrations.length} registrations removed; ledger rows left: ${left.data?.length ?? '?'}`);
}

try {
  const organizer = await makeUser('organizer');
  const attendee = await makeUser('attendee');
  const stranger = await makeUser('stranger');
  const eventId = await makeEvent(organizer.wallet);
  const otherEventId = await makeEvent(organizer.wallet);

  const { data: reg, error: regErr } = await admin.from('event_registrations')
    .insert({ event_id: eventId, user_address: attendee.wallet, registration_status: 'registered' })
    .select('id').single();
  if (regErr) throw new Error('registration insert: ' + regErr.message);
  created.registrations.push(reg.id);

  let r = await api(`/api/events/${eventId}/qr`, { body: { registrationId: reg.id } });
  step('issue refuses without a session', r.status === 401, `HTTP ${r.status}`);

  r = await api(`/api/events/${eventId}/qr`, { token: stranger.token, body: { registrationId: reg.id } });
  step('issue refuses a stranger', r.status === 403, `HTTP ${r.status}`);

  r = await api(`/api/events/${otherEventId}/qr`, { token: attendee.token, body: { registrationId: reg.id } });
  step('issue refuses a registration from another event', r.status === 404, `HTTP ${r.status}`);

  r = await api(`/api/events/${eventId}/qr`, { token: attendee.token, body: { registrationId: reg.id } });
  const token = r.json?.token;
  step('attendee gets a signed code for their own registration', r.status === 200 && /^sdq1\./.test(token ?? ''), `HTTP ${r.status}`);

  r = await api(`/api/events/${eventId}/qr`, { token: organizer.token, body: { registrationId: reg.id } });
  step('organizer can issue an attendee\'s code', r.status === 200 && !!r.json?.token, `HTTP ${r.status}`);

  r = await api(`/api/events/${eventId}/qr/verify`, { token: attendee.token, body: { token } });
  step('verify refuses a non-organizer (the attendee)', r.status === 403, `HTTP ${r.status}`);

  r = await api(`/api/events/${eventId}/qr/verify`, { token: organizer.token, body: { token } });
  step('organizer verifies a genuine code', r.status === 200 && r.json?.valid === true && r.json?.registrationId === reg.id && r.json?.wallet === attendee.wallet, `HTTP ${r.status}`);

  const [pre, body, sig] = token.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), w: stranger.wallet })).toString('base64url');
  r = await api(`/api/events/${eventId}/qr/verify`, { token: organizer.token, body: { token: `${pre}.${forgedBody}.${sig}` } });
  step('edited code (wallet swapped) is rejected', r.status === 400 && r.json?.valid === false, `HTTP ${r.status} ${r.json?.error ?? ''}`);

  const legacy = Buffer.from(`${eventId}-${attendee.wallet}-${Date.now()}`).toString('base64').slice(0, 16);
  r = await api(`/api/events/${eventId}/qr/verify`, { token: organizer.token, body: { token: legacy } });
  step('old-style base64 "signature" is rejected', r.status === 400 && r.json?.valid === false, `HTTP ${r.status}`);

  r = await api(`/api/events/${otherEventId}/qr/verify`, { token: organizer.token, body: { token } });
  step('a code for another event is rejected', r.status === 400 && r.json?.valid === false, `HTTP ${r.status} ${r.json?.error ?? ''}`);

  await admin.from('event_registrations').update({ user_address: stranger.wallet }).eq('id', reg.id);
  r = await api(`/api/events/${eventId}/qr/verify`, { token: organizer.token, body: { token } });
  step('code no longer valid once the registration belongs to someone else', r.status === 400 && r.json?.valid === false, `HTTP ${r.status}`);
} catch (err) {
  step('script ran without errors', false, err instanceof Error ? err.message : String(err));
} finally {
  await cleanup();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
