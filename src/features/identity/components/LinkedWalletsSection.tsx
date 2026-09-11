'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  connect,
  disconnect,
  getAccount,
  getConnectors,
  signMessage,
} from '@wagmi/core';
import { supabase } from '@/lib/supabase';
import { externalWalletConfig } from '@/features/identity/lib/externalWalletConfig';

interface LinkedWallet {
  walletAddress: string;
  isCanonical: boolean;
  walletType: 'device' | 'external';
  nickname: string | null;
}

interface LinkedWalletsSectionProps {
  walletAddress: string;
}

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8FA09A',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: '1rem',
  marginBottom: '0.5rem',
};

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function LinkedWalletsSection({
  walletAddress,
}: LinkedWalletsSectionProps) {
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  // Wallets that announced themselves over EIP-6963. Each carries its own
  // provider, so we never have to touch the contested window.ethereum.
  const [detected, setDetected] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Please sign in to manage linked wallets.');
        setWallets([]);
        return;
      }
      const res = await fetch('/api/auth/linked-wallets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load linked wallets.');
      }
      const body = await res.json();
      setWallets(Array.isArray(body.wallets) ? body.wallets : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load linked wallets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  // Wallet announcements arrive asynchronously after load, so re-read the
  // connector list a few times rather than once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => {
      const announced = getConnectors(externalWalletConfig)
        .filter((c) => c.id !== 'injected')
        .map((c) => ({ id: c.id, name: c.name }));
      setDetected((prev) =>
        prev.length === announced.length &&
        prev.every((p, i) => p.id === announced[i].id)
          ? prev
          : announced,
      );
    };
    read();
    // Nudge any wallet that hasn't announced yet, then re-read.
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const timers = [250, 750, 2000].map((ms) => setTimeout(read, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleLink = useCallback(async (connectorId?: string) => {
    setError(null);
    setSuccess(null);

    // Which wallets actually announced themselves (EIP-6963)? We deliberately
    // do NOT test for window.ethereum: Brave injects that object even when no
    // wallet has been set up, so its presence proves nothing and connecting
    // through it just launches Brave's wallet onboarding.
    const announced = getConnectors(externalWalletConfig).filter(
      (c) => c.id !== 'injected',
    );
    if (announced.length === 0) {
      setError(
        'No wallet extension detected. Install MetaMask (or set up another browser wallet), then reload this page.',
      );
      return;
    }

    setLinking(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Please sign in to link a wallet.');
      }

      // a. Connect the external wallet using the ISOLATED config only.
      //
      // Connect to the wallet the user picked (or the only one announced).
      // Using the announced provider — never the shared window.ethereum —
      // avoids the Proxy invariant error that two extensions fighting over
      // that global produce ("'removeListener' is a read-only and
      // non-configurable data property on the proxy target...").
      const chosen =
        announced.find((c) => c.id === connectorId) ??
        announced.find((c) => c.id === 'io.metamask') ??
        announced[0];

      const connection = await connect(externalWalletConfig, {
        connector: chosen,
      });
      const externalAddress =
        connection.accounts[0] ??
        getAccount(externalWalletConfig).address;
      if (!externalAddress) {
        throw new Error('No account returned by the browser wallet.');
      }

      // b. Ask the backend for a nonce + the exact message to sign.
      const nonceRes = await fetch('/api/auth/link-external/nonce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address: externalAddress }),
      });
      if (!nonceRes.ok) {
        const body = await nonceRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not start the link (nonce).');
      }
      const { message, nonce } = await nonceRes.json();

      // c. Sign the message with the external wallet (isolated config).
      const signature = await signMessage(externalWalletConfig, { message });

      // d. Confirm the signature server-side to complete the link.
      const confirmRes = await fetch('/api/auth/link-external/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address: externalAddress,
          signature,
          nonce,
        }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not confirm the wallet link.');
      }

      // e. Refresh + success state.
      setSuccess(`Linked ${truncateAddress(externalAddress)}.`);
      await fetchWallets();
    } catch (e: any) {
      // wagmi/user-rejection surfaces as shortMessage on some errors.
      setError(e?.shortMessage || e?.message || 'Could not link the wallet.');
    } finally {
      // Always disconnect the external wallet from the isolated config so it
      // does not linger between attempts.
      try {
        await disconnect(externalWalletConfig);
      } catch {
        /* ignore cleanup failures */
      }
      setLinking(false);
    }
  }, [fetchWallets]);

  const handleRemove = useCallback(
    async (address: string) => {
      setError(null);
      setSuccess(null);
      setRemoving(address);
      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error('Please sign in to remove a wallet.');
        }
        const res = await fetch('/api/auth/linked-wallets', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ walletAddress: address }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Could not remove the wallet.');
        }
        await fetchWallets();
      } catch (e: any) {
        setError(e?.message || 'Could not remove the wallet.');
      } finally {
        setRemoving(null);
      }
    },
    [fetchWallets],
  );

  return (
    <div style={{ marginTop: '20px', marginBottom: '8px' }}>
      <h3 style={headerStyle}>Linked Wallets</h3>

      <div className="token-gallery-modal">
        <p
          style={{
            fontSize: '0.8rem',
            color: '#6B7A74',
            lineHeight: 1.5,
            marginBottom: '0.75rem',
          }}
        >
          Link a wallet you hold elsewhere (like MetaMask) to have its tokens
          counted for community governance. You only sign a message to prove
          it&apos;s yours. We never touch, move, or spend anything in it.
        </p>

        {loading ? (
          <p style={{ fontSize: '0.85rem', color: '#6B7A74' }}>
            Loading wallets...
          </p>
        ) : wallets.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#6B7A74' }}>
            No wallets linked yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {wallets.map((w) => (
              <li
                key={w.walletAddress}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid #EAEEEC',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      color: '#2F5D50',
                    }}
                  >
                    {truncateAddress(w.walletAddress)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      color: '#8FA09A',
                      background: '#F2F5F3',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {w.walletType === 'external' ? 'External' : 'This device'}
                  </span>
                </div>
                {!w.isCanonical && (
                  <button
                    type="button"
                    onClick={() => handleRemove(w.walletAddress)}
                    disabled={removing === w.walletAddress}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#B0453C',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor:
                        removing === w.walletAddress ? 'default' : 'pointer',
                      opacity: removing === w.walletAddress ? 0.6 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {removing === w.walletAddress ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p
            style={{
              fontSize: '0.8rem',
              color: '#B0453C',
              marginTop: '0.75rem',
            }}
          >
            {error}
          </p>
        )}
        {success && (
          <p
            style={{
              fontSize: '0.8rem',
              color: '#2F5D50',
              marginTop: '0.75rem',
            }}
          >
            {success}
          </p>
        )}

        <div style={{ marginTop: '0.75rem' }}>
          {detected.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#6B7A74', lineHeight: 1.5, margin: 0 }}>
              No wallet extension detected. Install MetaMask, or set up your
              browser&apos;s built-in wallet, then reload this page.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {detected.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleLink(w.id)}
                  disabled={linking}
                  style={{
                    background: '#C6933F',
                    color: '#FFFFFF',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '14px',
                    letterSpacing: '0.02em',
                    cursor: linking ? 'default' : 'pointer',
                    opacity: linking ? 0.7 : 1,
                  }}
                >
                  {linking
                    ? 'Linking...'
                    : detected.length === 1
                      ? `Link ${w.name}`
                      : w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
