'use client';

// LinkNewDeviceModal
//
// Renders when AuthContext.linkingRequired is non-null — i.e. when
// /api/auth/onchainkit returned requiresLinking: true. The user is
// signed in to Coinbase (CDP) but their CDP wallet on this device
// isn't linked to their SpiritDAO account yet.
//
// Flow:
//   1. User is shown an explanation + 6-char code input.
//   2. They go to a device that's already linked (e.g. their desktop)
//      and use the /debug/whoami "Issue link code" button (until the
//      proper Settings UI ships in Phase 4 full).
//   3. They enter the code here; we POST to /api/auth/link-confirm
//      with the new device's CDP wallet; the server links it and
//      returns a Supabase JWT.
//   4. We apply the JWT to supabase.auth and clear linkingRequired.
//
// See docs/spec-platform-identity-multi-wallet.md.

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { cdpFetch } from '@/features/identity/lib/cdpSession';
import { supabase } from '@/utils/supabaseClient';
import { useAuthContext } from './AuthProvider';

export function LinkNewDeviceModal() {
  const { linkingRequired, clearLinkingRequired } = useAuthContext();
  const { currentUser } = useCurrentUser();
  const cdpWallet = currentUser?.evmAccounts?.[0]?.toLowerCase() ?? null;

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Reset when modal opens/closes for a new linking event
    if (linkingRequired) {
      setCode('');
      setError(null);
      setSuccess(false);
    }
  }, [linkingRequired]);

  const handleSubmit = useCallback(async () => {
    if (!cdpWallet) {
      setError('Your wallet wasn\'t detected on this device.');
      return;
    }
    if (code.length !== 6) {
      setError('Enter the 6-character code from your other device.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // cdpFetch attaches the Coinbase access token so the server can prove
      // the wallet being linked belongs to this device's signed-in user.
      const res = await cdpFetch('/api/auth/link-confirm', {
        code: code.trim().toUpperCase(),
        newWallet: cdpWallet,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Link failed (${res.status})`);
      }

      // Apply the returned JWT so subsequent requests authenticate as
      // the linked user. This unblocks the original sign-in attempt.
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: json.supabaseToken,
        refresh_token: json.supabaseRefreshToken,
      });
      if (sessErr) {
        throw new Error(`Linked but session setup failed: ${sessErr.message}`);
      }

      setSuccess(true);

      // Brief delay so the user sees the success state, then clear.
      setTimeout(() => {
        clearLinkingRequired();
        // Soft reload so all hooks pick up the fresh session.
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 1200);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to link device');
    } finally {
      setBusy(false);
    }
  }, [code, cdpWallet, clearLinkingRequired]);

  if (!linkingRequired) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#FFF',
          borderRadius: 12,
          maxWidth: 440,
          width: '100%',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#1F453A',
            marginTop: 0,
            marginBottom: 8,
          }}
        >
          Link this device to your account
        </h2>

        <p style={{ fontSize: 14, color: '#5F5A54', marginBottom: 16 }}>
          We recognized your account from your sign-in, but this device
          hasn't been linked yet. Get a one-time code from a device
          you're already signed in on, then enter it below.
        </p>

        {success ? (
          <div
            style={{
              padding: 12,
              background: '#E8F1EE',
              color: '#1F453A',
              borderRadius: 8,
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            Device linked. Reloading…
          </div>
        ) : (
          <>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: '#5F5A54',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              6-character code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().slice(0, 6))
              }
              placeholder="ABC123"
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              style={{
                width: '100%',
                padding: 12,
                fontSize: 22,
                fontFamily: 'monospace',
                letterSpacing: 6,
                textAlign: 'center',
                border: '2px solid #ccc',
                borderRadius: 8,
                marginBottom: 12,
                textTransform: 'uppercase',
                boxSizing: 'border-box',
              }}
              disabled={busy}
            />

            {error && (
              <p
                style={{
                  fontSize: 13,
                  color: '#7A2E2E',
                  background: '#FBEAEA',
                  padding: 8,
                  borderRadius: 6,
                  marginTop: 0,
                  marginBottom: 12,
                }}
              >
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => clearLinkingRequired()}
                disabled={busy}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: '#5F5A54',
                }}
              >
                Not now
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy || code.length !== 6}
                style={{
                  padding: '10px 16px',
                  background: '#1F453A',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 8,
                  cursor:
                    busy || code.length !== 6 ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: busy || code.length !== 6 ? 0.5 : 1,
                }}
              >
                {busy ? 'Linking…' : 'Link this device'}
              </button>
            </div>

            <details
              style={{
                marginTop: 16,
                fontSize: 12,
                color: '#9B948D',
              }}
            >
              <summary style={{ cursor: 'pointer' }}>
                How do I get a code?
              </summary>
              <p style={{ marginTop: 8, lineHeight: 1.5 }}>
                On a device you're already signed in on (like your
                desktop), open{' '}
                <code>https://app.spiritdao.org/debug/whoami</code> and
                use the "Issue link code" button. You'll get a 6-character
                code that's valid for 10 minutes. Type that code into the
                box above.
              </p>
              <p style={{ marginTop: 8, fontSize: 11 }}>
                <strong>Why?</strong> Coinbase creates a new wallet on
                each device. Linking lets your account recognize all of
                them as you.{' '}
                {linkingRequired.unrecognizedWallet && (
                  <>
                    <br />
                    Wallet on this device:{' '}
                    <code style={{ fontSize: 10 }}>
                      {linkingRequired.unrecognizedWallet}
                    </code>
                  </>
                )}
              </p>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
