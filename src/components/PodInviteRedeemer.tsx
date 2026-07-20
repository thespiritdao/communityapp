'use client';

/**
 * PodInviteRedeemer — mounted on /home. If the visitor arrived through a pod
 * invite link (?invite=POD-XXXXXXXX stashed in sessionStorage by the landing
 * page), redeem it once after authentication and show the result banner.
 * Renders nothing when there's no pending invite.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function PodInviteRedeemer() {
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = sessionStorage.getItem('pod_invite_code');
    if (!code) return;

    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return; // not authed yet — try next visit

      // Remove BEFORE the call so a failure can't loop on every page load;
      // a genuinely valid link can always be clicked again.
      sessionStorage.removeItem('pod_invite_code');

      try {
        const res = await fetch('/api/pod-invites/accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && body.joined) {
          setTone('success');
          setMessage(`Welcome to ${body.podName}! You're now a member.`);
        } else if (res.ok && body.alreadyMember) {
          setTone('success');
          setMessage(`You're already a member of ${body.podName}.`);
        } else {
          setTone('error');
          setMessage(body.error || 'Could not redeem the pod invite.');
        }
        // Auto-dismiss after 8s.
        setTimeout(() => !cancelled && setMessage(null), 8000);
      } catch {
        if (!cancelled) {
          setTone('error');
          setMessage('Could not redeem the pod invite. Please try the link again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '92vw',
        background: tone === 'success' ? '#2F5D50' : '#8B3A3A',
        color: '#FFFFFF',
        borderRadius: '12px',
        padding: '12px 20px',
        fontSize: '15px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span>{message}</span>
      <button
        onClick={() => setMessage(null)}
        style={{
          background: 'none',
          border: 'none',
          color: '#FFFFFF',
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default PodInviteRedeemer;
