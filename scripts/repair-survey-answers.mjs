#!/usr/bin/env node
/**
 * Repairs survey answers that were JSON-encoded twice before being written to
 * the jsonb `survey_answers.answer_value` column. A choice of "Town Hall Time"
 * was stored as "\"Town Hall Time\"" — quote characters included — so results
 * tallied it against no option and every bar read 0%.
 *
 * The write path was fixed on 2026-09-11; this repairs rows created before it.
 *
 *   node scripts/repair-survey-answers.mjs          # report only
 *   node scripts/repair-survey-answers.mjs --apply  # write the fixes
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const APPLY = process.argv.includes('--apply');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(url, key);

/** Returns the decoded value when a row is double-encoded, else null. */
function decode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const looksEncoded =
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{');
  if (!looksEncoded) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed) === JSON.stringify(raw) ? null : parsed;
  } catch {
    return null;
  }
}

const { data: rows, error } = await db
  .from('survey_answers')
  .select('id, question_id, answer_value');

if (error) {
  console.error('Could not read survey_answers:', error.message);
  process.exit(1);
}

const broken = [];
for (const row of rows ?? []) {
  const fixed = decode(row.answer_value);
  if (fixed !== null) broken.push({ ...row, fixed });
}

console.log(`Scanned ${rows?.length ?? 0} answers; ${broken.length} need repair.`);
for (const row of broken.slice(0, 25)) {
  console.log(`  ${row.id}: ${JSON.stringify(row.answer_value)} -> ${JSON.stringify(row.fixed)}`);
}
if (broken.length > 25) console.log(`  ...and ${broken.length - 25} more`);

if (!broken.length) process.exit(0);

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write these changes.');
  process.exit(0);
}

let done = 0;
let failed = 0;
for (const row of broken) {
  const { error: upErr } = await db
    .from('survey_answers')
    .update({ answer_value: row.fixed })
    .eq('id', row.id);
  if (upErr) {
    failed++;
    console.error(`  failed ${row.id}: ${upErr.message}`);
  } else {
    done++;
  }
}
console.log(`\nRepaired ${done} answers, ${failed} failed.`);
process.exit(failed ? 1 : 0);
