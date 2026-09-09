// src/lib/cdpAuth.ts
// Server-side proof that the caller controls the CDP embedded wallet they
// claim. Closes the gap where /api/auth/onchainkit (and the onboarding
// routes) accepted any wallet address in the request body and issued a
// Supabase session for it.
//
// How it works:
//   1. The browser, already signed in to Coinbase (email / Google / Apple),
//      calls `getAccessToken()` from @coinbase/cdp-core and sends the token in
//      the `x-cdp-access-token` header (see
//      src/features/identity/lib/cdpSession.ts).
//   2. This helper validates the token with CDP's server SDK
//      (`cdp.endUser.validateAccessToken`) and compares the claimed address
//      against the end user's EVM accounts (EOA + smart accounts).
//   3. Only then does the calling route proceed.
//
// FAILS CLOSED: a missing token, an invalid token, an address that is not
// one of the user's accounts, or missing server credentials all deny.
//
// Credentials: CDP_API_KEY_ID + CDP_API_KEY_SECRET (a CDP "Secret API Key"
// from portal.cdp.coinbase.com → API keys). If those are absent we fall back
// to the legacy key pair the mint routes already use (CDP_API_KEY +
// EXECUTIVE_MINTING_PRIVATE_KEY); the log line says which pair is active.

import { createPrivateKey } from 'node:crypto';
import { CdpClient } from '@coinbase/cdp-sdk';

export const CDP_ACCESS_TOKEN_HEADER = 'x-cdp-access-token';

type Verified = {
  ok: true;
  /** CDP end-user id (stable per Coinbase account). */
  userId: string;
  /** Lowercased EVM addresses (EOAs + smart accounts) owned by the user. */
  accounts: string[];
};
type Denied = { ok: false; status: number; error: string };
export type CdpVerification = Verified | Denied;

let client: CdpClient | null = null;
let credentialSource: 'CDP_API_KEY_ID' | 'legacy' | null = null;

function getClient(): CdpClient | null {
  if (client) return client;

  let apiKeyId = process.env.CDP_API_KEY_ID;
  let apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (apiKeyId && apiKeySecret) {
    credentialSource = 'CDP_API_KEY_ID';
  } else if (process.env.CDP_API_KEY && process.env.EXECUTIVE_MINTING_PRIVATE_KEY) {
    apiKeyId = process.env.CDP_API_KEY;
    apiKeySecret = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;
    credentialSource = 'legacy';
  } else {
    console.error(
      '❌ cdpAuth: no CDP server credentials. Set CDP_API_KEY_ID + CDP_API_KEY_SECRET. Wallet verification is FAILING CLOSED.',
    );
    return null;
  }

  if (apiKeySecret.includes('\\n')) apiKeySecret = apiKeySecret.replace(/\\n/g, '\n');

  // The legacy CDP key is a SEC1 "EC PRIVATE KEY" PEM; @coinbase/cdp-sdk only
  // accepts PKCS#8 PEM (or a base64 Ed25519 key). Convert in memory.
  if (apiKeySecret.startsWith('-----BEGIN EC PRIVATE KEY-----')) {
    try {
      apiKeySecret = createPrivateKey({ key: apiKeySecret, format: 'pem' })
        .export({ type: 'pkcs8', format: 'pem' })
        .toString();
    } catch (err) {
      console.error('❌ cdpAuth: could not convert legacy EC key to PKCS#8:', err);
      return null;
    }
  }

  client = new CdpClient({ apiKeyId, apiKeySecret });
  console.log(`🔐 cdpAuth: CDP client initialised (credentials: ${credentialSource})`);
  return client;
}

/** Pull the CDP access token from the header (preferred) or the JSON body. */
export function extractCdpAccessToken(
  req: Request,
  body?: Record<string, unknown> | null,
): string | null {
  const fromHeader = req.headers.get(CDP_ACCESS_TOKEN_HEADER);
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  const fromBody = body && typeof body.cdpAccessToken === 'string' ? body.cdpAccessToken : null;
  return fromBody && fromBody.trim() ? fromBody.trim() : null;
}

function collectAccounts(endUser: unknown): string[] {
  const u = (endUser ?? {}) as Record<string, unknown>;
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) out.add(v.toLowerCase());
  };
  for (const key of ['evmAccounts', 'evmSmartAccounts'] as const) {
    const arr = u[key];
    if (Array.isArray(arr)) arr.forEach(push);
  }
  for (const key of ['evmAccountObjects', 'evmSmartAccountObjects'] as const) {
    const arr = u[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === 'object') push((item as Record<string, unknown>).address);
      }
    }
  }
  return [...out];
}

/**
 * Validate a CDP end-user access token and return the user's EVM accounts.
 * Does not check any particular address — see verifyCdpWalletOwnership.
 */
export async function validateCdpAccessToken(accessToken: string): Promise<CdpVerification> {
  const cdp = getClient();
  if (!cdp) {
    return { ok: false, status: 503, error: 'Wallet verification is not configured on the server.' };
  }

  try {
    const endUser = await cdp.endUser.validateAccessToken({ accessToken });
    const accounts = collectAccounts(endUser);
    const userId = String((endUser as unknown as { userId?: string }).userId ?? '');
    if (!userId) {
      return { ok: false, status: 401, error: 'Coinbase session could not be verified.' };
    }
    return { ok: true, userId, accounts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish "our server credentials are wrong" from "the user's token is
    // bad" so a misconfiguration surfaces as 503 in logs instead of looking
    // like every member has an expired session.
    const serverSide =
      /invalid key format|api key|apiKey|unauthorized api|forbidden api|ENOTFOUND|ECONNREFUSED/i.test(msg) ||
      /invalid key format/i.test(String((err as { errorMessage?: string })?.errorMessage ?? ''));
    if (serverSide) {
      console.error(`❌ cdpAuth: CDP server credentials rejected (${credentialSource}): ${msg}`);
      return { ok: false, status: 503, error: 'Wallet verification is misconfigured on the server.' };
    }
    console.warn(`🔐 cdpAuth: access token rejected: ${msg}`);
    return { ok: false, status: 401, error: 'Coinbase session is invalid or expired. Please sign in again.' };
  }
}

/**
 * Prove that the caller's Coinbase session owns `address`.
 *
 * Usage in a route:
 *   const body = await req.json();
 *   const verified = await verifyCdpWalletOwnership(req, body.address, body);
 *   if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });
 */
export async function verifyCdpWalletOwnership(
  req: Request,
  address: string | null | undefined,
  body?: Record<string, unknown> | null,
): Promise<CdpVerification> {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { ok: false, status: 400, error: 'A valid wallet address is required.' };
  }

  const token = extractCdpAccessToken(req, body);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Missing Coinbase session token. Please sign in again.',
    };
  }

  const result = await validateCdpAccessToken(token);
  if (!result.ok) return result;

  if (!result.accounts.includes(address.toLowerCase())) {
    console.warn(
      `🔐 cdpAuth: address ${address.toLowerCase()} is not owned by CDP user ${result.userId} (owns ${result.accounts.length} account(s))`,
    );
    return {
      ok: false,
      status: 403,
      error: 'This wallet does not belong to the signed-in Coinbase account.',
    };
  }

  return result;
}
