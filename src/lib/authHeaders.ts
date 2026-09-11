// src/lib/authHeaders.ts
// Client-side helper: attach the caller's Supabase JWT to API fetches so
// server routes can authenticate via getWalletFromRequest / apiPodGuard.
// Returns {} when no session exists (route will 401 — fail closed).

import { supabase } from '@/lib/supabase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  } catch {
    return {};
  }
}

/**
 * Return a Supabase access token, re-establishing the session first if it is
 * missing. The app's CDP wallet session and its Supabase session are separate:
 * the wallet can still sign transactions after the Supabase session has gone,
 * which used to make authenticated API calls fail with a bare 401 *after* an
 * on-chain write had already succeeded.
 *
 * Use this (not getAuthHeaders) on any call that must not be lost — anything
 * recording the result of a transaction.
 *
 * Returns null only when there is no CDP wallet to sign in with.
 */
export async function ensureAuthToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    /* fall through to re-auth */
  }

  try {
    const { getCurrentUser } = await import('@coinbase/cdp-core');
    const user = await getCurrentUser();
    const address =
      (user as { evmSmartAccounts?: string[]; evmAccounts?: string[] } | null)
        ?.evmAccounts?.[0] ?? null;
    if (!address) return null;

    const { requestSupabaseSession } = await import(
      '@/features/identity/lib/cdpSession'
    );
    const res = await requestSupabaseSession({ address });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.requiresLinking || !body?.supabaseToken) return null;

    const { data, error } = await supabase.auth.setSession({
      access_token: body.supabaseToken,
      refresh_token: body.supabaseRefreshToken,
    });
    if (error) return null;
    return data.session?.access_token ?? body.supabaseToken;
  } catch (err) {
    console.warn('ensureAuthToken: could not re-establish session', err);
    return null;
  }
}

/** Like getAuthHeaders, but re-establishes a missing session first. */
export async function ensureAuthHeaders(): Promise<Record<string, string>> {
  const token = await ensureAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
