'use client';

/**
 * IntentCard — "What brings you here?" Three doors, asked once on /home
 * after the TOS is signed. "Ask me later" hides it for this browser
 * session only; it comes back on the next visit until answered.
 */

import { useState } from 'react';
import { INTENT_OPTIONS, type OnboardingIntent } from '../tracks';

export const INTENT_LATER_KEY = 'onboarding_intent_later';

interface IntentCardProps {
  onChoose: (intent: OnboardingIntent) => Promise<void> | void;
  onLater?: () => void;
  /** Hide the "Just explore" door (used when re-asking from the explore track). */
  hideExplore?: boolean;
  /** Smaller heading when shown as a re-ask inside the progress card. */
  compact?: boolean;
}

export function IntentCard({ onChoose, onLater, hideExplore = false, compact = false }: IntentCardProps) {
  const [busy, setBusy] = useState<OnboardingIntent | null>(null);

  const options = hideExplore ? INTENT_OPTIONS.filter((o) => o.value !== 'explore') : INTENT_OPTIONS;

  const choose = async (intent: OnboardingIntent) => {
    setBusy(intent);
    try {
      await onChoose(intent);
    } finally {
      setBusy(null);
    }
  };

  const later = () => {
    try {
      sessionStorage.setItem(INTENT_LATER_KEY, '1');
    } catch {
      // ignore
    }
    onLater?.();
  };

  return (
    <div
      data-tour="onboarding-card"
      style={{
        margin: compact ? 0 : '16px',
        padding: compact ? '16px' : '20px',
        background: 'hsl(var(--card))',
        borderRadius: '12px',
        border: '1px solid hsl(var(--primary) / 0.3)',
        boxShadow: compact ? 'none' : '0 2px 8px hsl(var(--primary) / 0.08)',
      }}
    >
      <p
        style={{
          fontSize: compact ? '15px' : '17px',
          fontWeight: 600,
          color: 'hsl(var(--foreground))',
          marginBottom: '4px',
        }}
      >
        {hideExplore ? 'Ready for a path?' : 'What brings you here?'}
      </p>
      <p style={{ fontSize: '13px', color: 'var(--face-text-subtle)', marginBottom: '14px' }}>
        {hideExplore
          ? 'Pick one and your checklist changes with you.'
          : 'Pick one. You can change it any time from your profile.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            disabled={busy !== null}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid hsl(var(--primary) / 0.25)',
              background: busy === opt.value ? 'hsl(var(--primary) / 0.12)' : 'transparent',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy && busy !== opt.value ? 0.6 : 1,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = 'hsl(var(--primary) / 0.08)';
            }}
            onMouseLeave={(e) => {
              if (!busy) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 600,
                color: 'hsl(var(--primary))',
              }}
            >
              {opt.title}
            </span>
            <span style={{ display: 'block', fontSize: '13px', color: 'var(--face-text-subtle)' }}>
              {opt.blurb}
            </span>
          </button>
        ))}
      </div>

      {onLater && (
        <button
          type="button"
          onClick={later}
          style={{
            marginTop: '12px',
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: '13px',
            color: 'var(--face-text-subtle)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Ask me later
        </button>
      )}
    </div>
  );
}

export function intentDeferredThisSession(): boolean {
  try {
    return sessionStorage.getItem(INTENT_LATER_KEY) === '1';
  } catch {
    return false;
  }
}
