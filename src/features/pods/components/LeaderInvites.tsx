'use client';

// Pod leader invitations (see src/lib/podLeaderInvites.ts).
//   - LeaderInviteBanner: the invited member's Accept / Decline card.
//   - LeaderInvitesPanel: leaders invite co-leaders and see open invitations.
// Nobody becomes a leader until they accept; in a pod with several leaders,
// an accepted invitation still needs a majority of leader votes.

import { useCallback, useEffect, useState } from 'react';
import { Crown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { UserSelector } from './UserSelector';

interface MyInvite { id: string; invitedBy: string | null; invitedAt: string }
interface OpenInvite { id: string; address: string; invitedBy: string | null; invitedAt: string }

function useLeaderInvites(podId: string) {
  const [myInvite, setMyInvite] = useState<MyInvite | null>(null);
  const [invites, setInvites] = useState<OpenInvite[]>([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/pods/${podId}/leader-invites`, { headers: await ensureAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setMyInvite(data.myInvite ?? null);
      setInvites(data.invites ?? []);
    } catch {
      /* non-critical: the card simply doesn't show */
    }
  }, [podId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { myInvite, invites, reload };
}

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function LeaderInviteBanner({ podId, podName, onBecameLeader }: {
  podId: string;
  podName: string;
  onBecameLeader?: () => void;
}) {
  const { myInvite, reload } = useLeaderInvites(podId);
  const { getProfile } = useProfiles(myInvite?.invitedBy ? [myInvite.invitedBy] : []);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!myInvite) return null;
  const inviter = myInvite.invitedBy ? getProfile(myInvite.invitedBy) : null;
  const inviterName = inviter?.first_name
    ? `${inviter.first_name} ${inviter.last_name ?? ''}`.trim()
    : myInvite.invitedBy ? shortAddress(myInvite.invitedBy) : 'A leader';

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pods/${podId}/leader-invites/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await ensureAuthHeaders()) },
        body: JSON.stringify({ inviteId: myInvite.id, accept }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.outcome === 'leader') {
        toast({ title: `You're now a leader of ${podName}` });
        onBecameLeader?.();
      } else if (data.outcome === 'awaiting_votes') {
        toast({ title: 'Invitation accepted', description: 'The other leaders will vote to confirm you as a co-leader.' });
      } else {
        toast({ title: 'Invitation declined' });
      }
      await reload();
    } catch (err) {
      toast({ title: 'Could not respond to the invitation', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4" style={{ borderColor: '#6A5F7A', backgroundColor: '#F4F1F6' }}>
      <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Crown className="h-5 w-5 mt-0.5 shrink-0" style={{ color: '#6A5F7A' }} />
          <div>
            <div className="font-medium">You're invited to co-lead {podName}</div>
            <div className="text-sm" style={{ color: '#5B6874' }}>
              {inviterName} invited you to become a leader. Leaders share responsibility for the pod's members, governance and funds.
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" disabled={busy} onClick={() => respond(false)}>Decline</Button>
          <Button disabled={busy} onClick={() => respond(true)}>Accept</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeaderInvitesPanel({ podId, leaders }: { podId: string; leaders: string[] }) {
  const { invites, reload } = useLeaderInvites(podId);
  const { getProfile } = useProfiles(invites.map((i) => i.address));
  const { toast } = useToast();
  const [invitee, setInvitee] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!invitee) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pods/${podId}/leader-invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await ensureAuthHeaders()) },
        body: JSON.stringify({ invitees: [invitee] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.invited?.length) {
        toast({ title: 'Invitation sent', description: 'They become a co-leader once they accept.' });
        setInvitee('');
      } else {
        toast({ title: 'No invitation sent', description: data.skipped?.[0]?.reason ?? 'Nothing to send', variant: 'destructive' });
      }
      await reload();
    } catch (err) {
      toast({ title: 'Could not send the invitation', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Invite a co-leader
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm" style={{ color: '#5B6874' }}>
          They become a leader only after accepting. With more than one leader, a majority of leaders must agree;
          your invitation counts as your vote.
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <UserSelector
              value={invitee}
              onChange={setInvitee}
              placeholder="Search by name or paste wallet address..."
              excludeAddresses={[...leaders, ...invites.map((i) => i.address)]}
            />
          </div>
          <Button disabled={busy || !invitee} onClick={send}>Invite</Button>
        </div>
        {invites.length > 0 && (
          <div className="text-sm">
            <div className="font-medium mb-1">Waiting for a reply</div>
            <ul className="space-y-1">
              {invites.map((i) => {
                const p = getProfile(i.address);
                return (
                  <li key={i.id} style={{ color: '#5B6874' }}>
                    {p?.first_name ? `${p.first_name} ${p.last_name ?? ''}`.trim() : shortAddress(i.address)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
