// src/lib/verifySessionToken.ts
//
// One place that decides whether a bearer token is a real session.
//
// Tokens are signed by Supabase with the project's asymmetric signing keys
// (ES256; RS256 also accepted) and checked against the keys it publishes
// (JWKS). The private key never leaves Supabase.
//
// History: until 2026-09-25 this also accepted HS256 tokens signed with the
// legacy shared secret, which had been exposed in git history since
// 2024-12-06. That secret is revoked and the HS256 branch is gone: a token
// signed with it is now refused here as it is by Supabase.
//
// See docs/secrets-and-key-custody.md for where this sits in the sequence.

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

export interface SessionClaims {
  sub: string;
  role?: string;
  wallet_address?: string;
  user_metadata?: { wallet_address?: string; [key: string]: unknown };
  [key: string]: unknown;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Built lazily and cached by jose, which also honours the cache headers on the
// JWKS response, so this is one fetch per server instance rather than per call.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function publishedKeys() {
  if (!jwks) {
    if (!SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    }
    jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

/**
 * Verify a Supabase session token. Returns its claims, or null if the token is
 * missing, malformed, expired, or not signed by a key this project trusts.
 *
 * Never throws for an invalid token: callers that want the older throwing
 * behaviour should use verifySessionTokenOrThrow.
 */
export async function verifySessionToken(
  token: string | null | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    decodeProtectedHeader(token);
  } catch {
    return null; // not a JWT at all
  }

  try {
    // Only the project's published asymmetric keys; symmetric (HS256) tokens
    // are refused outright.
    const { payload } = await jwtVerify(token, publishedKeys(), {
      algorithms: ['ES256', 'RS256'],
    });
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}

/**
 * As verifySessionToken, but throws on an invalid token so that existing
 * try/catch blocks around the old jwt.verify call keep behaving identically.
 */
export async function verifySessionTokenOrThrow(
  token: string | null | undefined,
): Promise<SessionClaims> {
  const claims = await verifySessionToken(token);
  if (!claims) throw new Error('invalid token');
  return claims;
}

/** The wallet a session belongs to, checked both places it may be recorded. */
export function walletFromClaims(claims: SessionClaims | null): string | null {
  if (!claims) return null;
  const wallet =
    (claims.wallet_address as string | undefined) ??
    claims.user_metadata?.wallet_address;
  return typeof wallet === 'string' ? wallet.toLowerCase() : null;
}
