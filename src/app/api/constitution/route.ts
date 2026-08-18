// src/app/api/constitution/route.ts
//
// GET: Public constitutional-exclusion monitor (Congregant Phase 2).
//
// For every AI agent registered in the on-chain AgentRegistry, verifies the
// four denials hold — no Proof of Curiosity, no Advocate (vote), no $SELF
// (tenure), no hats — by reading the chain directly. Anyone can call this;
// anyone can independently re-run the same reads on Basescan.
//
// Intentionally public and unauthenticated: legibility of the constitutional
// boundary is the point.

import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';
export const revalidate = 300; // cache 5 minutes

const REGISTRY_ABI = parseAbi([
  'function agentCount() view returns (uint256)',
  'function agentList(uint256) view returns (address)',
  'function agentInfo(address) view returns (bytes32 podId, bool registered, bool active, uint64 registeredAt)',
]);

const BALANCE_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const HATS_ABI = parseAbi(['function isWearerOfHat(address, uint256) view returns (bool)']);

const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

interface CheckResult {
  label: string;
  holds: boolean | null; // null = unverifiable (contract not configured)
  detail: string;
  verifyUrl: string | null;
}

function bytes32ToPodId(b32: string): string {
  const hex = b32.slice(-32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function GET() {
  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: 'Agent registry not configured' }, { status: 503 });
  }

  // batch.multicall coalesces the many per-hat/per-token reads into a few
  // multicall round-trips — without it the public RPC rate-limits this route
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org', { batch: true }),
    batch: { multicall: true },
  });

  try {
    // 1. Enumerate agents from the chain (source of truth, not the DB)
    const count = await client.readContract({
      address: registry, abi: REGISTRY_ABI, functionName: 'agentCount',
    });
    const agents: `0x${string}`[] = [];
    for (let i = 0n; i < count; i++) {
      agents.push(
        await client.readContract({
          address: registry, abi: REGISTRY_ABI, functionName: 'agentList', args: [i],
        }),
      );
    }

    // 2. Known hats (role hats + pod management/membership hats)
    const hatIds = new Map<string, string>(); // hatId → label
    const { data: roles } = await supabaseAdmin
      .from('pod_role_permissions')
      .select('role_name, token_address')
      .eq('is_active', true);
    for (const r of roles ?? []) {
      if (r.token_address?.startsWith('0x')) hatIds.set(r.token_address, r.role_name);
    }
    const { data: pods } = await supabaseAdmin
      .from('pods')
      .select('id, name, management_hat_id, membership_hat_id')
      .eq('is_active', true);
    const podNames = new Map<string, string>();
    for (const p of pods ?? []) {
      podNames.set(p.id, p.name);
      if (p.management_hat_id?.startsWith('0x')) hatIds.set(p.management_hat_id, `${p.name} (mgmt)`);
      if (p.membership_hat_id?.startsWith('0x')) hatIds.set(p.membership_hat_id, `${p.name} (member)`);
    }

    // 3. Agent display names from configs
    const { data: modules } = await supabaseAdmin
      .from('pod_modules')
      .select('pod_id, community_agent_config')
      .eq('community_agent_enabled', true);
    const nameByWallet = new Map<string, string>();
    for (const m of modules ?? []) {
      const cfg = m.community_agent_config || {};
      if (cfg.agent_wallet) nameByWallet.set(cfg.agent_wallet.toLowerCase(), cfg.agent_name || 'Community Agent');
    }

    const tokens: Array<{ key: string; label: string; address: string | undefined }> = [
      { key: 'poc', label: 'Holds no Proof of Curiosity (presence credential)', address: process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY },
      { key: 'advocate', label: 'Holds no Advocate NFT (the vote)', address: process.env.NEXT_PUBLIC_ADVOCATE },
      { key: 'self', label: 'Holds no $SELF (participation standing / tenure)', address: process.env.NEXT_PUBLIC_SELF_TOKEN },
    ];

    const results = [];
    for (const agent of agents) {
      const info = await client.readContract({
        address: registry, abi: REGISTRY_ABI, functionName: 'agentInfo', args: [agent],
      });
      const podId = bytes32ToPodId(info[0]);

      const checks: CheckResult[] = [];

      // Token balances must all be zero
      for (const t of tokens) {
        if (!t.address || !/^0x[a-fA-F0-9]{40}$/.test(t.address)) {
          checks.push({ label: t.label, holds: null, detail: 'contract not configured', verifyUrl: null });
          continue;
        }
        try {
          const bal = await client.readContract({
            address: t.address as `0x${string}`, abi: BALANCE_ABI, functionName: 'balanceOf', args: [agent],
          });
          checks.push({
            label: t.label,
            holds: bal === 0n,
            detail: `balanceOf = ${bal.toString()}`,
            verifyUrl: `https://basescan.org/token/${t.address}?a=${agent}`,
          });
        } catch {
          checks.push({ label: t.label, holds: null, detail: 'read failed', verifyUrl: null });
        }
      }

      // Wears no known hat — issued concurrently so viem coalesces into multicall
      const hatEntries = [...hatIds.entries()];
      const hatResults = await Promise.all(
        hatEntries.map(([hatId]) =>
          client
            .readContract({
              address: HATS_PROTOCOL, abi: HATS_ABI, functionName: 'isWearerOfHat', args: [agent, BigInt(hatId)],
            })
            .catch(() => null), // skip unreadable hat ids
        ),
      );
      const wornHats = hatEntries.filter((_, i) => hatResults[i] === true).map(([, label]) => label);
      const hatsChecked = hatResults.filter((r) => r !== null).length;
      checks.push({
        label: 'Wears no governance hat (role credential)',
        holds: wornHats.length === 0,
        detail: wornHats.length === 0
          ? `${hatsChecked} known hats checked`
          : `WEARING: ${wornHats.join(', ')}`,
        verifyUrl: `https://basescan.org/address/${HATS_PROTOCOL}#readContract`,
      });

      // Has never voted (DB ledger; on-chain voting also requires the Advocate
      // NFT verified above, so the exclusion chain is closed on both layers)
      const { count: voteCount } = await supabaseAdmin
        .from('governance_votes')
        .select('*', { count: 'exact', head: true })
        .ilike('voter_address', agent);
      checks.push({
        label: 'Has cast no vote',
        holds: (voteCount ?? 0) === 0,
        detail: `${voteCount ?? 0} votes in the governance ledger`,
        verifyUrl: null,
      });

      results.push({
        address: agent,
        name: nameByWallet.get(agent.toLowerCase()) || 'Unknown agent',
        podId,
        podName: podNames.get(podId) || podId,
        active: info[2],
        registeredAt: new Date(Number(info[3]) * 1000).toISOString(),
        registryUrl: `https://basescan.org/address/${registry}#readContract`,
        allHold: checks.every((c) => c.holds === true),
        checks,
      });
    }

    return NextResponse.json({
      registry,
      registryUrl: `https://basescan.org/address/${registry}`,
      agentCount: Number(count),
      checkedAt: new Date().toISOString(),
      agents: results,
    });
  } catch (err) {
    console.error('[constitution] monitor error:', err);
    return NextResponse.json({ error: 'Failed to verify constitutional invariants' }, { status: 500 });
  }
}
