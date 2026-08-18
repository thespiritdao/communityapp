// src/lib/agentGuard.ts
//
// Server-side constitutional guard (Congregant Phase 2): standing tokens
// (Proof of Curiosity, $SELF, Advocate NFT, hats) must never be issued to a
// registered AI agent address.
//
// The on-chain AgentRegistry is the source of truth. Until the token
// contracts themselves carry registry guards (they ride the next redeploys),
// every backend mint path calls this before issuing anything. The public
// /constitution monitor independently verifies the invariant held.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const REGISTRY_ABI = parseAbi([
  'function isRegistered(address account) external view returns (bool)',
]);

/** Positive results cache forever (registration is permanent); negatives briefly. */
const cache = new Map<string, { registered: boolean; checkedAt: number }>();
const NEGATIVE_TTL_MS = 60_000;

/**
 * Is this address a registered AI agent (ever)?
 *
 * Fails OPEN on RPC errors when the registry is unset or unreachable —
 * blocking all onboarding because an RPC hiccups would be worse than the
 * marginal risk, and the /constitution monitor catches anything that slips
 * through. Legacy pseudo-addresses (0xca10 + pod UUID) are recognized
 * without an RPC call.
 */
export async function isRegisteredAgent(address: string): Promise<boolean> {
  const addr = address.toLowerCase();

  // Legacy derived agent addresses are agents by construction
  if (addr.startsWith('0xca10')) return true;

  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  if (!registry || !/^0x[a-fA-F0-9]{40}$/.test(registry)) return false;

  const cached = cache.get(addr);
  if (cached && (cached.registered || Date.now() - cached.checkedAt < NEGATIVE_TTL_MS)) {
    return cached.registered;
  }

  try {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });
    const registered = await client.readContract({
      address: registry as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [addr as `0x${string}`],
    });
    cache.set(addr, { registered, checkedAt: Date.now() });
    return registered;
  } catch (err) {
    console.warn('[agentGuard] registry read failed (failing open):', err);
    return false;
  }
}

/**
 * Throw if the address is a registered agent. Use in mint paths:
 *
 *   await assertNotAgent(walletAddress, 'PoC mint');
 */
export async function assertNotAgent(address: string, context: string): Promise<void> {
  if (await isRegisteredAgent(address)) {
    throw new Error(
      `Constitutional exclusion: ${address} is a registered AI agent and cannot receive standing (${context})`,
    );
  }
}
