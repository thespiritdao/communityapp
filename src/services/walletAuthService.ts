// walletAuthService — server-side helpers for authorizing requests
// against the multi-wallet identity layer (user_wallets).
//
// Replaces the pre-Phase-1 pattern of "JWT wallet must equal target
// wallet" with "any of the caller's linked wallets is acceptable."
//
// Two common patterns:
//
//   const auth = await getAuthContext(req);
//   if (!auth) return 401;
//   // auth.userId, auth.canonicalWallet, auth.linkedWallets, auth.isLinked()
//
//   const result = await authorizeOwnedWallet(req, targetWallet);
//   if (!result.ok) return result.response;
//   // safe to act on behalf of targetWallet; it's one of the caller's
//
// See docs/spec-platform-identity-multi-wallet.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getUserWallets, type UserWallet } from './userWalletsService';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export interface AuthContext {
  userId: string;
  /** Wallet embedded in the JWT (canonical). */
  jwtWallet: string;
  /** Convenience accessor for canonical wallet (same as jwtWallet today). */
  canonicalWallet: string;
  /** All wallets linked to this user, including canonical. */
  linkedWallets: UserWallet[];
  /** Test whether an address is one of this user's linked wallets. */
  isLinked: (address: string) => boolean;
}

/**
 * Decode + verify the Supabase JWT from the request, then hydrate the
 * caller's linked-wallet set. Returns null on any auth failure (no
 * header, bad signature, expired, missing claims).
 *
 * Routes should typically call this once at the top, then use the
 * returned context for all checks.
 */
export async function getAuthContext(
  req: NextRequest,
): Promise<AuthContext | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  let payload: any;
  try {
    payload = (await verifySessionTokenOrThrow(token));
  } catch {
    return null;
  }

  const userId = payload?.sub as string | undefined;
  const jwtWalletRaw =
    payload?.wallet_address ?? payload?.user_metadata?.wallet_address;
  const jwtWallet =
    typeof jwtWalletRaw === 'string' ? jwtWalletRaw.toLowerCase() : null;

  if (!userId || !jwtWallet) return null;

  const linkedWallets = await getUserWallets(userId);
  const linkedSet = new Set(linkedWallets.map((w) => w.walletAddress));

  // Belt and suspenders: ensure the JWT wallet itself is in the linked
  // set, even if the user_wallets row was somehow missed. Backfill on
  // the fly so authorize* calls don't refuse the canonical wallet for
  // a legacy user that slipped through migration.
  if (!linkedSet.has(jwtWallet)) {
    linkedSet.add(jwtWallet);
  }

  return {
    userId,
    jwtWallet,
    canonicalWallet: jwtWallet,
    linkedWallets,
    isLinked: (address: string) =>
      linkedSet.has(address.toLowerCase()),
  };
}

/**
 * Check that a target wallet (e.g. the resource owner, the on-chain
 * actor) is one of the authenticated caller's linked wallets.
 *
 * Returns either { ok: true, ctx } or { ok: false, response } so the
 * caller can `if (!result.ok) return result.response`.
 */
export async function authorizeOwnedWallet(
  req: NextRequest,
  targetWallet: string,
): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!ctx.isLinked(targetWallet)) {
    // getUserWallets caches per server instance, so a wallet linked moments ago
    // by a different instance can still look unlinked here. Confirm against the
    // database before refusing — a stale cache must not deny a real wallet.
    const fresh = await getUserWallets(ctx.userId, { fresh: true });
    const target = targetWallet.toLowerCase();
    const linkedNow =
      target === ctx.jwtWallet ||
      fresh.some((w) => w.walletAddress === target);

    if (!linkedNow) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'forbidden',
            detail:
              'This wallet is not recognised as one of yours. Sign out and sign back in, then try again.',
          },
          { status: 403 },
        ),
      };
    }
    // Rebuild isLinked over the fresh set; the original closed over the stale one.
    const freshSet = new Set(fresh.map((w) => w.walletAddress));
    freshSet.add(ctx.jwtWallet);
    return {
      ok: true,
      ctx: {
        ...ctx,
        linkedWallets: fresh,
        isLinked: (address: string) => freshSet.has(address.toLowerCase()),
      },
    };
  }
  return { ok: true, ctx };
}

/**
 * Get the lowercased caller wallet (legacy compatibility). Equivalent
 * to the pattern many routes already use, but goes through the new
 * helper so the path is unified. Most new code should prefer
 * getAuthContext().
 */
export async function getCallerWallet(
  req: NextRequest,
): Promise<string | null> {
  const ctx = await getAuthContext(req);
  return ctx?.jwtWallet ?? null;
}
