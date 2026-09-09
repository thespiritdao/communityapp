// src/features/identity/lib/cdpSession.ts
// Client-side counterpart of src/lib/cdpAuth.ts.
//
// Every request that asks the server to trust a wallet address (session
// issuance, onboarding, invite validation, device linking) must carry the
// CDP end-user access token so the server can prove the caller controls
// that wallet. Use these helpers instead of hand-rolled fetch() calls.

import { getAccessToken } from '@coinbase/cdp-core';

export const CDP_ACCESS_TOKEN_HEADER = 'x-cdp-access-token';

/** The current Coinbase end-user access token, or null if not signed in. */
export async function getCdpAccessToken(): Promise<string | null> {
  try {
    const token = await getAccessToken();
    return token ?? null;
  } catch (err) {
    console.warn('🔐 cdpSession: could not read CDP access token', err);
    return null;
  }
}

/** JSON headers plus the CDP access token (when available). */
export async function cdpAuthHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await getCdpAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { [CDP_ACCESS_TOKEN_HEADER]: token } : {}),
    ...extra,
  };
}

/** POST JSON to an app route with the CDP access token attached. */
export async function cdpFetch(
  url: string,
  body: unknown,
  init: Omit<RequestInit, 'body' | 'headers' | 'method'> = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    method: 'POST',
    headers: await cdpAuthHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * Ask the server for a Supabase session for an embedded (CDP) wallet.
 * Replaces the eight former direct calls to /api/auth/onchainkit.
 */
export async function requestSupabaseSession(params: {
  address: string;
  email?: string;
}): Promise<Response> {
  return cdpFetch('/api/auth/onchainkit', {
    address: params.address,
    email: params.email,
    isEmbedded: true,
  });
}
