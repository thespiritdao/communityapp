#!/usr/bin/env node
// Apply one SQL file to the database inside a transaction.
//
// Usage:
//   node scripts/db/apply-migration.mjs supabase/migrations/<file>.sql
//   node scripts/db/apply-migration.mjs supabase/baseline/01_schema.sql --no-transaction
//
// Connection: SUPABASE_DB_URL if set (a full postgres:// URL, e.g. the
// "Session pooler" string from Supabase → Connect), otherwise built from
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD + SUPABASE_POOLER_HOST
// (for example aws-0-us-east-1.pooler.supabase.com).
//
// The whole file runs in one transaction unless --no-transaction is passed
// (needed for statements Postgres refuses inside a transaction). On error the
// transaction is rolled back and the script exits non-zero.
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const file = process.argv[2];
const noTx = process.argv.includes('--no-transaction');
if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/db/apply-migration.mjs <path/to/file.sql> [--no-transaction]');
  process.exit(1);
}

function connectionString() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  const host = process.env.SUPABASE_POOLER_HOST;
  if (!url || !pw || !host) {
    console.error('Set SUPABASE_DB_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD + SUPABASE_POOLER_HOST.');
    process.exit(1);
  }
  const ref = new URL(url).hostname.split('.')[0];
  return `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${host}:5432/postgres`;
}

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({
  connectionString: connectionString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();
try {
  if (!noTx) await client.query('begin');
  await client.query(sql);
  if (!noTx) await client.query('commit');
  console.log(`Applied ${file}${noTx ? ' (no transaction)' : ''}.`);
} catch (err) {
  if (!noTx) await client.query('rollback').catch(() => {});
  console.error(`Failed to apply ${file}: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
