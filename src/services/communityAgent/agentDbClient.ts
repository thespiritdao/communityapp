// src/services/communityAgent/agentDbClient.ts
//
// Congregant Phase 3: the agent's OWN database identity.
//
// Agent content writes go through a Supabase client authenticated as the
// `community_agent` Postgres role (via a short-lived HS256 JWT signed with
// SUPABASE_JWT_SECRET) instead of the service role. The role can only INSERT
// forum/chat/event content attributed to its own wallet — enforced by grants
// and RLS (see supabase/migrations/20260818000001_agent_scoped_role.sql),
// not by application discipline. actor_type='agent' is required by the RLS
// policies, so provenance is structural.
//
// A leaked agent token can, at worst, post content as that agent. It cannot
// touch votes, treasuries, memberships, permissions, or profiles.

import { createHmac } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

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
 * Insert a row as the agent, returning selected columns.
 *
 * Falls back to the service role with a LOUD warning if the scoped write
 * fails for infrastructure reasons (role not migrated yet, JWT secret
 * missing) — agent liveness should not depend on migration timing. RLS
 * *policy* rejections do NOT fall back: if the constitution says no, the
 * answer is no.
 */
export async function agentInsert<T = any>(
  agentWallet: string,
  table: string,
  row: Record<string, any>,
  select?: string,
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const client = getAgentClient(agentWallet);
    const query = client.from(table).insert(row);
    const result = select
      ? await query.select(select).single()
      : await query.select().single();

    if (!result.error) {
      return { data: result.data as T, error: null };
    }

    // RLS policy rejection (42501 / row-level security violation): the scoped
    // role refused — surface it, never bypass it.
    const msg = result.error.message || '';
    if (msg.includes('row-level security') || (result.error as any).code === '42501') {
      console.error(`[agentDbClient] RLS refused agent insert into ${table}:`, msg);
      return { data: null, error: result.error };
    }

    // Infrastructure failure — fall back to admin, loudly, so the gap is
    // visible in logs until resolved.
    console.warn(
      `[agentDbClient] scoped insert into ${table} failed (${msg}) — falling back to service role. ` +
        'Check that migration 20260818000001_agent_scoped_role.sql is applied.',
    );
  } catch (err) {
    console.warn(
      `[agentDbClient] scoped client unavailable (${err instanceof Error ? err.message : err}) — ` +
        `falling back to service role for ${table}.`,
    );
  }

  const fallback = supabaseAdmin.from(table).insert(row);
  const result = select
    ? await fallback.select(select).single()
    : await fallback.select().single();
  return { data: (result.data as T) ?? null, error: result.error };
}
