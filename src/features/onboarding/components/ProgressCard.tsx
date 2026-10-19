'use client';

/**
 * ProgressCard — the member's track with checkmarks, the next undone item
 * as the primary button, and "Show me" to spotlight the matching home icon
 * through the existing tour engine (single step, no completion write).
 *
 * `compact` is the /identity variant: no margin, smaller heading, no hints.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTour } from '@/context/TourContext';
import { INTENT_TITLES } from '../tracks';
import type { OnboardingProgress } from '../useOnboardingProgress';
import { IntentCard } from './IntentCard';

interface ProgressCardProps {
  progress: OnboardingProgress;
  compact?: boolean;
}

export function ProgressCard({ progress, compact = false }: ProgressCardProps) {
  const { intent, items, doneCount, total, nextItem, setIntent, dismiss } = progress;
  const { startTourAt } = useTour();
  const pathname = usePathname();
  const [reasking, setReasking] = useState(false);

  if (!intent) return null;

  if (reasking) {
    return (
      <div style={{ margin: compact ? 0 : '16px' }}>
        <IntentCard
          compact
          hideExplore={intent === 'explore'}
          onChoose={async (next) => {
            await setIntent(next);
            setReasking(false);
          }}
          onLater={() => setReasking(false)}
        />
      </div>
    );
  }

  const primary = nextItem?.href ?? null;
  const onHome = pathname === '/home';

  return (
    <div
      data-tour="onboarding-card"
      style={{
        margin: compact ? '16px 0 0' : '16px',
        padding: compact ? '14px 16px' : '16px 18px',
        background: 'hsl(var(--card))',
        borderRadius: '12px',
        border: '1px solid hsl(var(--primary) / 0.3)',
        boxShadow: compact ? 'none' : '0 2px 8px hsl(var(--primary) / 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <p style={{ fontSize: compact ? '14px' : '16px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {INTENT_TITLES[intent]}
        </p>
        <span style={{ fontSize: '12px', color: 'var(--face-text-subtle)', whiteSpace: 'nowrap' }}>
          {doneCount} of {total}
        </span>
      </div>

      {/* Progress bar */}
      <div
        aria-hidden="true"
        style={{
          height: '4px',
          background: 'hsl(var(--primary) / 0.12)',
          borderRadius: '2px',
          margin: '8px 0 12px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${total ? (doneCount / total) * 100 : 0}%`,
            background: 'hsl(var(--primary))',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? '6px' : '8px' }}>
        {items.map((item) => {
          const isReask = item.href === null;
          const isNext = nextItem?.id === item.id;
          return (
            <li key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  borderRadius: '50%',
                  border: `2px solid ${item.done ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.35)'}`,
                  background: item.done ? 'hsl(var(--primary))' : 'transparent',
                  color: 'hsl(var(--primary-foreground))',
                  fontSize: '11px',
                  lineHeight: '14px',
                  textAlign: 'center',
                }}
              >
                {item.done ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  {isReask ? (
                    <button
                      type="button"
                      onClick={() => setReasking(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: '14px',
                        fontWeight: isNext ? 600 : 500,
                        color: 'hsl(var(--primary))',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      href={item.href!}
                      style={{
                        fontSize: '14px',
                        fontWeight: isNext ? 600 : 500,
                        color: item.done ? 'var(--face-text-subtle)' : 'hsl(var(--foreground))',
                        textDecoration: item.done ? 'line-through' : 'none',
                      }}
                    >
                      {item.label}
                    </Link>
                  )}
                  {!item.done && item.tourId && onHome && (
                    <button
                      type="button"
                      onClick={() => startTourAt(item.tourId!)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: '12px',
                        color: 'hsl(var(--primary))',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                    >
                      Show me
                    </button>
                  )}
                </div>
                {!compact && !item.done && (
                  <p style={{ fontSize: '12px', color: 'var(--face-text-subtle)', marginTop: '2px' }}>{item.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
        {primary && nextItem && (
          <Link
            href={primary}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {nextItem.label} →
          </Link>
        )}
        <button
          type="button"
          onClick={() => setReasking(true)}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--face-text-subtle)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Change path
        </button>
        <button
          type="button"
          onClick={() => dismiss()}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--face-text-subtle)', textDecoration: 'underline', cursor: 'pointer', marginLeft: 'auto' }}
        >
          Hide
        </button>
      </div>
    </div>
  );
}
