'use client';

/**
 * CommunityTokensAdminCard — Exec-Pod-only surface to register, bless, and scope
 * community governance tokens.
 *
 * Rendered only when `isExecPod && isManager` (same gate as DAOGovernanceSettingsCard).
 * All writes go through /api/admin/tokens, which re-verifies the EXECUTIVE_POD_LEADER
 * hat server-side — the UI gate is convenience, not the security boundary.
 *
 * Posture: a community token is a governance eligibility SIGNAL only — never
 * issued, held, or exchanged by the platform. `gating_enabled` decides whether a
 * token may gate any role; `owner_pod_id` scopes it to one community (so $TGN only
 * appears in the TreeGens pod's settings).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import { Coins } from 'lucide-react';

interface AdminToken {
  id: string;
  name: string;
  contract_address: string;
  decimals: number;
  gating_enabled: boolean;
  owner_pod_id: string | null;
}
interface PodRef {
  id: string;
  name: string;
}

async function authedFetch(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
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

export const CommunityTokensAdminCard: React.FC = () => {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [pods, setPods] = useState<PodRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/tokens');
      if (!res.ok) throw new Error((await res.json()).error || 'Load failed');
      const data = await res.json();
      setTokens(data.tokens || []);
      setPods(data.pods || []);
    } catch (e: any) {
      toast({ title: 'Could not load tokens', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(newAddress) || !newName.trim()) {
      toast({ title: 'Need a valid address + name', variant: 'destructive' });
      return;
    }
    try {
      const res = await authedFetch('/api/admin/tokens', {
        method: 'POST',
        body: JSON.stringify({
          contract_address: newAddress,
          name: newName.trim(),
          owner_pod_id: newScope || null,
          gating_enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Register failed');
      toast({ title: `Registered ${data.token.name}`, description: `decimals ${data.token.decimals}` });
      setNewAddress('');
      setNewName('');
      setNewScope('');
      load();
    } catch (e: any) {
      toast({ title: 'Register failed', description: e.message, variant: 'destructive' });
    }
  };

  const patch = async (id: string, body: Record<string, any>) => {
    try {
      const res = await authedFetch('/api/admin/tokens', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      load();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const podName = (id: string | null) =>
    id ? pods.find((p) => p.id === id)?.name || 'Unknown pod' : 'Platform-wide';

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" />
          Community Governance Tokens
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Register a community's token so it can gate a voting role. Tokens are
          governance signals only — never issued, held, or exchanged by the
          platform. Scope a token to a community so it appears only in that pod.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Register */}
        <div className="space-y-2 rounded-md border p-3">
          <Label className="text-sm font-medium">Register a token</Label>
          <Input
            placeholder="Contract address (0x…)"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
          <Input
            placeholder="Display name (e.g. $TGN)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div>
            <Label className="text-xs">Scope to community</Label>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
            >
              <option value="">Platform-wide (all pods)</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={register}>
            Register &amp; enable
          </Button>
          <p className="text-xs text-gray-400">
            Decimals are read on-chain automatically.
          </p>
        </div>

        {/* List */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Registered tokens</Label>
          {loading && <p className="text-xs text-gray-400">Loading…</p>}
          {!loading && tokens.length === 0 && (
            <p className="text-xs text-gray-400">None yet.</p>
          )}
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-gray-400 font-mono">
                {t.contract_address.slice(0, 6)}…{t.contract_address.slice(-4)}
              </span>
              <span className="text-xs text-gray-500">· {podName(t.owner_pod_id)}</span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  className="border rounded p-1 text-xs"
                  value={t.owner_pod_id || ''}
                  onChange={(e) =>
                    patch(t.id, { owner_pod_id: e.target.value || null })
                  }
                >
                  <option value="">Platform-wide</option>
                  {pods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant={t.gating_enabled ? 'secondary' : 'default'}
                  onClick={() => patch(t.id, { gating_enabled: !t.gating_enabled })}
                >
                  {t.gating_enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CommunityTokensAdminCard;
