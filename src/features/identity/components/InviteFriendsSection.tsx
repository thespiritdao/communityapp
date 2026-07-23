'use client';

/**
 * InviteFriendsSection — /identity/: unified invite panel.
 *
 * One card that merges the personal invite key + email invites:
 *   - "Just me (app access)" → the member's personal referral link. Anyone can
 *     copy it or email it; it gets the invitee into the app (no pod).
 *   - A pod the member LEADS/EXECS → a pod-enroll link. Copying/emailing it
 *     auto-joins the invitee to that pod's member role on signup.
 * The pod selector only lists pods the member can enroll people into (leader or
 * pod_leads). The server (/api/invites/link, /api/invites/email) is the real
 * authorization gate.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface InviteFriendsSectionProps {
  walletAddress: string;
}

interface PodOption {
  id: string;
  name: string;
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

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function InviteFriendsSection({
  walletAddress,
}: InviteFriendsSectionProps) {
  const [emailsText, setEmailsText] = useState('');
  const [leaderPods, setLeaderPods] = useState<PodOption[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [details, setDetails] = useState<
    Array<{ email: string; status: string; reason?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Pods the member can ENROLL people into: those they lead (membership_type
  // 'leader' / role 'leader') or where they're listed in pods.pod_leads.
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      const w = walletAddress.toLowerCase();
      const podIds = new Set<string>();

      const { data: leadRows } = await supabase
        .from('pod_members')
        .select('pod_id, membership_type, role')
        .eq('wallet', w)
        .eq('is_active', true);
      for (const r of leadRows || []) {
        if (r.membership_type === 'leader' || r.role === 'leader') podIds.add(r.pod_id);
      }

      const { data: leadPods } = await supabase
        .from('pods')
        .select('id, name, pod_leads')
        .eq('is_active', true);
      for (const p of leadPods || []) {
        if ((p.pod_leads || []).map((a: string) => a.toLowerCase()).includes(w)) {
          podIds.add(p.id);
        }
      }

      if (podIds.size === 0) return;
      const { data: podRows } = await supabase
        .from('pods')
        .select('id, name')
        .in('id', [...podIds])
        .eq('is_active', true);
      if (!cancelled && podRows) {
        setLeaderPods(
          podRows.filter((p) => p.name && !p.name.startsWith('ipfs://')),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Fetch the copyable link for the current selection (personal or pod-enroll).
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      setLinkLoading(true);
      setInviteUrl('');
      try {
        const token = await getAuthToken();
        if (!token) return;
        const qs = selectedPod ? `?podId=${selectedPod}` : '';
        const res = await fetch(`/api/invites/link${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.url) setInviteUrl(body.url);
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, selectedPod]);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select the field manually */
    }
  }, [inviteUrl]);

  const handleSend = useCallback(async () => {
    setError(null);
    setSummary(null);
    setDetails([]);

    const emails = emailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setError('Enter at least one email address.');
      return;
    }

    setSending(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Please sign in to send invites.');

      const res = await fetch('/api/invites/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emails,
          podId: selectedPod || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send invites.');

      setSummary(
        `${body.sent} invitation${body.sent === 1 ? '' : 's'} sent${
          body.skipped ? `, ${body.skipped} skipped` : ''
        }.`,
      );
      setDetails(body.results || []);
      if (body.sent > 0) setEmailsText('');
    } catch (e: any) {
      setError(e?.message || 'Could not send invites.');
    } finally {
      setSending(false);
    }
  }, [emailsText, selectedPod]);

  const isPodInvite = !!selectedPod;
  const selectedPodName = leaderPods.find((p) => p.id === selectedPod)?.name;

  return (
    <div style={{ marginTop: '20px', marginBottom: '8px' }}>
      <h3 style={headerStyle}>Invite Friends</h3>

      <div className="token-gallery-modal">
        <p
          style={{
            fontSize: '0.8rem',
            color: '#6B7A74',
            lineHeight: 1.5,
            marginBottom: '0.75rem',
          }}
        >
          Share your invite link or send it by email. Invitees get a personal
          link — no code to type.
        </p>

        {/* Enroll target (only shows pods you can enroll people into) */}
        {leaderPods.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              style={{
                fontSize: '0.8rem',
                color: '#6B7A74',
                marginRight: 8,
                display: 'block',
                marginBottom: 4,
              }}
            >
              Invite them to:
            </label>
            <select
              value={selectedPod}
              onChange={(e) => setSelectedPod(e.target.value)}
              disabled={sending}
              style={{
                fontSize: '0.85rem',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #D8D2C8',
                background: '#FFFFFF',
                width: '100%',
              }}
            >
              <option value="">SpiritDAO (app access only)</option>
              {leaderPods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (auto-join)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Copyable link for the current selection */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={linkLoading ? 'Loading link…' : inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: 1,
                padding: '10px 12px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: '1px solid #D8D2C8',
                background: '#FAF7F2',
                color: '#3A3A3A',
                fontFamily: 'monospace',
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!inviteUrl}
              style={{
                background: copied ? '#3F7A5A' : '#2F5D50',
                color: '#FFFFFF',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: inviteUrl ? 'pointer' : 'default',
                opacity: inviteUrl ? 1 : 0.6,
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          {isPodInvite && selectedPodName && (
            <p style={{ fontSize: '0.72rem', color: '#3F7A5A', marginTop: 4 }}>
              This link auto-joins invitees to {selectedPodName}.
            </p>
          )}
        </div>

        {/* Optional email send of the same link */}
        <p
          style={{
            fontSize: '0.75rem',
            color: '#8FA09A',
            margin: '0.9rem 0 0.4rem',
          }}
        >
          Or email it directly:
        </p>
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder={'friend@example.com\nanother@example.com'}
          rows={3}
          disabled={sending}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '0.9rem',
            borderRadius: '8px',
            border: '1px solid #D8D2C8',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B0453C', marginTop: '0.6rem' }}>
            {error}
          </p>
        )}
        {summary && (
          <p style={{ fontSize: '0.8rem', color: '#2F5D50', marginTop: '0.6rem' }}>
            {summary}
          </p>
        )}
        {details.some((d) => d.status === 'skipped') && (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '0.4rem 0 0',
              fontSize: '0.75rem',
              color: '#8FA09A',
            }}
          >
            {details
              .filter((d) => d.status === 'skipped')
              .map((d) => (
                <li key={d.email}>
                  {d.email} — {d.reason}
                </li>
              ))}
          </ul>
        )}

        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              background: '#2F5D50',
              color: '#FFFFFF',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.02em',
              cursor: sending ? 'default' : 'pointer',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? 'Sending...' : 'Send invites'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InviteFriendsSection;
