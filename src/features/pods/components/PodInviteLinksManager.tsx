'use client';
import { appUrl } from '@/config/deployment';

/**
 * PodInviteLinksManager — leader tool on the pod Members tab.
 *  - Create shareable invite links (member roles only; expiry + max uses)
 *  - List / copy / revoke links
 *  - "Pending mints" queue: accepted invitees whose on-chain member hat
 *    hasn't been minted yet — one gasless batch-mint click (Option A of
 *    docs/spec-email-invites-and-pod-links.md).
 */

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, parseAbi } from 'viem';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
import { supabase } from '@/lib/supabase';
import { Link2, Copy, Check, XCircle, Users } from 'lucide-react';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

interface PodInviteLinksManagerProps {
  podId: string;
  canManage: boolean;
}

interface InviteLink {
  id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
}

interface PendingMint {
  id: string;
  wallet: string;
  hat_id: string;
  accepted_at: string;
}

const HATS_ADDRESS = process.env.NEXT_PUBLIC_HATS_CONTRACT as
  | `0x${string}`
  | undefined;

const HATS_ABI = parseAbi([
  'function mintHat(uint256 _hatId, address _wearer) external returns (bool)',
]);

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function PodInviteLinksManager({
  podId,
  canManage,
}: PodInviteLinksManagerProps) {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();

  const [links, setLinks] = useState<InviteLink[]>([]);
  const [pending, setPending] = useState<PendingMint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [minting, setMinting] = useState(false);
  const [expiresDays, setExpiresDays] = useState('30');
  const [maxUses, setMaxUses] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`/api/pod-invites?podId=${podId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      setLinks(body.links || []);
      setPending(body.pendingMints || []);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const handleCreate = useCallback(async () => {
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Please sign in.');
      const res = await fetch('/api/pod-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          podId,
          expiresInDays: expiresDays ? Number(expiresDays) : undefined,
          maxUses: maxUses ? Number(maxUses) : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create link.');
      setNotice('Link created — copy it below.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not create link.');
    } finally {
      setCreating(false);
    }
  }, [podId, expiresDays, maxUses, load]);

  const handleRevoke = useCallback(
    async (linkId: string) => {
      setError(null);
      try {
        const token = await getAuthToken();
        if (!token) return;
        await fetch('/api/pod-invites', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ linkId }),
        });
        await load();
      } catch {
        setError('Could not revoke the link.');
      }
    },
    [load],
  );

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard
      .writeText(`${appUrl()}/?invite=${code}`)
      .then(() => {
        setCopied(code);
        setTimeout(() => setCopied(null), 2000);
      });
  }, []);

  const handleBatchMint = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!HATS_ADDRESS) {
      setError('Hats contract not configured.');
      return;
    }
    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    if (!smartAccount) {
      setError('Connect your smart wallet to mint member roles.');
      return;
    }
    setMinting(true);
    try {
      const calls = pending.map((p) => ({
        to: HATS_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: HATS_ABI,
          functionName: 'mintHat',
          args: [BigInt(p.hat_id), p.wallet as `0x${string}`],
        }),
      }));

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls,
        useCdpPaymaster: true,
      });

      const token = await getAuthToken();
      await fetch('/api/pod-invites/mark-minted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          acceptanceIds: pending.map((p) => p.id),
          txHash: (result as any)?.userOperationHash || null,
        }),
      });

      setNotice(
        `Minted ${pending.length} member role${pending.length === 1 ? '' : 's'} on-chain.`,
      );
      await load();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Batch mint failed.');
    } finally {
      setMinting(false);
    }
  }, [pending, currentUser, sendUserOperation, load]);

  if (!canManage) return null;

  const activeLinks = links.filter(
    (l) =>
      !l.revoked_at &&
      (!l.expires_at || new Date(l.expires_at) > new Date()) &&
      (l.max_uses == null || l.use_count < l.max_uses),
  );
  const inactiveCount = links.length - activeLinks.length;

  return (
    <div className="p-6 border-t">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-1">
        <Link2 className="h-5 w-5" />
        Invite Links
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Share a link that lets people join this pod as members. New arrivals
        are members immediately; their on-chain member role is minted in
        batches below.
      </p>

      {/* Pending mints queue */}
      {pending.length > 0 && (
        <div className="mb-5 p-4 rounded-lg border border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-amber-900 font-medium">
              <Users className="h-4 w-4" />
              {pending.length} new member{pending.length === 1 ? '' : 's'} awaiting
              on-chain role mint
            </div>
            <button
              onClick={handleBatchMint}
              disabled={minting}
              className="px-4 py-2 rounded-md text-sm font-medium text-white"
              style={{ background: '#2F5D50', opacity: minting ? 0.7 : 1 }}
            >
              {minting ? 'Minting…' : 'Mint Roles'}
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs text-amber-800">
                {/* Name card when the joiner has a profile; falls back to the
                    formatted address automatically. */}
                <UserProfileDisplay walletAddress={p.wallet} size="sm" showModal={true} />
                <span className="text-amber-700">
                  — accepted {new Date(p.accepted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create link */}
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Expires</label>
          <select
            value={expiresDays}
            onChange={(e) => setExpiresDays(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-white"
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="">Never</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max uses</label>
          <select
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Unlimited</option>
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ background: '#2F5D50', opacity: creating ? 0.7 : 1 }}
        >
          {creating ? 'Creating…' : 'Create invite link'}
        </button>
      </div>

      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      {notice && <p className="text-sm mb-2" style={{ color: '#2F5D50' }}>{notice}</p>}

      {/* Active links */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : activeLinks.length === 0 ? (
        <p className="text-sm text-gray-500">No active invite links.</p>
      ) : (
        <ul className="space-y-2">
          {activeLinks.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 flex-wrap"
            >
              <div className="min-w-0">
                <span className="font-mono text-sm">{l.code}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {l.use_count} use{l.use_count === 1 ? '' : 's'}
                  {l.max_uses != null && ` / ${l.max_uses}`}
                  {l.expires_at &&
                    ` · expires ${new Date(l.expires_at).toLocaleDateString()}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(l.code)}
                  className="p-1.5 rounded-md hover:bg-gray-200"
                  title="Copy link"
                >
                  {copied === l.code ? (
                    <Check className="h-4 w-4" style={{ color: '#2F5D50' }} />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-600" />
                  )}
                </button>
                <button
                  onClick={() => handleRevoke(l.id)}
                  className="p-1.5 rounded-md hover:bg-gray-200"
                  title="Revoke link"
                >
                  <XCircle className="h-4 w-4 text-red-700" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {inactiveCount > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {inactiveCount} expired/revoked link{inactiveCount === 1 ? '' : 's'} hidden.
        </p>
      )}
    </div>
  );
}

export default PodInviteLinksManager;
