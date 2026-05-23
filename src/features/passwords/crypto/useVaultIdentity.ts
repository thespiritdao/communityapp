'use client';

// React hook for managing the vault identity keypair lifecycle.
//
// On mount it tries to recover the user's identity from sessionStorage.
// If absent, it prompts the user to sign the canonical message via CDP,
// derives the keypair, caches it, and publishes the pubkey to the server.
//
// The hook returns:
//   - identity (or null while loading / not yet bootstrapped)
//   - publishedPubkey (the latest pubkey known to the server, if any)
//   - status: idle | loading | ready | needs-bootstrap | error
//   - bootstrap(): kicks off the sign + derive + publish flow
//   - error: human-readable error message if any step failed
//
// SECURITY NOTES:
//   - sessionStorage is cleared when the tab closes — the secret key
//     does NOT persist across browser sessions; each new session prompts
//     re-signing. This is intentional (limits blast radius if a session
//     is hijacked).
//   - The secret key is base64url text in sessionStorage; an attacker
//     with same-origin code execution can read it (XSS = total compromise).
//     Same threat model as any in-browser credential vault.
//   - We never POST the secret or the raw signature to the server.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentUser, useSignEvmMessage } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';
import {
  buildCanonicalIdentityMessage,
  deriveIdentityKeypair,
  type IdentityKeypair,
} from './vaultCrypto';

const SESSION_KEY_PREFIX = 'spiritdao_vault_identity_v1:';

export type VaultIdentityStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'needs-bootstrap'
  | 'error';

export interface UseVaultIdentityResult {
  identity: IdentityKeypair | null;
  /** The latest pubkey the server has on file for this user, if any. */
  publishedPubkey: string | null;
  status: VaultIdentityStatus;
  error: string | null;
  /** Manually trigger the bootstrap flow (sign + derive + publish). */
  bootstrap: () => Promise<void>;
  /** Clear the cached identity for this session (e.g. on logout). */
  clear: () => void;
}

function sessionKey(eoa: string): string {
  return `${SESSION_KEY_PREFIX}${eoa.toLowerCase()}`;
}

function readCachedIdentity(eoa: string): IdentityKeypair | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(eoa));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.secretKey === 'string' &&
      typeof parsed?.publicKey === 'string'
    ) {
      return parsed as IdentityKeypair;
    }
    return null;
  } catch {
    return null;
  }
}

function cacheIdentity(eoa: string, identity: IdentityKeypair): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(sessionKey(eoa), JSON.stringify(identity));
}

function clearCachedIdentity(eoa: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(sessionKey(eoa));
}

export function useVaultIdentity(): UseVaultIdentityResult {
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();

  const eoaAddress = useMemo<string | null>(
    () => currentUser?.evmAccounts?.[0]?.toLowerCase() ?? null,
    [currentUser],
  );

  const [identity, setIdentity] = useState<IdentityKeypair | null>(null);
  const [publishedPubkey, setPublishedPubkey] = useState<string | null>(null);
  const [status, setStatus] = useState<VaultIdentityStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // 1) Hydrate from sessionStorage + server lookup whenever the EOA changes.
  useEffect(() => {
    let cancelled = false;
    if (!eoaAddress) {
      setIdentity(null);
      setPublishedPubkey(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setError(null);

    (async () => {
      // Load from sessionStorage.
      const cached = readCachedIdentity(eoaAddress);

      // Check what the server has on file (if anything).
      let serverPubkey: string | null = null;
      try {
        const res = await fetch(
          `/api/vault/keys?eoa=${encodeURIComponent(eoaAddress)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const body = await res.json();
          serverPubkey = body?.publicKey ?? null;
        }
      } catch (e) {
        // Network glitch — not fatal; user can still bootstrap.
        console.warn('vault: pubkey lookup failed', e);
      }

      if (cancelled) return;

      // If cache matches what the server has, we're ready.
      if (cached && serverPubkey && cached.publicKey === serverPubkey) {
        setIdentity(cached);
        setPublishedPubkey(serverPubkey);
        setStatus('ready');
        return;
      }

      // If cache exists but server has a DIFFERENT pubkey on file, the
      // server's record wins (could be an older session that signed a
      // different message). Drop the cache and require bootstrap.
      if (cached && serverPubkey && cached.publicKey !== serverPubkey) {
        clearCachedIdentity(eoaAddress);
        setIdentity(null);
        setPublishedPubkey(serverPubkey);
        setStatus('needs-bootstrap');
        return;
      }

      // Cache exists but server has no pubkey yet — we'll publish on the
      // next bootstrap call. Treat as needing bootstrap to publish.
      if (cached && !serverPubkey) {
        setIdentity(cached);
        setPublishedPubkey(null);
        setStatus('needs-bootstrap');
        return;
      }

      // No cache, server may or may not know us.
      setIdentity(null);
      setPublishedPubkey(serverPubkey);
      setStatus('needs-bootstrap');
    })();

    return () => {
      cancelled = true;
    };
  }, [eoaAddress]);

  // 2) Bootstrap = sign canonical message, derive keypair, publish pubkey.
  const bootstrap = useCallback(async () => {
    if (!eoaAddress) {
      setError('No EVM account available on the connected CDP user.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const cached = readCachedIdentity(eoaAddress);
      let kp: IdentityKeypair;
      if (cached) {
        kp = cached;
      } else {
        const message = buildCanonicalIdentityMessage(eoaAddress);
        const { signature } = await signEvmMessage({
          evmAccount: eoaAddress as `0x${string}`,
          message,
        });
        kp = deriveIdentityKeypair(signature);
        cacheIdentity(eoaAddress, kp);
      }

      // Publish pubkey to server (upsert). Requires Supabase JWT so the
      // server can confirm caller matches eoaAddress.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Not authenticated — reconnect your wallet');
      }

      const res = await fetch('/api/vault/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          eoaAddress,
          publicKey: kp.publicKey,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Publish failed (${res.status})`);
      }

      setIdentity(kp);
      setPublishedPubkey(kp.publicKey);
      setStatus('ready');
    } catch (e: any) {
      console.error('vault bootstrap failed', e);
      setError(e?.message || 'Bootstrap failed');
      setStatus('error');
    }
  }, [eoaAddress, signEvmMessage]);

  const clear = useCallback(() => {
    if (eoaAddress) clearCachedIdentity(eoaAddress);
    setIdentity(null);
    setStatus('needs-bootstrap');
  }, [eoaAddress]);

  return {
    identity,
    publishedPubkey,
    status,
    error,
    bootstrap,
    clear,
  };
}
