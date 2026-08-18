// scripts/test-agent-scoped-role.mjs
// Live verification of the community_agent scoped role (Congregant Phase 3):
//   1. agent JWT can SELECT config
//   2. agent can INSERT its own community_agent_posts row (cleaned up after)
//   3. agent CANNOT insert forum content attributed to another wallet
//   4. agent CANNOT insert forum content with actor_type='human' (provenance)
//   5. agent CANNOT update or delete anything
//   6. agent CANNOT read privileged tables (user_profiles, governance_votes)
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const KAIROS = '0x26e2fc58752b785fb9ab3a315db32bd4f81dd48a';
const TN_POD = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

function signToken(wallet) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ role: 'community_agent', wallet_address: wallet, iss: 'commapp-agent', iat: now, exp: now + 600 });
  const sig = createHmac('sha256', process.env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const agent = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${signToken(KAIROS)}` } },
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

// 1. SELECT config
{
  const { data, error } = await agent.from('pod_modules').select('pod_id').eq('pod_id', TN_POD).single();
  record('agent can read pod_modules', !!data && !error, error?.message);
}

// 2. INSERT own agent-posts row
let testRowId = null;
{
  const { data, error } = await agent
    .from('community_agent_posts')
    .insert({ pod_id: TN_POD, type: 'daily_discussion', content: '[scoped-role test row — safe to delete]', status: 'draft' })
    .select('id')
    .single();
  testRowId = data?.id ?? null;
  record('agent can insert own community_agent_posts', !!testRowId, error?.message);
}

// 3. Forum insert attributed to ANOTHER wallet → must be refused
{
  const { error } = await agent.from('forum_threads').insert({
    category_id: '00000000-0000-0000-0000-000000000000',
    title: 'should never exist',
    content: 'x',
    author_address: '0x617b20f744f9b3d36724bc46050c84a0f4ddebaf',
    actor_type: 'agent',
  });
  record('mis-attributed forum insert refused', !!error, error ? undefined : 'INSERT SUCCEEDED — VIOLATION');
}

// 4. Forum insert masquerading as human → must be refused
{
  const { error } = await agent.from('forum_threads').insert({
    category_id: '00000000-0000-0000-0000-000000000000',
    title: 'should never exist',
    content: 'x',
    author_address: KAIROS,
    actor_type: 'human',
  });
  record('actor_type=human masquerade refused', !!error, error ? undefined : 'INSERT SUCCEEDED — VIOLATION');
}

// 5. UPDATE / DELETE → no grants, must be refused
{
  const { error } = await agent.from('forum_threads').update({ title: 'defaced' }).eq('actor_type', 'agent');
  const updateBlocked = !!error || true; // supabase returns error on permission denial
  const { error: delError } = await agent.from('community_agent_posts').delete().eq('id', testRowId ?? '00000000-0000-0000-0000-000000000000');
  // PostgREST returns 42501 for missing grants; an empty result with no error would be a failure
  record('agent UPDATE refused', !!error, error?.message?.slice(0, 60));
  record('agent DELETE refused', !!delError, delError?.message?.slice(0, 60));
}

// 6. Privileged tables unreadable
{
  const { data, error } = await agent.from('user_profiles').select('wallet_address').limit(1);
  record('user_profiles unreadable', !!error || !data?.length, error ? undefined : 'READ SUCCEEDED');
  const { data: votes, error: vError } = await agent.from('governance_votes').select('id').limit(1);
  record('governance_votes unreadable', !!vError || !votes?.length, vError ? undefined : 'READ SUCCEEDED');
}

// Cleanup
if (testRowId) {
  await admin.from('community_agent_posts').delete().eq('id', testRowId);
  console.log('(test row cleaned up)');
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
