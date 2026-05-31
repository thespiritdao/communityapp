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
 * Single on-chain read for the current wallet (not a per-member-list read).
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
  /** Optional: restrict to a specific token contract; otherwise shows the first
   *  gating_enabled governance token in the registry. */
  contractAddress?: string;
}

export const PodGovernanceTokenBalance: React.FC<
  PodGovernanceTokenBalanceProps
> = ({ walletAddress, contractAddress }) => {
  const publicClient = usePublicClient();
  const [token, setToken] = useState<GovToken | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // Load the governance token metadata from the registry (gating_enabled only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('tokens')
        .select('name, contract_address, decimals')
        .eq('is_active', true)
        .eq('gating_enabled', true)
        .eq('token_type', 'erc20');

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
  }, [contractAddress]);

  // Read the on-chain balance once for the current wallet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !walletAddress || !publicClient) return;
      try {
        const raw = (await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        })) as bigint;
        const human = Number(raw) / 10 ** token.decimals;
        if (!cancelled) {
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
  }, [token, walletAddress, publicClient]);

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
      <span className="text-xs opacity-70">governance eligibility</span>
    </div>
  );
};

export default PodGovernanceTokenBalance;
