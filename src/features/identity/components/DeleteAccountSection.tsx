'use client';

/**
 * DeleteAccountSection — /identity/: in-app account deletion (danger zone).
 *
 * Google Play requires apps with account creation to offer in-app deletion.
 * The button submits a deletion request to /api/account/delete (recorded +
 * operators notified, completed within 30 days per the published policy),
 * then signs the member out. Type-to-confirm guards against accidents.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function DeleteAccountSection() {
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Please sign in again to delete your account.');

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Request failed. Please try again.');
      }

      setDone(true);
      // Give the member a moment to read the confirmation, then sign out.
      setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          window.location.href = '/';
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          border: '1px solid #E5C9C9',
          background: '#FDF7F7',
          borderRadius: '12px',
          padding: '1.25rem',
          marginTop: '2rem',
        }}
      >
        <p style={{ margin: 0, color: '#7A2E2E', fontSize: '0.9rem' }}>
          Your deletion request has been received and will be completed within
          30 days. A confirmation was sent to your email. You will now be
          signed out.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #E5C9C9',
        background: '#FDF7F7',
        borderRadius: '12px',
        padding: '1.25rem',
        marginTop: '2rem',
      }}
    >
      <div
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#A05252',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
        }}
      >
        Danger Zone
      </div>

      {!expanded ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <p style={{ margin: 0, color: '#6B7280', fontSize: '0.875rem' }}>
            Permanently delete your account and personal data.
          </p>
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: 'transparent',
              border: '1px solid #B91C1C',
              color: '#B91C1C',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Delete Account
          </button>
        </div>
      ) : (
        <div>
          <p style={{ color: '#374151', fontSize: '0.875rem', marginTop: 0 }}>
            This deletes your account, profile, messages, and event
            registrations within 30 days. Blockchain records (wallet activity,
            token holdings, votes) are on a permanent public ledger and cannot
            be erased; forum posts may be anonymized instead of removed. See
            the{' '}
            <a
              href="/identity/account-deletion"
              style={{ color: '#B91C1C', textDecoration: 'underline' }}
            >
              account deletion policy
            </a>{' '}
            for details.
          </p>
          <p style={{ color: '#374151', fontSize: '0.875rem' }}>
            Type <strong>DELETE</strong> to confirm:
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              style={{
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.875rem',
                width: '140px',
              }}
            />
            <button
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || submitting}
              style={{
                background:
                  confirmText === 'DELETE' && !submitting
                    ? '#B91C1C'
                    : '#E5A3A3',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '8px',
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor:
                  confirmText === 'DELETE' && !submitting
                    ? 'pointer'
                    : 'not-allowed',
              }}
            >
              {submitting ? 'Submitting…' : 'Permanently Delete My Account'}
            </button>
            <button
              onClick={() => {
                setExpanded(false);
                setConfirmText('');
                setError(null);
              }}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6B7280',
                fontSize: '0.875rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p style={{ color: '#B91C1C', fontSize: '0.875rem', marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
