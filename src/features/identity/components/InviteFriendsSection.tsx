'use client';

/**
 * InviteFriendsSection — /identity/: invite outsiders by email.
 * One or many addresses (comma/newline separated), optional "from pod"
 * attribution. Sends a fixed boilerplate email via /api/invites/email with a
 * personal /?invite=CODE link (the sender's referral key).
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
  const [pods, setPods] = useState<PodOption[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [details, setDetails] = useState<
    Array<{ email: string; status: string; reason?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Pods the member belongs to (for optional attribution).
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      const { data: memberships } = await supabase
        .from('pod_members')
        .select('pod_id')
        .eq('wallet', walletAddress.toLowerCase())
        .eq('is_active', true);
      const ids = [...new Set((memberships || []).map((m) => m.pod_id))];
      if (ids.length === 0) return;
      const { data: podRows } = await supabase
        .from('pods')
        .select('id, name')
        .in('id', ids)
        .eq('is_active', true);
      if (!cancelled && podRows) {
        setPods(podRows.filter((p) => !p.name?.startsWith('ipfs://')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

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
          Invite people to join SpiritDAO by email. They&apos;ll get a personal
          link — no code to type. Enter one or more addresses, separated by
          commas or new lines.
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

        {pods.length > 0 && (
          <div style={{ marginTop: '0.6rem' }}>
            <label
              style={{ fontSize: '0.8rem', color: '#6B7A74', marginRight: 8 }}
            >
              Invite as a member of:
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
              }}
            >
              <option value="">Just me (no pod)</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
