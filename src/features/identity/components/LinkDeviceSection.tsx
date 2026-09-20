'use client';

// src/features/identity/components/LinkDeviceSection.tsx
//
// Issue a one-time code so a second device can join this account.
//
// Coinbase creates a separate wallet on every device, so a member signing in
// somewhere new arrives as an unrecognised wallet and is shown
// LinkNewDeviceModal, which asks for a six-character code. This is where the
// code comes from. Before this existed the modal sent people to /debug/whoami.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8FA09A',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: '1rem',
  marginBottom: '0.5rem',
};

/** Whole minutes and seconds left, or null once it has lapsed. */
function remaining(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function LinkDeviceSection() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Tick the countdown, and clear the code once it can no longer be used.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const r = remaining(expiresAt);
      setLeft(r);
      if (!r) {
        setCode(null);
        setExpiresAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const issue = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Please sign in again to issue a code.');

      const res = await fetch('/api/auth/link-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not issue a code.');

      setCode(body.code);
      setExpiresAt(body.expiresAt);
    } catch (e: any) {
      setError(e?.message || 'Could not issue a code.');
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is on screen to type either way.
    }
  }, [code]);

  return (
    <div style={{ marginTop: '20px', marginBottom: '8px' }}>
      <h3 style={headerStyle}>Linked Devices</h3>

      <div className="token-gallery-modal">
        <p
          style={{
            fontSize: '0.8rem',
            color: '#6B7A74',
            lineHeight: 1.5,
            marginBottom: '0.75rem',
          }}
        >
          Signing in on a phone or a second computer? Your sign-in provider
          creates a separate wallet on each device, so the new one has to be
          introduced to your account. Issue a code here, then type it into the
          prompt on the new device. It lasts ten minutes and can be used once.
        </p>

        {code ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
              padding: '0.75rem',
              background: '#F2F5F3',
              borderRadius: '8px',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '1.6rem',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#1F453A',
              }}
            >
              {code}
            </span>
            <button
              type="button"
              onClick={copy}
              style={{
                background: '#FFFFFF',
                color: '#1F453A',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D7DDE4',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            {left && (
              <span style={{ fontSize: '0.8rem', color: '#6B7A74' }}>
                Expires in {left}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={issue}
            disabled={busy}
            style={{
              background: '#C6933F',
              color: '#FFFFFF',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.02em',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Issuing…' : 'Get a code for another device'}
          </button>
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
      </div>
    </div>
  );
}

export default LinkDeviceSection;
