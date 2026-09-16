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
//
// Audit Phase 2 (2026-09-16): this guard now FAILS CLOSED. A transient RPC
// error used to make every address look human, which is exactly the moment
// the guard exists for. Results are cached for 24 hours (positives forever —
// registration is permanent), and when the registry is unreachable a cached
// answer of any age is preferred over guessing. With no cached answer at
// all, the mint is refused with a clear reason rather than allowed.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const REGISTRY_ABI = parseAbi([
  'function isRegistered(address account) external view returns (bool)',
]);

/** Positive results cache forever (registration is permanent); negatives for a day. */
const cache = new Map<string, { registered: boolean; checkedAt: number }>();
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

/** Thrown when the registry cannot be consulted and nothing is cached. */
export class AgentRegistryUnavailableError extends Error {
  constructor(address: string, cause: unknown) {
    super(
      `Agent registry unreachable and no cached status for ${address}; refusing to issue standing ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
    this.name = 'AgentRegistryUnavailableError';
  }
}

function registryAddress(): `0x${string}` | null {
  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  if (!registry || !/^0x[a-fA-F0-9]{40}$/.test(registry)) return null;
  return registry as `0x${string}`;
}

/**
 * Is this address a registered AI agent (ever)?
 *
 * Legacy pseudo-addresses (0xca10 + pod UUID) are agents by construction and
 * need no RPC call. With no registry configured, nothing can be an agent.
 * Throws AgentRegistryUnavailableError when the chain cannot be read and no
 * cached answer exists — callers must treat that as "do not mint".
 */
export async function isRegisteredAgent(address: string): Promise<boolean> {
  const addr = address.toLowerCase();

  if (addr.startsWith('0xca10')) return true;

  const registry = registryAddress();
  if (!registry) return false;

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
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [addr as `0x${string}`],
    });
    cache.set(addr, { registered, checkedAt: Date.now() });
    return registered;
  } catch (err) {
    if (cached) {
      // A stale answer beats a guess: registration never reverts, so a stale
      // positive is still true and a stale negative is at worst a day old.
      console.warn(`[agentGuard] registry read failed; using cached status for ${addr}:`, err);
      return cached.registered;
    }
    console.error('[agentGuard] registry read failed with nothing cached (failing closed):', err);
    throw new AgentRegistryUnavailableError(addr, err);
  }
}

/**
 * Throw if the address is a registered agent — or if that cannot be
 * determined. Use in mint paths:
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

/** Test seam: forget cached statuses. */
export function _resetAgentGuardCache(): void {
  cache.clear();
}
