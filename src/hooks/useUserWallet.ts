'use client';

// useUserWallet / useSigningWallet
//
// Two hooks, two purposes. Read these comments before using either.
//
// ─── useUserWallet ─────────────────────────────────────────────────
// Returns the wallet that represents "this user" in our system.
// Use this for ANY identity-related question:
//   - "Does this user have permission X?"
//   - "Is this user a member of pod Y?"
//   - "Show me this user's pods, hats, balances, profile."
//   - "Filter this list to things this user can see."
//
// Returns the canonical wallet from the Supabase JWT, which is the
// wallet that holds the user's hats, owns their pod memberships, and
// is recorded in user_profiles.wallet_address.
//
// Falls back to the CDP wallet only if no Supabase session exists yet
// (i.e. mid-signup, before the JWT has been issued). In that one
// case, the CDP wallet *is* the only identity we have.
//
// ─── useSigningWallet ──────────────────────────────────────────────
// Returns the wallet that can sign transactions and messages on this
// device. Use this ONLY when you actually need a signature:
//   - Passing evmAccount to useSignEvmMessage
//   - Passing evmAccount to useSendUserOperation
//   - Anything that fires an on-chain action FROM this device
//
// CDP creates per-device wallets, so on a non-canonical device the
// signing wallet ≠ the user wallet. That's fine — the signing wallet
// is just an instrument; the user identity is established by the
// linked-wallet table (see docs/spec-platform-identity-multi-wallet.md).
//
// ─── Why two hooks ────────────────────────────────────────────────
// This split was created 2026-05-24 after we shipped several rounds
// of fixes for "feature works on canonical device, breaks on any
// other device." The pattern was always the same: client code read
// useEvmAddress() for an identity question, got the per-device CDP
// wallet, and queried the DB / chain for the wrong address.
//
// Reading useUserWallet() makes the intent ("I want identity") explicit.
// Reading useSigningWallet() makes the intent ("I want a signer")
// explicit. The two should never be confused.
//
// Contributor rule + decision table: docs/authentication-and-session-model.md
// ("Which wallet hook to use"). Server-side equivalent: getAuthContext /
// getUserWallets in src/services/walletAuthService.ts.

import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useAuthContext } from '@/features/identity/components/AuthProvider';

/**
 * The wallet that represents this user in our system. Use for all
 * identity-related reads (permissions, memberships, ownership,
 * filters). NOT for signing — use useSigningWallet for that.
 */
export function useUserWallet(): string | null {
  const { session } = useAuthContext();
  const { evmAddress: cdpAddress } = useEvmAddress();

  const canonical = (
    session?.user?.user_metadata?.wallet_address as string | undefined
  )?.toLowerCase();

  if (canonical) return canonical;
  // Only reached during signup, before the JWT exists. In that
  // window the CDP wallet IS the user's identity (it becomes the
  // canonical wallet immediately after).
  return cdpAddress ? cdpAddress.toLowerCase() : null;
}

/**
 * The wallet that can sign transactions on this device. Use ONLY for
 * signing operations (sign-message, send-user-operation). NOT for
 * identity reads — use useUserWallet for that.
 *
 * Returns the address in its original (checksummed) case because CDP's
 * signing methods do exact-match lookup against the account list.
 */
export function useSigningWallet(): {
  /** Lowercased — for comparisons. */
  address: string | null;
  /** Checksummed — for passing to CDP signing methods. */
  addressOriginal: string | null;
} {
  const { evmAddress: cdpAddress } = useEvmAddress();
  return {
    address: cdpAddress ? cdpAddress.toLowerCase() : null,
    addressOriginal: cdpAddress ?? null,
  };
}
