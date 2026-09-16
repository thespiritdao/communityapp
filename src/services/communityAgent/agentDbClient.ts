// src/services/communityAgent/agentDbClient.ts
//
// Congregant Phase 3: the agent's OWN database identity.
//
// Agent content writes go through a Supabase client authenticated as the
// `community_agent` Postgres role (via a short-lived HS256 JWT signed with
// SUPABASE_JWT_SECRET) instead of the service role. The role can only INSERT
// forum/chat/event content attributed to its own wallet — enforced by grants
// and RLS (see supabase/migrations/20260818000001_agent_scoped_role.sql),
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

import { createHmac } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isRegisteredAgent } from '@/lib/agentGuard';

const TOKEN_TTL_SECONDS = 15 * 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Sign a short-lived JWT for the community_agent role. */
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

/**
 * Supabase client scoped to a specific agent wallet. Not cached — tokens are
 * short-lived and clients are cheap.
 */
export function getAgentClient(agentWallet: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase env not configured');

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signAgentToken(agentWallet)}` } },
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
 * registered on-chain, the role is refused by RLS, the JWT secret is missing,
 * the scoped client cannot be built — the caller gets an error. Nothing falls
 * back to the service role.
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
    client = getAgentClient(agentWallet);
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
