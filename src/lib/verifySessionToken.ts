// src/lib/verifySessionToken.ts
//
// One place that decides whether a bearer token is a real session.
//
// Why this exists: every route used to verify the bearer token itself, against
// the legacy symmetric secret and nothing else. Supabase is
// moving to asymmetric signing keys, where the private key never leaves their
// side and tokens are signed ES256. The moment the project's signing key is
// rotated, every one of those direct calls would reject every token Supabase
// issues — and because our own sign-in still mints HS256 tokens, members would
// appear to sign in and then be refused by the routes.
//
// So this verifier accepts both, chosen by the token's own header:
//
//   ES256 (and RS256)  ->  verified against the project's published keys (JWKS)
//   HS256              ->  verified against the legacy shared secret
//
// That makes the rotation a non-event: deploy this first, rotate afterwards.
// Once session minting no longer uses the legacy secret and that secret is
// revoked, delete the HS256 branch and the SUPABASE_JWT_SECRET import with it.
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
const LEGACY_SECRET = process.env.SUPABASE_JWT_SECRET;

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

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return null; // not a JWT at all
  }

  try {
    if (alg === 'HS256') {
      if (!LEGACY_SECRET) return null;
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(LEGACY_SECRET),
      );
      return payload as unknown as SessionClaims;
    }

    // Anything asymmetric is checked against the keys the project publishes.
    const { payload } = await jwtVerify(token, publishedKeys());
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
