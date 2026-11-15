#!/usr/bin/env node
// Call one of the app's scheduled jobs by hand, the way Vercel cron does.
//
// Usage:
//   node scripts/ops/trigger-cron.mjs <path>
//   node scripts/ops/trigger-cron.mjs update-pending-bounties-v3
//   node scripts/ops/trigger-cron.mjs /api/cron/email-digest --base http://localhost:3000
//
// Sends `Authorization: Bearer $CRON_SECRET`. Target: --base, VERIFY_BASE_URL
// or NEXT_PUBLIC_APP_URL. The list of jobs is in vercel.json.
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const arg = process.argv[2];
const i = process.argv.indexOf('--base');
const base = ((i > -1 ? process.argv[i + 1] : null) || process.env.VERIFY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
const secret = process.env.CRON_SECRET;

if (!arg || !base || !secret) {
  console.error('Usage: node scripts/ops/trigger-cron.mjs <path> [--base <url>]');
  console.error('Needs CRON_SECRET and NEXT_PUBLIC_APP_URL (or --base / VERIFY_BASE_URL).');
  process.exit(1);
}
const path = arg.startsWith('/') ? arg : `/api/cron/${arg}`;

const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${secret}` } });
const text = await res.text();
console.log(`${res.status} ${res.statusText}  ${base}${path}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
process.exit(res.ok ? 0 : 1);
