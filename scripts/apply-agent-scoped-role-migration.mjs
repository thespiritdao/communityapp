// Applies supabase/migrations/20260818000001_agent_scoped_role.sql via direct
// Postgres connection, then verifies role, columns, and backfill counts.
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
  join(__dirname, '../supabase/migrations/20260818000001_agent_scoped_role.sql'),
  'utf8',
);

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await client.connect();

try {
  await client.query(sql);
  console.log('Migration executed.');

  const { rows: roles } = await client.query(
    `SELECT rolname FROM pg_roles WHERE rolname = 'community_agent'`,
  );
  console.log('community_agent role:', roles.length ? 'created' : 'MISSING');

  const { rows: cols } = await client.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'actor_type' ORDER BY 1`);
  console.log('actor_type columns:', cols.map((c) => c.table_name).join(', '));

  for (const [table, col] of [
    ['forum_threads', 'author_address'],
    ['forum_posts', 'author_address'],
    ['chat_messages', 'sender_wallet_id'],
    ['explorer_events', 'actor'],
    ['events', 'creator_address'],
  ]) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE actor_type = 'agent'`,
    );
    console.log(`${table}: ${rows[0].n} agent row(s)`);
  }

  const { rows: pols } = await client.query(`
    SELECT tablename, policyname FROM pg_policies
    WHERE policyname LIKE 'agent_%' ORDER BY 1, 2`);
  console.log('agent policies:', pols.map((p) => `${p.tablename}.${p.policyname}`).join(', '));
} finally {
  await client.end();
}
