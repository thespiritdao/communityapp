// Applies supabase/migrations/20260818000003_corpus_optout.sql and verifies.
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
  join(__dirname, '../supabase/migrations/20260818000003_corpus_optout.sql'),
  'utf8',
);

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT column_name, column_default FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'exclude_from_agent_corpus'`);
  console.log(rows.length ? `Verified: ${JSON.stringify(rows[0])}` : 'VERIFICATION FAILED');
} finally {
  await client.end();
}
