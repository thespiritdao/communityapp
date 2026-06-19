'use client';

/**
 * SelfAdminCard — Exec-Pod-only surface for the $SELF system.
 *
 * Three tabs: Budgets (set per-pod/epoch mint capacity), Review (approve/reject
 * high-value flagged mints), Epoch (view + advance the global quarter).
 *
 * Rendered only when the caller is Exec (same gate as CommunityTokensAdminCard).
 * All writes go through /api/admin/self, which re-verifies the
 * EXECUTIVE_POD_LEADER hat ON-CHAIN — the UI gate is convenience, not the
 * security boundary. Self-hides if $SELF isn't configured yet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import { Sparkles } from 'lucide-react';

const HOUR = 10n ** 18n;
const fmtHours = (wei: string): string => {
  try {
    const h = BigInt(wei) / HOUR;
    const m = (BigInt(wei) % HOUR) / (HOUR / 60n);
    return m > 0n ? `${h}h ${m}m` : `${h}h`;
  } catch {
    return '0h';
  }
};

interface Budget {
  id: string;
  pod_id: string;
  epoch: number;
  allocated_hours: string;
  minted_hours: string;
  source: string;
}
interface MintRow {
  id: string;
  wallet: string;
  pod_id: string;
  epoch: number;
  hours: string;
  source_type: string;
  source_ref: string;
  anomaly_flags: string[];
  created_at: string;
}
interface PodRef { id: string; name: string }
interface EpochInfo { current: number; lifetime: number }

async function authedFetch(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

type Tab = 'budgets' | 'review' | 'epoch';

export const SelfAdminCard: React.FC = () => {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const [tab, setTab] = useState<Tab>('budgets');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reviewQueue, setReviewQueue] = useState<MintRow[]>([]);
  const [pods, setPods] = useState<PodRef[]>([]);
  const [epoch, setEpoch] = useState<EpochInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Budget form
  const [bPod, setBPod] = useState('');
  const [bEpoch, setBEpoch] = useState('');
  const [bHours, setBHours] = useState('');

  const podName = useCallback(
    (id: string) => pods.find((p) => p.id === id)?.name || id.slice(0, 8),
    [pods],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/self');
      if (res.status === 403 || res.status === 401) { setUnavailable(true); return; }
      if (!res.ok) throw new Error((await res.json()).error || 'Load failed');
      const data = await res.json();
      setBudgets(data.budgets || []);
      setReviewQueue(data.reviewQueue || []);
      setPods(data.pods || []);
      setEpoch(data.epoch || null);
    } catch (e) {
      toastRef.current({ title: 'Failed to load $SELF admin', description: String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setBudget = async () => {
    if (!bPod || bEpoch === '' || bHours === '') {
      toastRef.current({ title: 'Pod, epoch, and hours are required', variant: 'destructive' });
      return;
    }
    const res = await authedFetch('/api/admin/self', {
      method: 'POST',
      body: JSON.stringify({ action: 'setBudget', podId: bPod, epoch: Number(bEpoch), hours: Number(bHours) }),
    });
    if (!res.ok) {
      toastRef.current({ title: 'Set budget failed', description: (await res.json()).error, variant: 'destructive' });
      return;
    }
    toastRef.current({ title: 'Budget set', variant: 'success' });
    setBHours('');
    load();
  };

  const reviewMint = async (mintId: string, decision: 'approved' | 'rejected') => {
    const res = await authedFetch('/api/admin/self', {
      method: 'POST',
      body: JSON.stringify({ action: 'reviewMint', mintId, decision }),
    });
    if (!res.ok) {
      toastRef.current({ title: 'Review failed', description: (await res.json()).error, variant: 'destructive' });
      return;
    }
    setReviewQueue((q) => q.filter((r) => r.id !== mintId));
    toastRef.current({ title: `Mint ${decision}`, variant: 'success' });
  };

  const advanceEpoch = async () => {
    if (!window.confirm(
      'Advance the global $SELF epoch? This is IRREVERSIBLE — $SELF earned beyond the lifetime window will expire. Do this only at quarter close.',
    )) return;
    const res = await authedFetch('/api/admin/self', {
      method: 'POST',
      body: JSON.stringify({ action: 'advanceEpoch' }),
    });
    if (!res.ok) {
      toastRef.current({ title: 'Advance epoch failed', description: (await res.json()).error, variant: 'destructive' });
      return;
    }
    const data = await res.json();
    toastRef.current({ title: `Epoch advanced to ${data.epoch}`, variant: 'success' });
    load();
  };

  if (unavailable) return null;

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      style={{
        padding: '6px 14px',
        borderRadius: '999px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: 600,
        background: tab === t ? '#2F5D50' : '#E8F1EE',
        color: tab === t ? '#fff' : '#2F5D50',
      }}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2F5D50' }}>
          <Sparkles className="h-5 w-5" /> $SELF Administration
        </CardTitle>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {tabBtn('budgets', 'Budgets')}
          {tabBtn('review', `Review${reviewQueue.length ? ` (${reviewQueue.length})` : ''}`)}
          {tabBtn('epoch', 'Epoch')}
        </div>
      </CardHeader>
      <CardContent>
        {loading && <p style={{ color: '#8FA09A' }}>Loading…</p>}

        {/* ── Budgets ── */}
        {tab === 'budgets' && !loading && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end', marginBottom: '1rem' }}>
              <div>
                <Label>Pod</Label>
                <select value={bPod} onChange={(e) => setBPod(e.target.value)} className="w-full border rounded-md p-2 text-sm">
                  <option value="">Select pod…</option>
                  {pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Epoch</Label>
                <Input type="number" value={bEpoch} onChange={(e) => setBEpoch(e.target.value)} placeholder={epoch ? String(epoch.current) : '0'} />
              </div>
              <div>
                <Label>Hours</Label>
                <Input type="number" value={bHours} onChange={(e) => setBHours(e.target.value)} placeholder="500" />
              </div>
              <Button onClick={setBudget}>Set</Button>
            </div>

            {budgets.length === 0 ? (
              <p style={{ color: '#8FA09A' }}>No budgets set yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {budgets.map((b) => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: '#f9fafb', fontSize: '0.85rem' }}>
                    <span><strong>{podName(b.pod_id)}</strong> · epoch {b.epoch} · <span style={{ color: '#8FA09A' }}>{b.source}</span></span>
                    <span>{fmtHours(b.minted_hours)} / {fmtHours(b.allocated_hours)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Review queue ── */}
        {tab === 'review' && !loading && (
          <div>
            {reviewQueue.length === 0 ? (
              <p style={{ color: '#8FA09A' }}>No mints awaiting review. 🎉</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reviewQueue.map((r) => (
                  <div key={r.id} style={{ padding: '12px', borderRadius: '10px', background: '#FAF4EC', border: '1px solid #E8D9C0' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>{fmtHours(r.hours)}</strong> → {r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}
                      <span style={{ color: '#8FA09A' }}> · {podName(r.pod_id)} · {r.source_type} · epoch {r.epoch}</span>
                    </div>
                    {r.anomaly_flags?.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        {r.anomaly_flags.map((f) => (
                          <span key={f} style={{ fontSize: '0.7rem', background: '#8B3A3A', color: '#fff', padding: '2px 8px', borderRadius: '999px', marginRight: '4px' }}>{f}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <Button onClick={() => reviewMint(r.id, 'approved')} style={{ background: '#2F5D50' }}>Approve</Button>
                      <Button variant="outline" onClick={() => reviewMint(r.id, 'rejected')}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Epoch ── */}
        {tab === 'epoch' && !loading && (
          <div>
            {epoch ? (
              <div style={{ fontSize: '0.9rem' }}>
                <p>Current epoch (quarter): <strong>{epoch.current}</strong></p>
                <p style={{ color: '#8FA09A' }}>Lifetime (K): {epoch.lifetime} epochs — $SELF earned in epoch {epoch.current - epoch.lifetime} and earlier is expired.</p>
                <Button onClick={advanceEpoch} style={{ marginTop: '12px', background: '#8B3A3A' }}>
                  Advance epoch (irreversible)
                </Button>
              </div>
            ) : (
              <p style={{ color: '#8FA09A' }}>SelfEpochs not configured (NEXT_PUBLIC_SELF_EPOCHS missing).</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

SelfAdminCard.displayName = 'SelfAdminCard';
