// Applies scripts/db-migrations/015_rate_limits.sql via direct Postgres
// connection, then verifies the table and RPC exist and the RPC counts.
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

const sql = readFileSync(join(__dirname, 'db-migrations/015_rate_limits.sql'), 'utf8');

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

  // Two calls with the same key must count 1 then 2 within the same window.
  const { rows: r1 } = await client.query(
    `SELECT public.rate_limit_hit('migration-selftest', 10, 60) AS res`,
  );
  const { rows: r2 } = await client.query(
    `SELECT public.rate_limit_hit('migration-selftest', 10, 60) AS res`,
  );
  const a = r1[0].res, b = r2[0].res;
  if (!(a.allowed === true && a.count === 1 && b.count === 2)) {
    console.error('VERIFICATION FAILED - unexpected RPC results:', JSON.stringify({ a, b }));
    process.exit(1);
  }
  await client.query(`DELETE FROM public.rate_limits WHERE key = 'migration-selftest'`);
  console.log('Verified: rate_limit_hit counts correctly.', JSON.stringify(b));
} finally {
  await client.end();
}
