#!/usr/bin/env node
// Storage ownership: only the uploader may overwrite or delete a file, and
// nobody without a session may write at all.
//
// Creates two throwaway accounts (A and B) on VERIFY_EMAIL_DOMAIN, uploads as
// A, tries to overwrite and delete as B, then cleans up every file and
// account it made. Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// and SUPABASE_SERVICE_ROLE_KEY.
//
// Usage: node scripts/verify/storage-ownership-e2e.mjs
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { verifyEmailDomain } from './lib/verifyConfig.mjs';
import { realSession, signOutTestSessions } from './lib/testSessions.mjs';

dotenv.config();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const asToken = (t) => createClient(URL_, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${t}` } } });
const anon = createClient(URL_, ANON, opts);

// Smallest valid PNG (1x1).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const BUCKETS = ['event-images', 'product_images', 'profile_images', 'pod-images', 'hat-images', 'attachments'];

let pass = 0, fail = 0;
const check = (ok, label, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const exists = async (bucket, path) => {
  const dir = path.split('/').slice(0, -1).join('/');
  const name = path.split('/').pop();
  const { data } = await admin.storage.from(bucket).list(dir, { search: name });
  return (data || []).some((o) => o.name === name);
};

const users = [];
const made = []; // [bucket, path]
const stamp = `verify-storage-${Date.now()}`;

try {
  for (const tag of ['a', 'b']) {
    const email = `${stamp}-${tag}@${verifyEmailDomain()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error('createUser: ' + error.message);
    users.push(data.user.id);
  }
  const A = asToken(await realSession(admin, URL_, ANON, users[0]));
  const B = asToken(await realSession(admin, URL_, ANON, users[1]));

  for (const bucket of BUCKETS) {
    const path = `${stamp}/${bucket}.png`;

    const anonUp = await anon.storage.from(bucket).upload(`${stamp}/anon-${bucket}.png`, PNG, { contentType: 'image/png' });
    check(!!anonUp.error, `${bucket}: no-session upload refused`, anonUp.error?.message);
    if (!anonUp.error) made.push([bucket, `${stamp}/anon-${bucket}.png`]);

    const up = await A.storage.from(bucket).upload(path, PNG, { contentType: 'image/png' });
    check(!up.error, `${bucket}: member uploads own file`, up.error?.message);
    if (up.error) continue;
    made.push([bucket, path]);

    const over = await B.storage.from(bucket).upload(path, PNG, { contentType: 'image/png', upsert: true });
    check(!!over.error, `${bucket}: another member cannot overwrite it`, over.error?.message);

    if (bucket === 'attachments') {
      const { data: seen } = await B.storage.from(bucket).list(stamp);
      check(!(seen || []).length, 'attachments: another member cannot list it', `${(seen || []).length} visible`);
    }

    await B.storage.from(bucket).remove([path]);
    check(await exists(bucket, path), `${bucket}: another member cannot delete it`);

    await anon.storage.from(bucket).remove([path]);
    check(await exists(bucket, path), `${bucket}: no-session delete has no effect`);

    const del = await A.storage.from(bucket).remove([path]);
    const gone = !(await exists(bucket, path));
    check(!del.error && gone, `${bucket}: uploader can delete own file`, del.error?.message);
  }
} catch (err) {
  fail++;
  console.error('ERROR', err.message);
} finally {
  for (const [bucket, path] of made) await admin.storage.from(bucket).remove([path]).catch(() => {});
  await signOutTestSessions(admin);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log(`cleanup: ${made.length} test files and ${users.length} test users removed`);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
