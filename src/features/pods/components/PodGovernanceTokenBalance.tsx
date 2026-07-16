'use client';

/**
 * PodGovernanceTokenBalance — read-only display of a member's balance of a pod's
 * registered community governance token (e.g. $TGN for TreeGens).
 *
 * Scope/posture (501(c)(3)):
 *   - Pod-scoped: only renders for a pod that has a gating_enabled governance
 *     token in the tokens registry.
 *   - Read-only governance-eligibility SIGNAL — NOT a portfolio/holding. There is
 *     deliberately no buy / swap / transfer affordance. The platform never issues,
 *     holds, or exchanges third-party community tokens.
 *
 * Reads only the current user's wallet(s), never the member list. When the pod
 * has External Wallet Linking enabled (pod_modules.external_wallet_linking_enabled),
 * the balance sums the user's SpiritDAO wallet + verified linked wallets —
 * mirroring walletsForBalanceCheck() so the number shown matches what
 * eligibility checks and vote snapshots actually count.
 */

import React, { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { Coins } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

interface GovToken {
  name: string;
  address: string;
  decimals: number;
}

interface PodGovernanceTokenBalanceProps {
  /** The current member's wallet address. */
  walletAddress?: string;
  /** The pod this chip is shown in. Scopes the token to this community's token
   *  (owner_pod_id) plus any platform-wide token, so $TGN only shows for TreeGens. */
  podId?: string;
  /** Optional: restrict to a specific token contract; otherwise shows the first
   *  gating_enabled governance token scoped to this pod. */
  contractAddress?: string;
}

export const PodGovernanceTokenBalance: React.FC<
  PodGovernanceTokenBalanceProps
> = ({ walletAddress, podId, contractAddress }) => {
  const publicClient = usePublicClient();
  const [token, setToken] = useState<GovToken | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [includesLinked, setIncludesLinked] = useState(false);

  // Load the governance token metadata from the registry (gating_enabled only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('tokens')
        .select('name, contract_address, decimals, owner_pod_id')
        .eq('is_active', true)
        .eq('gating_enabled', true)
        .eq('token_type', 'erc20')
        .or(
          podId
            ? `owner_pod_id.is.null,owner_pod_id.eq.${podId}`
            : 'owner_pod_id.is.null',
        );

      if (contractAddress) {
        query = query.ilike('contract_address', contractAddress);
      }

      const { data } = await query.limit(1);
      const row = data?.[0];
      if (!cancelled && row?.contract_address) {
        setToken({
          name: row.name,
          address: row.contract_address,
          decimals: typeof row.decimals === 'number' ? row.decimals : 18,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractAddress, podId]);

  // Read the on-chain balance for the current user's wallet(s). When the pod
  // counts linked wallets, sum across them (self ∪ the user's user_wallets rows
  // via /api/auth/linked-wallets — the client-side mirror of
  // walletsForBalanceCheck). Any failure falls back to the single wallet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !walletAddress || !publicClient) return;

      const addresses = new Set<string>([walletAddress.toLowerCase()]);
      let linked = false;
      try {
        if (podId) {
          const { data: mod } = await supabase
            .from('pod_modules')
            .select('external_wallet_linking_enabled')
            .eq('pod_id', podId)
            .maybeSingle();
          if (mod?.external_wallet_linking_enabled === true) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              const res = await fetch('/api/auth/linked-wallets', {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (res.ok) {
                const body = await res.json();
                for (const w of body.wallets ?? []) {
                  if (w?.walletAddress) {
                    addresses.add(String(w.walletAddress).toLowerCase());
                  }
                }
                linked = addresses.size > 1;
              }
            }
          }
        }
      } catch {
        // Fall back to the single wallet — never block the chip on this.
      }

      try {
        let raw = 0n;
        for (const addr of addresses) {
          raw += (await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [addr as `0x${string}`],
          })) as bigint;
        }
        const human = Number(raw) / 10 ** token.decimals;
        if (!cancelled) {
          setIncludesLinked(linked);
          setBalance(
            human.toLocaleString(undefined, { maximumFractionDigits: 2 }),
          );
        }
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, walletAddress, publicClient, podId]);

  if (!token || balance === null) return null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
      style={{ backgroundColor: '#E8F1EE', color: '#1F453A' }}
      title="Read-only governance eligibility signal — not a platform-held balance"
    >
      <Coins className="h-4 w-4" />
      <span className="font-medium">
        {token.name}: {balance}
      </span>
      <span className="text-xs opacity-70">
        {includesLinked
          ? 'governance eligibility · incl. linked wallets'
          : 'governance eligibility'}
      </span>
    </div>
  );
};

export default PodGovernanceTokenBalance;
