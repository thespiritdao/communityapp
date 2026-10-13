'use client';

// A member leaves a pod on their own: renounce the member hat from their
// smart account (gasless), then record it via POST /api/pods/[id]/leave,
// which confirms the hat is gone on-chain first. Hidden for leaders and for
// anyone without an active membership.

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, parseAbi } from 'viem';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';

const HATS_ADDRESS = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
  '0x3bc1a0ad72417f2d411118085256fc53cbddd137') as `0x${string}`;
const RENOUNCE_ABI = parseAbi(['function renounceHat(uint256 _hatId)']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LeavePodButtonProps {
  podId: string;
  podName: string;
  onLeft?: () => void;
}

export function LeavePodButton({ podId, podName, onLeft }: LeavePodButtonProps) {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();

  const [hatId, setHatId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pods/${podId}/leave`, { headers: await ensureAuthHeaders() });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body.canLeave && body.hatId) setHatId(String(body.hatId));
      } catch {
        /* stay hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId]);

  if (!hatId) return null;

  const leave = async () => {
    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    if (!smartAccount) {
      toast({ title: 'Wallet not ready', description: 'Please try again in a moment.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [
          {
            to: HATS_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: RENOUNCE_ABI,
              functionName: 'renounceHat',
              args: [BigInt(hatId)],
            }),
          },
        ],
        useCdpPaymaster: true,
      });

      // Record it once the renounce is visible on-chain.
      for (let attempt = 0; attempt < 10; attempt++) {
        const res = await fetch(`/api/pods/${podId}/leave`, {
          method: 'POST',
          headers: await ensureAuthHeaders(),
        });
        if (res.ok) {
          toast({ title: `You have left ${podName}` });
          setOpen(false);
          setHatId(null);
          onLeft?.();
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!body?.retry) throw new Error(body?.error || `Leave failed (${res.status})`);
        await sleep(3000);
      }
      throw new Error('Your membership was given up on-chain, but recording it is taking longer than expected. Refresh in a minute.');
    } catch (err) {
      toast({
        title: 'Could not leave',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-gray-700">
        <LogOut className="w-4 h-4 mr-2" />
        Leave {podName}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave {podName}?</DialogTitle>
            <DialogDescription>
              This gives up your membership badge (&ldquo;hat&rdquo;) for {podName}. You will lose
              access to its members-only spaces. Your SpiritDAO account stays. The blockchain keeps a
              public record that you were a member and that you left; that record cannot be erased.
              To rejoin later, ask a pod leader.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Stay
            </Button>
            <Button variant="destructive" onClick={leave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default LeavePodButton;
