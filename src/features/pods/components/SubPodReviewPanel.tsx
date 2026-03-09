'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Loader2, GitBranch, RefreshCw } from 'lucide-react';
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

interface SubPodReviewPanelProps {
  podId: string;         // Parent pod UUID
  podName: string;
  canManage: boolean;    // True if the viewer wears the management hat
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
}

export function SubPodReviewPanel({ podId, podName, canManage }: SubPodReviewPanelProps) {
  const [pods, setPods] = useState<PendingPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [vetoReason, setVetoReason] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

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

      const res = await fetch(`/api/pods/review?scope=pod&parentId=${podId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      setPods(json.pods || []);
    } catch {
      toastRef.current({ title: 'Failed to load pending sub-pods', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => { fetchPods(); }, [fetchPods]);

  const handleAction = async (subPodId: string, action: 'activate' | 'veto') => {
    setActionPending(subPodId + action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Step 1: authorize + execute on-chain server-side (admin EOA owns all managers)
      const authRes = await fetch('/api/pods/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          podId: subPodId,
          action: 'authorize',
          pendingAction: action,
          reason: vetoReason[subPodId] || 'Vetoed by pod leader',
        }),
      });
      const authJson = await authRes.json();
      if (!authRes.ok) throw new Error(authJson.error || 'Action failed');

      // Step 2: record DB update (on-chain tx already landed, hash returned by server)
      const dbRes = await fetch('/api/pods/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          podId: subPodId,
          action: 'dbUpdate',
          pendingAction: action,
          txHash: authJson.txHash,
        }),
      });
      const dbJson = await dbRes.json();
      if (!dbRes.ok) throw new Error(dbJson.error || 'DB update failed');

      toast({
        title: action === 'activate'
          ? 'Sub-pod activated — leadership tokens minted'
          : 'Sub-pod vetoed',
      });
      fetchPods();
    } catch (e: any) {
      toast({ title: e.message || 'Action failed', variant: 'destructive' });
    } finally {
      setActionPending(null);
    }
  };

  const vetoWindowLabel = (createdAt: string) => {
    const deadline = new Date(createdAt).getTime() + 48 * 60 * 60 * 1000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { expired: true, label: 'Window expired — auto-activating soon' };
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    return { expired: false, label: `${hours}h ${mins}m remaining` };
  };

  if (!canManage) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Only pod leaders can review sub-pod proposals.</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading pending sub-pods...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Sub-Pod Proposals
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Activate to mint leadership tokens, or veto within the 48h window.
            Proposals auto-activate after the window expires.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPods}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {pods.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-medium">No sub-pods pending review</p>
          <p className="text-sm text-muted-foreground mt-1">
            All sub-pod proposals under {podName} have been reviewed.
          </p>
        </Card>
      ) : (
        pods.map((pod) => {
          const window = vetoWindowLabel(pod.created_at);
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold">{pod.name}</h4>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {window.label}
                    </Badge>
                  </div>

                  {pod.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{pod.description}</p>
                  )}

                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium block mb-1">Leaders:</span>
                    <div className="flex flex-wrap gap-2">
                      {pod.pod_leads?.map((addr) => (
                        <ProfileChip key={addr} address={addr} getProfile={getProfile} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    <Button
                      size="sm"
                      style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                      onClick={() => handleAction(pod.id, 'activate')}
                      disabled={!!actionPending}
                    >
                      {isActivating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                      Activate
                    </Button>

                    {!window.expired && (
                      <>
                        <Input
                          placeholder="Veto reason (optional)"
                          value={vetoReason[pod.id] || ''}
                          onChange={(e) => setVetoReason((prev) => ({ ...prev, [pod.id]: e.target.value }))}
                          className="h-8 text-sm w-48"
                        />
                        <Button
                          size="sm"
                          style={{ backgroundColor: '#8B3A3A', color: '#FFFFFF' }}
                          onClick={() => handleAction(pod.id, 'veto')}
                          disabled={!!actionPending}
                        >
                          {isVetoing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                          Veto
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
