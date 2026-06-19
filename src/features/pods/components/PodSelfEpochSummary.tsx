'use client';

/**
 * PodSelfEpochSummary — read-only $SELF view for the pod treasury tab.
 *
 * $SELF is not a held treasury asset (soulbound). Instead this shows the pod's
 * per-epoch participation capacity: budget allocated vs distributed, remaining,
 * and recipient count — current epoch summary on top, scrollable history below.
 *
 * Self-hides when $SELF isn't configured or the pod has no budget history, so
 * it's safe to mount unconditionally in the treasury tab.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/utils/supabaseClient';

interface EpochRow {
  epoch: number;
  allocatedHours: number;
  distributedHours: number;
  remainingHours: number;
  recipients: number;
  source: string;
}

const SELF_CONFIGURED = !!process.env.NEXT_PUBLIC_SELF_EPOCHS;

const fmt = (h: number) =>
  h >= 1 || h === 0 ? `${h.toFixed(h % 1 === 0 ? 0 : 1)}h` : `${Math.round(h * 60)}m`;

export const PodSelfEpochSummary: React.FC<{ podId: string }> = ({ podId }) => {
  const [rows, setRows] = useState<EpochRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SELF_CONFIGURED || !podId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/self/pod-summary?podId=${podId}`, {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        setRows(data.epochs || []);
      } catch {
        /* non-critical view */
      } finally {
        setLoading(false);
      }
    })();
  }, [podId]);

  // Self-hide: unconfigured, loading, or no budget history.
  if (!SELF_CONFIGURED || loading || rows.length === 0) return null;

  const current = rows[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: '#2F5D50' }}>$SELF Participation</CardTitle>
        <p style={{ fontSize: '0.8rem', color: '#8FA09A', margin: '4px 0 0' }}>
          $SELF is earned by members, not held by the pod. This shows the pod’s
          participation budget and what’s been distributed, by season (epoch).
        </p>
      </CardHeader>
      <CardContent>
        {/* Current epoch summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '1rem',
          }}
        >
          {[
            { label: 'Distributed', value: fmt(current.distributedHours) },
            { label: 'Remaining', value: fmt(current.remainingHours) },
            { label: 'Recipients', value: String(current.recipients) },
          ].map((s) => (
            <div key={s.label} style={{ background: '#E8F1EE', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2F5D50' }}>{s.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#5B7A6E' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#8FA09A', marginBottom: '0.5rem' }}>
          Season {current.epoch} · {fmt(current.allocatedHours)} allocated
        </div>

        {/* Scrollable per-epoch history */}
        <div style={{ maxHeight: '220px', overflowY: 'auto', borderTop: '1px solid #E8F1EE' }}>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#8FA09A', textAlign: 'left' }}>
                <th style={{ padding: '6px 4px' }}>Season</th>
                <th style={{ padding: '6px 4px' }}>Allocated</th>
                <th style={{ padding: '6px 4px' }}>Distributed</th>
                <th style={{ padding: '6px 4px' }}>Recipients</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.epoch} style={{ borderTop: '1px solid #f1f5f4' }}>
                  <td style={{ padding: '6px 4px' }}>{r.epoch}</td>
                  <td style={{ padding: '6px 4px' }}>{fmt(r.allocatedHours)}</td>
                  <td style={{ padding: '6px 4px' }}>{fmt(r.distributedHours)}</td>
                  <td style={{ padding: '6px 4px' }}>{r.recipients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

PodSelfEpochSummary.displayName = 'PodSelfEpochSummary';
