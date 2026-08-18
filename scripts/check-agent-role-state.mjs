// scripts/check-agent-role-state.mjs
// Pre-migration check for the Phase 3 agent-scoped role: RLS state of target
// tables + whether the community_agent role already exists.
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const conn = `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await client.connect();

const { rows } = await client.query(`
  SELECT c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('forum_threads','forum_posts','chat_messages','explorer_events','events','community_agent_posts')
  ORDER BY 1`);
for (const r of rows) console.log(`${r.relname}: RLS ${r.relrowsecurity ? 'ENABLED' : 'disabled'}`);

const { rows: roles } = await client.query(
  `SELECT rolname FROM pg_roles WHERE rolname IN ('community_agent','authenticator')`,
);
console.log('roles present:', roles.map((r) => r.rolname).join(', ') || 'none');

const { rows: cols } = await client.query(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'actor_type'
    AND table_name IN ('forum_threads','forum_posts','chat_messages','explorer_events','events')`);
console.log('existing actor_type columns:', cols.map((c) => c.table_name).join(', ') || 'none');

await client.end();
