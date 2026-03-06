'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function ExecPodReviewPanel() {
  const [pods, setPods] = useState<PendingPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [vetoReason, setVetoReason] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

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

  const handleAction = async (podId: string, action: 'activate' | 'veto') => {
    setActionPending(podId + action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/pods/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          podId,
          action,
          reason: vetoReason[podId] || 'Vetoed by exec',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');

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
      <Card className="p-8 text-center">
        <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
        <p className="font-medium">No pods pending review</p>
        <p className="text-sm text-muted-foreground mt-1">
          All pod proposals have been reviewed or the veto window has passed.
        </p>
      </Card>
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

                <div className="text-xs text-muted-foreground mb-1">
                  <span className="font-medium">Proposed by:</span>{' '}
                  <span className="font-mono">{pod.created_by_address}</span>
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Leaders ({pod.pod_leads?.length || 0}):</span>{' '}
                  {(pod.pod_leads || []).map((addr) => (
                    <span key={addr} className="font-mono ml-1">
                      {addr.slice(0, 6)}…{addr.slice(-4)}
                    </span>
                  ))}
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
                  variant="outline"
                  size="sm"
                  disabled={!!actionPending}
                  onClick={() => handleAction(pod.id, 'veto')}
                  className="text-red-600 border-red-200 hover:bg-red-50"
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
                className="bg-green-700 hover:bg-green-800 text-white"
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
