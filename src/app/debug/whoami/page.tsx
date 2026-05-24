'use client';

// Visual diagnostic page for wallet/identity mismatches.
//
// Open on any device while signed in:
//   https://app.spiritdao.org/debug/whoami
//
// Pulls the Supabase JWT from your active session and the CDP wallet
// from useCurrentUser, then calls /api/debug/whoami and displays all
// three identities side-by-side with a plain-English diagnosis.
//
// This page is meant to be removed once the vault multi-wallet
// identity rollout lands. See docs/spec-vault-multi-wallet-identity.md.

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';

interface WhoamiResponse {
  userId: string | null;
  jwtWallet: string | null;
  profileWallet: string | null;
  profileEmail: string | null;
  profileCreatedAt: string | null;
  cdpWallet: string | null;
  mismatches: {
    jwtVsProfile: boolean;
    jwtVsCdp: boolean;
    profileVsCdp: boolean;
  };
  vault: {
    hasPubkeyForJwtWallet: boolean;
    hasPubkeyForCdpWallet: boolean;
  };
  diagnosis: string;
}

export default function WhoamiPage() {
  const { currentUser } = useCurrentUser();
  const [result, setResult] = useState<WhoamiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // CDP wallet (raw, lowercase for comparison)
  const cdpWallet = currentUser?.evmAccounts?.[0]?.toLowerCase() ?? null;
  const cdpWalletOriginal = currentUser?.evmAccounts?.[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error(
            'No Supabase session. Sign in to the app first, then reload this page.',
          );
        }

        const url = cdpWallet
          ? `/api/debug/whoami?cdpWallet=${encodeURIComponent(cdpWallet)}`
          : '/api/debug/whoami';

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? `Request failed (${res.status})`);
        }
        if (!cancelled) setResult(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cdpWallet]);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Identity diagnostic</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        Shows the three identities the app sees for you. Used to debug
        vault &amp; permission issues across devices.
      </p>

      {loading && <p>Loading…</p>}

      {error && (
        <div
          style={{
            padding: 12,
            background: '#FBEAEA',
            color: '#7A2E2E',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <>
          <Section title="Diagnosis" highlight>
            <p style={{ margin: 0 }}>{result.diagnosis}</p>
          </Section>

          <Section title="Identities">
            <Row
              label="JWT wallet (canonical, in Supabase token)"
              value={result.jwtWallet}
            />
            <Row
              label="Profile wallet (user_profiles.wallet_address)"
              value={result.profileWallet}
            />
            <Row
              label="CDP wallet (currentUser.evmAccounts[0])"
              value={result.cdpWallet}
            />
            <Row
              label="CDP wallet (original case)"
              value={cdpWalletOriginal}
              subtle
            />
          </Section>

          <Section title="Mismatches">
            <Row
              label="JWT ↔ Profile"
              value={result.mismatches.jwtVsProfile ? 'MISMATCH' : 'match'}
              bad={result.mismatches.jwtVsProfile}
            />
            <Row
              label="JWT ↔ CDP"
              value={result.mismatches.jwtVsCdp ? 'MISMATCH' : 'match'}
              bad={result.mismatches.jwtVsCdp}
            />
            <Row
              label="Profile ↔ CDP"
              value={result.mismatches.profileVsCdp ? 'MISMATCH' : 'match'}
              bad={result.mismatches.profileVsCdp}
            />
          </Section>

          <Section title="Vault state">
            <Row
              label="Has vault pubkey published for JWT wallet"
              value={result.vault.hasPubkeyForJwtWallet ? 'yes' : 'no'}
            />
            <Row
              label="Has vault pubkey published for CDP wallet"
              value={result.vault.hasPubkeyForCdpWallet ? 'yes' : 'no'}
            />
          </Section>

          <Section title="Account">
            <Row label="User ID" value={result.userId} subtle />
            <Row label="Profile email" value={result.profileEmail} subtle />
            <Row
              label="Profile created"
              value={result.profileCreatedAt}
              subtle
            />
          </Section>

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
              Raw response JSON
            </summary>
            <pre
              style={{
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 6,
                overflow: 'auto',
                fontSize: 12,
                marginTop: 8,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  highlight = false,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 20,
        padding: highlight ? 12 : 0,
        background: highlight ? '#E8F1EE' : 'transparent',
        borderRadius: highlight ? 6 : 0,
      }}
    >
      <h2 style={{ fontSize: 15, marginBottom: 8, color: '#1F453A' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bad = false,
  subtle = false,
}: {
  label: string;
  value: string | null;
  bad?: boolean;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid #eee',
        fontSize: subtle ? 12 : 14,
        color: subtle ? '#777' : '#222',
      }}
    >
      <span>{label}</span>
      <code
        style={{
          fontSize: subtle ? 11 : 12,
          color: bad ? '#7A2E2E' : subtle ? '#777' : '#1F1F1F',
          fontWeight: bad ? 600 : 400,
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value ?? '(none)'}
      </code>
    </div>
  );
}
