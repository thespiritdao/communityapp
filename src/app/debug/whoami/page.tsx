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
import { cdpFetch } from '@/features/identity/lib/cdpSession';
import { useHybridPodPermission } from '@/hooks/useHybridPodPermission';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { usePodPermission } from '@/hooks/usePodPermission';
import { useUserWallet } from '@/hooks/useUserWallet';
import { usePodEligibilityAgreements } from '@/features/pods/hooks/usePodEligibilityAgreements';

const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

interface ProbeResult {
  table: string;
  column: string;
  count: number;
  error?: string;
}

interface LinkedWallet {
  walletAddress: string;
  isCanonical: boolean;
  nickname: string | null;
  linkedAt: string;
}

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
  linkedWallets: LinkedWallet[];
  cdpWalletIsLinked: boolean;
  vault: {
    hasPubkeyForJwtWallet: boolean;
    hasPubkeyForCdpWallet: boolean;
  };
  probeAddress: string | null;
  probeResults: ProbeResult[] | null;
  diagnosis: string;
}

export default function WhoamiPage() {
  const { currentUser } = useCurrentUser();
  const [result, setResult] = useState<WhoamiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  // Linking flow state
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiresAt, setLinkCodeExpiresAt] = useState<string | null>(
    null,
  );
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [linkCodeBusy, setLinkCodeBusy] = useState(false);

  const [enterCode, setEnterCode] = useState('');
  const [enterCodeBusy, setEnterCodeBusy] = useState(false);
  const [enterCodeError, setEnterCodeError] = useState<string | null>(null);
  const [enterCodeSuccess, setEnterCodeSuccess] = useState<string | null>(null);

  // CDP wallet (raw, lowercase for comparison)
  const cdpWallet = currentUser?.evmAccounts?.[0]?.toLowerCase() ?? null;
  const cdpWalletOriginal = currentUser?.evmAccounts?.[0] ?? null;
  // Show all evmAccounts so we can detect when CDP exposes multiple
  const cdpAllAccounts = (currentUser?.evmAccounts ?? []) as string[];

  // Run the actual permission hook so we can see exactly what it
  // resolves on this device. Hardcoded to passwordsManage on the Exec
  // Pod for now — the case we're debugging.
  const passwordsManageCheck = useHybridPodPermission(
    EXEC_POD_ID,
    'passwordsManage',
  );
  const passwordsAccessCheck = useHybridPodPermission(
    EXEC_POD_ID,
    'passwordsAccess',
  );

  // Drill into the intermediate state used by useHybridPodPermission
  // so we can see which factor is returning false.
  const userWalletForHooks = useUserWallet();
  const hatPerms = useHatPermissions();
  const dbPermAccess = usePodPermission(EXEC_POD_ID, 'passwordsAccess');
  const dbPermManage = usePodPermission(EXEC_POD_ID, 'passwordsManage');
  const agreements = usePodEligibilityAgreements(EXEC_POD_ID);
  const execPodRole = hatPerms.userRoles?.find(
    (r) => r.podId === EXEC_POD_ID,
  );

  const callWhoami = async (probe?: string): Promise<void> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error(
        'No Supabase session. Sign in to the app first, then reload this page.',
      );
    }
    const params = new URLSearchParams();
    if (cdpWallet) params.set('cdpWallet', cdpWallet);
    if (probe) params.set('probe', probe);
    const url = `/api/debug/whoami${params.toString() ? `?${params}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error ?? `Request failed (${res.status})`);
    }
    setResult(json);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await callWhoami();
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdpWallet]);

  const probeCdpWallet = async () => {
    if (!cdpWallet) return;
    setProbing(true);
    setError(null);
    try {
      await callWhoami(cdpWallet);
    } catch (e: any) {
      setError(e?.message || 'Probe failed');
    } finally {
      setProbing(false);
    }
  };

  // ── Linking: issue a code on this (authenticated) device ────────
  const issueLinkCode = async () => {
    setLinkCodeBusy(true);
    setLinkCodeError(null);
    setLinkCode(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No Supabase session');
      const res = await fetch('/api/auth/link-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setLinkCode(json.code);
      setLinkCodeExpiresAt(json.expiresAt);
    } catch (e: any) {
      setLinkCodeError(e?.message || 'Failed to issue code');
    } finally {
      setLinkCodeBusy(false);
    }
  };

  // ── Linking: consume a code on this (new) device ────────────────
  const confirmLinkCode = async () => {
    if (!cdpWallet) {
      setEnterCodeError('No CDP wallet detected on this device.');
      return;
    }
    setEnterCodeBusy(true);
    setEnterCodeError(null);
    setEnterCodeSuccess(null);
    try {
      const res = await cdpFetch('/api/auth/link-confirm', {
        code: enterCode.trim().toUpperCase(),
        newWallet: cdpWallet,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      // Apply the new JWT to the active Supabase session so subsequent
      // requests (including the auto-rerun of /api/debug/whoami) see it.
      const { error: setErr } = await supabase.auth.setSession({
        access_token: json.supabaseToken,
        refresh_token: json.supabaseRefreshToken,
      });
      if (setErr) {
        throw new Error(`Linked but setSession failed: ${setErr.message}`);
      }

      setEnterCodeSuccess(
        `Linked ${json.linkedWallet.walletAddress} to user ${json.userId}. Session updated. Reloading diagnostic…`,
      );
      // Re-run the diagnostic so the new state is visible immediately
      setTimeout(() => {
        callWhoami().catch(() => {});
      }, 800);
    } catch (e: any) {
      setEnterCodeError(e?.message || 'Failed to confirm code');
    } finally {
      setEnterCodeBusy(false);
    }
  };

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

          <Section title="Linked wallets (user_wallets table)" highlight={!result.cdpWalletIsLinked && (result.linkedWallets?.length ?? 0) > 0}>
            <p style={{ fontSize: 13, color: '#5F5A54', marginBottom: 8 }}>
              CDP wallet on this device:{' '}
              <code>{result.cdpWallet ?? 'none'}</code> —{' '}
              <strong
                style={{
                  color: result.cdpWalletIsLinked ? '#3F7A5A' : '#7A2E2E',
                }}
              >
                {result.cdpWalletIsLinked ? 'LINKED ✓' : 'NOT LINKED'}
              </strong>
            </p>
            {(result.linkedWallets ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: '#9B948D' }}>
                No linked wallets found. Either the migration hasn't run,
                or this user_id has no rows in user_wallets.
              </p>
            ) : (
              <div>
                {result.linkedWallets.map((w) => (
                  <div
                    key={w.walletAddress}
                    style={{
                      padding: '6px 0',
                      borderBottom: '1px solid #eee',
                      fontSize: 12,
                    }}
                  >
                    <code style={{ color: '#1F1F1F' }}>
                      {w.walletAddress}
                    </code>
                    {w.isCanonical && (
                      <span
                        style={{
                          marginLeft: 8,
                          background: '#E8F1EE',
                          color: '#1F453A',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                        }}
                      >
                        CANONICAL
                      </span>
                    )}
                    {w.nickname && (
                      <span style={{ marginLeft: 8, color: '#5F5A54' }}>
                        ({w.nickname})
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: 8,
                        color: '#9B948D',
                        fontSize: 11,
                      }}
                    >
                      linked {new Date(w.linkedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="CDP wallets exposed on this device">
            <p style={{ fontSize: 12, color: '#5F5A54', marginBottom: 6 }}>
              CDP can expose more than one wallet per user. Index [0]
              is what most app code reads, but it's worth knowing the
              full list.
            </p>
            {cdpAllAccounts.length === 0 && (
              <p style={{ fontSize: 12, color: '#9B948D' }}>None</p>
            )}
            {cdpAllAccounts.map((a, i) => (
              <div
                key={a}
                style={{
                  padding: '4px 0',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#1F1F1F',
                }}
              >
                [{i}] {a}
              </div>
            ))}
          </Section>

          <Section title="Permission chain — intermediate state (Exec Pod)" highlight>
            <Row
              label="useUserWallet() returns"
              value={userWalletForHooks ?? '(none)'}
              bad={!userWalletForHooks}
            />
            <Row
              label="useHatPermissions.isLoading"
              value={hatPerms.isLoading ? 'yes' : 'no'}
            />
            <Row
              label="useHatPermissions.userRoles count"
              value={String(hatPerms.userRoles?.length ?? 0)}
              bad={(hatPerms.userRoles?.length ?? 0) === 0}
            />
            <Row
              label="useHatPermissions.error"
              value={hatPerms.error ?? 'none'}
              subtle={!hatPerms.error}
            />
            <Row
              label="Exec Pod role found"
              value={execPodRole ? 'yes' : 'NO'}
              bad={!execPodRole}
            />
            <Row
              label="Exec Pod role.name"
              value={execPodRole?.name ?? '(none)'}
              subtle={!execPodRole}
            />
            <Row
              label="Exec Pod role.hatId"
              value={execPodRole?.hatId ?? '(none)'}
              subtle={!execPodRole}
            />
            <Row
              label="Exec Pod role.permissions.passwordsAccess"
              value={
                execPodRole?.permissions?.passwordsAccess === true
                  ? 'true'
                  : execPodRole?.permissions?.passwordsAccess === false
                    ? 'false'
                    : '(undefined)'
              }
              bad={execPodRole?.permissions?.passwordsAccess !== true}
            />
            <Row
              label="Exec Pod role.permissions.passwordsManage"
              value={
                execPodRole?.permissions?.passwordsManage === true
                  ? 'true'
                  : execPodRole?.permissions?.passwordsManage === false
                    ? 'false'
                    : '(undefined)'
              }
              bad={execPodRole?.permissions?.passwordsManage !== true}
            />
            <Row
              label="usePodPermission(passwordsAccess) DB-only"
              value={dbPermAccess ? 'true' : 'false'}
              bad={!dbPermAccess}
            />
            <Row
              label="usePodPermission(passwordsManage) DB-only"
              value={dbPermManage ? 'true' : 'false'}
              bad={!dbPermManage}
            />
            <Row
              label="usePodEligibilityAgreements.loading"
              value={agreements.loading ? 'yes' : 'no'}
            />
            <Row
              label="usePodEligibilityAgreements.hasUnsignedAgreements"
              value={agreements.hasUnsignedAgreements ? 'YES (blocks)' : 'no'}
              bad={agreements.hasUnsignedAgreements}
            />
          </Section>

          <Section title="useHybridPodPermission resolution (Exec Pod)">
            <p style={{ fontSize: 12, color: '#5F5A54', marginBottom: 6 }}>
              This is exactly what gates the &quot;Add password&quot;
              button. If any line returns false, the manage UI hides.
            </p>
            <Row
              label="passwordsAccess (loading)"
              value={passwordsAccessCheck.isLoading ? 'yes' : 'no'}
            />
            <Row
              label="passwordsAccess (hasPermission)"
              value={passwordsAccessCheck.hasPermission ? 'YES ✓' : 'NO'}
              bad={!passwordsAccessCheck.hasPermission && !passwordsAccessCheck.isLoading}
            />
            <Row
              label="passwordsAccess (error)"
              value={passwordsAccessCheck.error ?? 'none'}
              subtle={!passwordsAccessCheck.error}
            />
            <Row
              label="passwordsManage (loading)"
              value={passwordsManageCheck.isLoading ? 'yes' : 'no'}
            />
            <Row
              label="passwordsManage (hasPermission)"
              value={passwordsManageCheck.hasPermission ? 'YES ✓' : 'NO'}
              bad={!passwordsManageCheck.hasPermission && !passwordsManageCheck.isLoading}
            />
            <Row
              label="passwordsManage (error)"
              value={passwordsManageCheck.error ?? 'none'}
              subtle={!passwordsManageCheck.error}
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

          <Section title="Probe the CDP wallet across the DB">
            <p style={{ fontSize: 13, color: '#5F5A54', marginBottom: 8 }}>
              Check whether <code>{result.cdpWallet}</code> has ever
              written anything to any wallet-bearing table. If every
              count is 0, this CDP wallet has never been used for any
              on-chain attribution in the app.
            </p>
            <button
              onClick={probeCdpWallet}
              disabled={probing || !result.cdpWallet}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: '#1F453A',
                color: '#fff',
                border: 'none',
                cursor: probing ? 'not-allowed' : 'pointer',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {probing ? 'Probing…' : 'Probe this CDP wallet'}
            </button>

            {result.probeResults && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: '#5F5A54', marginBottom: 6 }}>
                  Probing: <code>{result.probeAddress}</code>
                </p>
                {result.probeResults.map((p) => (
                  <div
                    key={`${p.table}-${p.column}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: '1px solid #eee',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: '#444' }}>
                      {p.table}.{p.column}
                    </span>
                    <code
                      style={{
                        color: p.error
                          ? '#9B948D'
                          : p.count > 0
                            ? '#7A2E2E'
                            : '#3F7A5A',
                        fontWeight: p.count > 0 ? 600 : 400,
                      }}
                    >
                      {p.error ? `(${p.error})` : p.count}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Link a new device — Issue a code (from this device)">
            <p style={{ fontSize: 13, color: '#5F5A54', marginBottom: 8 }}>
              Use this if THIS device is already authenticated and you
              want to link a NEW device (mobile / incognito) to the same
              user. Issue a code here, then enter it on the new device.
            </p>
            <button
              onClick={issueLinkCode}
              disabled={linkCodeBusy}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: '#1F453A',
                color: '#fff',
                border: 'none',
                cursor: linkCodeBusy ? 'not-allowed' : 'pointer',
                fontSize: 13,
              }}
            >
              {linkCodeBusy ? 'Issuing…' : 'Issue link code'}
            </button>
            {linkCodeError && (
              <p style={{ fontSize: 12, color: '#7A2E2E', marginTop: 8 }}>
                {linkCodeError}
              </p>
            )}
            {linkCode && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#F5EDD7',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: '#5F5A54',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Enter this code on the new device
                </p>
                <p
                  style={{
                    fontSize: 28,
                    fontFamily: 'monospace',
                    letterSpacing: 4,
                    fontWeight: 600,
                    color: '#1F453A',
                    margin: '4px 0',
                  }}
                >
                  {linkCode}
                </p>
                <p style={{ fontSize: 11, color: '#9B948D' }}>
                  Expires at{' '}
                  {linkCodeExpiresAt
                    ? new Date(linkCodeExpiresAt).toLocaleTimeString()
                    : '?'}
                </p>
              </div>
            )}
          </Section>

          <Section title="Link this device — Enter a code (from another device)">
            <p style={{ fontSize: 13, color: '#5F5A54', marginBottom: 8 }}>
              Use this if THIS device's CDP wallet (
              <code>{cdpWallet ?? 'none'}</code>) is not yet linked to
              your account. Issue a code on an already-linked device
              and enter it here.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={enterCode}
                onChange={(e) =>
                  setEnterCode(e.target.value.toUpperCase().slice(0, 6))
                }
                placeholder="ABC123"
                maxLength={6}
                style={{
                  padding: 8,
                  fontSize: 18,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: 4,
                  width: 140,
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  textTransform: 'uppercase',
                }}
              />
              <button
                onClick={confirmLinkCode}
                disabled={
                  enterCodeBusy ||
                  enterCode.length !== 6 ||
                  !cdpWallet
                }
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#1F453A',
                  color: '#fff',
                  border: 'none',
                  cursor:
                    enterCodeBusy || enterCode.length !== 6
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: 13,
                }}
              >
                {enterCodeBusy ? 'Linking…' : 'Confirm link'}
              </button>
            </div>
            {enterCodeError && (
              <p style={{ fontSize: 12, color: '#7A2E2E', marginTop: 8 }}>
                {enterCodeError}
              </p>
            )}
            {enterCodeSuccess && (
              <p
                style={{
                  fontSize: 12,
                  color: '#1F453A',
                  marginTop: 8,
                  background: '#E8F1EE',
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {enterCodeSuccess}
              </p>
            )}
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
