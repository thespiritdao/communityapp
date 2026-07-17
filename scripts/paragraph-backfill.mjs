// scripts/paragraph-backfill.mjs — one-time: subscribe every member email to
// the Paragraph newsletter. Run after fixing the PARAGRAPH_API env-name bug
// that silently skipped auto-subscribe in production.
// Skips placeholder emails (@wallet.spiritdao). POST is idempotent on
// Paragraph's side (already-subscribed returns success).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const PKEY = process.env.PARAGRAPH_API;
if (!PKEY) throw new Error('PARAGRAPH_API not set');

const { data: profiles, error } = await supabase
  .from('user_profiles')
  .select('email, first_name, last_name')
  .not('email', 'is', null);
if (error) throw error;

const emails = [
  ...new Set(
    (profiles ?? [])
      .map((p) => String(p.email).trim().toLowerCase())
      .filter((e) => e.includes('@') && !e.endsWith('@wallet.spiritdao')),
  ),
];
console.log(`${emails.length} unique real emails to subscribe`);

let ok = 0;
let fail = 0;
for (const email of emails) {
  try {
    const res = await fetch('https://public.api.paragraph.com/api/v1/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PKEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.success !== false) {
      ok++;
      console.log(`OK   ${email}`);
    } else {
      fail++;
      console.log(`FAIL ${email} (${res.status}): ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${email}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 250)); // gentle rate limit
}
console.log(`\nDone: ${ok} subscribed, ${fail} failed.`);
