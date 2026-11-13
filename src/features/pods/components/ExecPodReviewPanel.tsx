'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
import { supabase } from '@/utils/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useProfiles } from '@/features/identity/hooks/useProfiles';

function ProfileChip({
  address,
  getProfile,
}: {
  address: string;
  getProfile: (addr: string) => any;
}) {
  const profile = getProfile(address);
  const name = profile?.first_name || profile?.last_name
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : null;

  return (
    <div className="flex items-center gap-1.5">
      {profile?.profile_picture ? (
        <img
          src={profile.profile_picture}
          alt={name || address}
          className="w-6 h-6 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground">
            {name ? name[0].toUpperCase() : '?'}
          </span>
        </div>
      )}
      <span>{name || 'Unknown Member'}</span>
    </div>
  );
}

interface PendingPod {
  id: string;
  name: string;
  description: string;
  pod_leads: string[];
  created_by_address: string;
  pod_image_url: string | null;
  created_at: string;
  status: string;
  parent_pod_id: string | null;
}

export function ExecPodReviewPanel() {
  const [pods, setPods] = useState<PendingPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [vetoReason, setVetoReason] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Collect all addresses that need profile lookups (proposer + all leads)
  const allAddresses = useMemo(() => {
    const addrs: string[] = [];
    for (const pod of pods) {
      if (pod.created_by_address) addrs.push(pod.created_by_address);
      for (const lead of pod.pod_leads || []) addrs.push(lead);
    }
    return addrs;
  }, [pods]);

  const { getProfile } = useProfiles(allAddresses);

  const fetchPods = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/pods/review?scope=exec', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      setPods(json.pods || []);
    } catch {
      toastRef.current({ title: 'Failed to load pending pods', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPods(); }, [fetchPods]);

  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  const handleAction = async (podId: string, action: 'activate' | 'veto') => {
    setActionPending(podId + action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Step 1: server verifies hat ownership, returns calldata
      const authRes = await fetch('/api/pods/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          podId,
          action: 'authorize',
          pendingAction: action,
          reason: vetoReason[podId] || 'Vetoed by exec',
        }),
      });
      const authJson = await authRes.json();
      if (!authRes.ok) throw new Error(authJson.error || 'Action failed');

      // Step 2: client executes via CDP smart wallet — Coinbase sponsors gas
      const smartAccount = currentUser?.evmSmartAccounts?.[0];
      if (!smartAccount) throw new Error('Smart account not available');
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount as `0x${string}`,
        network: 'base',
        calls: [{ to: authJson.contractAddress, data: authJson.callData }],
        useCdpPaymaster: true,
      });
      const txHash = result?.transactionHash || result?.userOpHash || '';

      // Step 3: write DB now that tx is confirmed
      const dbRes = await fetch('/api/pods/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          podId,
          action: 'dbUpdate',
          pendingAction: action,
          txHash,
        }),
      });
      const dbJson = await dbRes.json();
      if (!dbRes.ok) throw new Error(dbJson.error || 'DB update failed');

      toast({
        title: action === 'activate'
          ? 'Pod activated — leadership tokens minted to pod leads'
          : 'Pod vetoed',
      });
      fetchPods();
    } catch (e: any) {
      toast({ title: e.message || 'Action failed', variant: 'destructive' });
    } finally {
      setActionPending(null);
    }
  };

  const vetoWindowDeadline = (createdAt: string) => {
    const deadline = new Date(createdAt).getTime() + 48 * 60 * 60 * 1000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { expired: true, label: 'Window expired' };
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    return { expired: false, label: `${hours}h ${mins}m remaining` };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading pending pods...</span>
      </div>
    );
  }

  if (pods.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-medium">No pods pending review</p>
          <p className="text-sm text-muted-foreground mt-1">
            All pod proposals have been reviewed or the veto window has passed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pending Pod Proposals</h2>
          <p className="text-sm text-muted-foreground">
            Activate to mint leadership tokens, or veto within the 48h window.
            Pods auto-activate after the window expires.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPods}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {pods.map((pod) => {
        const window = vetoWindowDeadline(pod.created_at);
        const isActivating = actionPending === pod.id + 'activate';
        const isVetoing = actionPending === pod.id + 'veto';

        return (
          <Card key={pod.id} className="p-5">
            <div className="flex items-start gap-4">
              {pod.pod_image_url && (
                <img
                  src={pod.pod_image_url}
                  alt={pod.name}
                  className="w-12 h-12 rounded-full object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-base">{pod.name}</h3>
                  {pod.parent_pod_id && pod.parent_pod_id !== '86d2d359-2e38-4267-b7b7-c7f6155063e2' && (
                    <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200">Sub-pod</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {window.label}
                  </Badge>
                  {window.expired && (
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Auto-activates on next call
                    </Badge>
                  )}
                </div>

                {pod.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {pod.description}
                  </p>
                )}

                <div className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium block mb-1">Proposed by:</span>
                  <ProfileChip address={pod.created_by_address} getProfile={getProfile} />
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="font-medium block mb-1">Leaders ({pod.pod_leads?.length || 0}):</span>
                  <div className="flex flex-wrap gap-2">
                    {(pod.pod_leads || []).map((addr) => (
                      <ProfileChip key={addr} address={addr} getProfile={getProfile} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <Input
                placeholder="Veto reason (optional)"
                value={vetoReason[pod.id] || ''}
                onChange={(e) => setVetoReason((r) => ({ ...r, [pod.id]: e.target.value }))}
                className="text-sm h-8 flex-1 min-w-[160px]"
              />
              {!window.expired && (
                <Button
                  size="sm"
                  disabled={!!actionPending}
                  onClick={() => handleAction(pod.id, 'veto')}
                  style={{ backgroundColor: '#8B3A3A', color: '#FFFFFF' }}
                >
                  {isVetoing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                  Veto
                </Button>
              )}
              <Button
                size="sm"
                disabled={!!actionPending}
                onClick={() => handleAction(pod.id, 'activate')}
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
              >
                {isActivating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                Activate
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
