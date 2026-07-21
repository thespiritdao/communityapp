// Applies supabase/migrations/20260721000001_community_agent_queue_attempts.sql
// via direct Postgres connection, then verifies the column exists.
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

// Transaction pooler — verified reachable for this project (5432 direct + session pooler time out)
const candidates = [
  `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
];

const sql = readFileSync(
  join(__dirname, '../supabase/migrations/20260721000001_community_agent_queue_attempts.sql'),
  'utf8',
);

let client = null;
for (const conn of candidates) {
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  try {
    await c.connect();
    client = c;
    console.log('Connected via', conn.split('@')[1].split(':')[0]);
    break;
  } catch (e) {
    console.log('Connection failed for', conn.split('@')[1].split(':')[0], '-', e.message);
    try { await c.end(); } catch {}
  }
}

if (!client) {
  console.error('Could not connect to the database with any candidate host.');
  process.exit(1);
}

try {
  await client.query(sql);
  console.log('Migration executed.');

  const { rows } = await client.query(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_name = 'community_agent_queue' AND column_name = 'attempts'`,
  );
  if (rows.length === 0) {
    console.error('VERIFICATION FAILED - attempts column not found');
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(rows[0]));
} finally {
  await client.end();
}
