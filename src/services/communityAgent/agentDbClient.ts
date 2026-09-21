// src/services/communityAgent/agentDbClient.ts
//
// Congregant Phase 3: the agent's OWN database identity.
//
// Agent content writes go through a Supabase client authenticated as the
// `community_agent` Postgres role instead of the service role. The role can
// only INSERT forum/chat/event content attributed to its own wallet — enforced
// by grants and RLS (see supabase/migrations/20260818000001_agent_scoped_role.sql),
// not by application discipline.
//
// A leaked agent token can, at worst, post content as that agent. It cannot
// touch votes, treasuries, memberships, permissions, or profiles.
//
// Audit Phase 2 (2026-09-16), two changes:
//   1. No service-role fallback. It existed because the scoped role once was
//      not migrated; the role is verified working in production, so a failed
//      scoped write is now an error, never a silent escalation to admin.
//   2. An agent may not post until it is registered in the on-chain
//      AgentRegistry. The constitution monitor claims every posting agent is
//      registered; this is where that claim is enforced.
//
// 2026-09-21, how the token is obtained changed; what it may do did not.
//   Before: this file signed the agent's token itself with the shared JWT
//   secret, the same secret that was found in git history. After: each agent
//   has an auth account whose server-controlled metadata carries its wallet,
//   and the custom access token hook stamps `role=community_agent` and the
//   wallet onto every token Supabase issues for it. Nothing here signs
//   anything. The legacy path stays behind SESSION_ISSUANCE until the secret
//   is revoked, then goes.

import { createHmac } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isRegisteredAgent } from '@/lib/agentGuard';
import { issueSupabaseSession, sessionIssuance } from '@/lib/issueSession';

const TOKEN_TTL_SECONDS = 15 * 60;

// Reserved address space for agent accounts. Nothing is ever mailed to these;
// they exist because Supabase issues sessions by email.
const AGENT_EMAIL_DOMAIN = 'agents.spiritdao.org';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured');
  return url;
}

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Legacy: self-signed token (until the shared secret is revoked) ──────────

/** Sign a short-lived JWT for the community_agent role. Legacy path. */
function signAgentToken(agentWallet: string): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      role: 'community_agent',
      wallet_address: agentWallet.toLowerCase(),
      iss: 'commapp-agent',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// ── Current: an account per agent, a Supabase-issued token ──────────────────

export function agentAccountEmail(agentWallet: string): string {
  return `${agentWallet.toLowerCase()}@${AGENT_EMAIL_DOMAIN}`;
}

/**
 * The auth account for an agent wallet, created on first use.
 *
 * `app_metadata.agent_wallet` is what the access token hook keys on, and only
 * the service key can write app_metadata, so a member cannot promote their
 * own account into an agent by editing their metadata.
 */
export async function ensureAgentAccount(agentWallet: string): Promise<string> {
  const wallet = agentWallet.toLowerCase();
  const email = agentAccountEmail(wallet);
  const admin = adminClient();

  // Lookup by email. The admin API has no direct email lookup, so page
  // through; agents are few and this runs once per wallet per process.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`ensureAgentAccount: listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) {
      if (hit.app_metadata?.agent_wallet !== wallet) {
        const { error: updErr } = await admin.auth.admin.updateUserById(hit.id, {
          app_metadata: { ...(hit.app_metadata ?? {}), agent_wallet: wallet },
        });
        if (updErr) throw new Error(`ensureAgentAccount: could not mark account: ${updErr.message}`);
      }
      return hit.id;
    }
    if (data.users.length < 200) break;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { agent_wallet: wallet },
    user_metadata: { is_agent: true },
  });
  if (createErr || !created?.user) {
    throw new Error(`ensureAgentAccount: could not create account: ${createErr?.message ?? 'unknown'}`);
  }
  return created.user.id;
}

// Sessions are reused until shortly before they lapse; a fresh one costs
// three round trips, and agents post in bursts.
const sessionCache = new Map<string, { token: string; expiresAt: number }>();
const REFRESH_MARGIN_SECONDS = 120;

async function agentAccessToken(agentWallet: string): Promise<string> {
  const wallet = agentWallet.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const cached = sessionCache.get(wallet);
  if (cached && cached.expiresAt - REFRESH_MARGIN_SECONDS > now) return cached.token;

  const userId = await ensureAgentAccount(wallet);
  const issued = await issueSupabaseSession(userId);
  sessionCache.set(wallet, { token: issued.accessToken, expiresAt: issued.expiresAt });
  return issued.accessToken;
}

/**
 * Supabase client scoped to a specific agent wallet.
 */
export async function getAgentClient(agentWallet: string): Promise<SupabaseClient> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('Supabase env not configured');

  const token =
    sessionIssuance() === 'supabase'
      ? await agentAccessToken(agentWallet)
      : signAgentToken(agentWallet);

  return createClient(supabaseUrl(), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * May this agent wallet post at all? Only a wallet registered in the on-chain
 * AgentRegistry may. Legacy pseudo-addresses (0xca10…) were never registrable
 * and are refused; the guard's own failure (registry unreachable, nothing
 * cached) is also a refusal. Returns the reason when refused.
 */
export async function agentMayPost(agentWallet: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const addr = agentWallet.toLowerCase();
  if (addr.startsWith('0xca10')) {
    return { ok: false, reason: 'legacy pseudo-address is not an on-chain registered agent' };
  }
  try {
    const registered = await isRegisteredAgent(addr);
    return registered
      ? { ok: true }
      : { ok: false, reason: 'agent wallet is not registered in the AgentRegistry' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Insert a row as the agent, returning selected columns.
 *
 * Fails closed: if the scoped write cannot be made — the agent is not
 * registered on-chain, the role is refused by RLS, a session cannot be
 * obtained, the scoped client cannot be built — the caller gets an error.
 * Nothing falls back to the service role.
 */
export async function agentInsert<T = any>(
  agentWallet: string,
  table: string,
  row: Record<string, any>,
  select?: string,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const permit = await agentMayPost(agentWallet);
  if (!permit.ok) {
    console.error(`[agentDbClient] refusing insert into ${table}: ${permit.reason}`);
    return { data: null, error: { message: `Agent may not post: ${permit.reason}` } };
  }

  let client: SupabaseClient;
  try {
    client = await getAgentClient(agentWallet);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agentDbClient] scoped client unavailable for ${table}: ${message}`);
    return { data: null, error: { message } };
  }

  const query = client.from(table).insert(row);
  const result = select
    ? await query.select(select).single()
    : await query.select().single();

  if (result.error) {
    const msg = result.error.message || '';
    const rls = msg.includes('row-level security') || (result.error as any).code === '42501';
    console.error(
      `[agentDbClient] ${rls ? 'RLS refused' : 'scoped insert failed for'} ${table}: ${msg}` +
        (rls ? '' : ' — check migration 20260818000001_agent_scoped_role.sql; no fallback is taken.'),
    );
    return { data: null, error: result.error };
  }

  return { data: result.data as T, error: null };
}
