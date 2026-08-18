// Applies supabase/migrations/20260818000002_explorer_agent_provenance_trigger.sql
// and verifies the trigger exists.
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const conn = `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const sql = readFileSync(
  join(__dirname, '../supabase/migrations/20260818000002_explorer_agent_provenance_trigger.sql'),
  'utf8',
);

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query(sql);
  console.log('Migration executed.');
  const { rows } = await client.query(
    `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_stamp_explorer_actor_type'`,
  );
  console.log('trigger:', rows.length ? 'installed' : 'MISSING');
} finally {
  await client.end();
}
