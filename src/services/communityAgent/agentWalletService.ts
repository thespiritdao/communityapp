// src/services/communityAgent/agentWalletService.ts
//
// Real on-chain identity for pod agents (Congregant architecture, Phase 1).
//
// Each pod's agent gets a genuine CDP smart wallet instead of the legacy
// derived pseudo-address, and is registered in the on-chain AgentRegistry so
// its status as an artificial member is publicly verifiable on Basescan.
//
// Key custody: the agent's signer key is derived deterministically from a
// single master secret (AGENT_WALLET_MASTER_KEY) + pod ID via HMAC-SHA256.
// No per-agent key material is stored anywhere — the smart wallet address in
// community_agent_config is pure public data, and every signer is recoverable
// from the one env secret.

import { createHmac } from 'crypto';
import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  Coinbase,
  createSmartWallet,
  toSmartWallet,
  sendUserOperation,
  waitForUserOperation,
} from '@coinbase/coinbase-sdk';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { deriveAgentWallet } from './types';
import { ensureAgentProfile } from './configService';

export const AGENT_REGISTRY_ABI = parseAbi([
  'function registerAgent(address agent, bytes32 podId) external',
  'function deactivateAgent(address agent) external',
  'function reactivateAgent(address agent) external',
  'function isAgent(address account) external view returns (bool)',
  'function isRegistered(address account) external view returns (bool)',
  'function agentInfo(address account) external view returns (bytes32 podId, bool registered, bool active, uint64 registeredAt)',
  'function agentForPod(bytes32 podId) external view returns (address)',
]);

/** Backend admin smart wallet (same account used by mint-poc / self mint routes) */
const ADMIN_SMART_WALLET = '0x05c06af9fe1a996144902D9571d1d2783866cF63' as const;

/** secp256k1 curve order — derived keys must be in (0, n) */
const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

export interface AgentIdentity {
  /** Real smart wallet address if provisioned, else legacy derived address */
  address: string;
  /** 'cdp_smart_wallet' once provisioned; 'legacy_pseudo' before migration */
  walletType: 'cdp_smart_wallet' | 'legacy_pseudo';
  /** Pre-migration derived address (kept for historical attribution) */
  legacyAddress: string;
  registeredOnchain: boolean;
  activeOnchain: boolean;
  registryTxHash: string | null;
}

/** Pod UUID → bytes32 (32 hex chars left-padded to 64) for AgentRegistry calls */
export function podIdToBytes32(podId: string): `0x${string}` {
  const hex = podId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Invalid pod UUID: ${podId}`);
  }
  return `0x${hex.padStart(64, '0')}` as `0x${string}`;
}

/**
 * Deterministically derive the agent's signer key from the master secret.
 * HMAC-SHA256(master, "agent-signer:v1:{podId}:{counter}") — the counter
 * increments in the (astronomically unlikely) case the digest falls outside
 * the secp256k1 key range.
 */
function deriveAgentSignerKey(podId: string): `0x${string}` {
  const master = process.env.AGENT_WALLET_MASTER_KEY;
  if (!master) {
    throw new Error('AGENT_WALLET_MASTER_KEY not configured');
  }

  for (let counter = 0; counter < 256; counter++) {
    const digest = createHmac('sha256', master)
      .update(`agent-signer:v1:${podId}:${counter}`)
      .digest('hex');
    const key = BigInt(`0x${digest}`);
    if (key > 0n && key < SECP256K1_N) {
      return `0x${digest}` as `0x${string}`;
    }
  }
  throw new Error('Failed to derive valid signer key'); // unreachable in practice
}

function configureCdp(): void {
  const apiKeyName = process.env.CDP_API_KEY;
  let privateKey = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;
  if (!apiKeyName || !privateKey) {
    throw new Error('CDP credentials not configured (CDP_API_KEY / EXECUTIVE_MINTING_PRIVATE_KEY)');
  }
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  Coinbase.configure({ apiKeyName, privateKey });
}

function getRegistryAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('NEXT_PUBLIC_AGENT_REGISTRY not configured');
  }
  return address as `0x${string}`;
}

function getPublicClient() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

/**
 * Resolve an already-created CDP smart wallet by its owner (signer) address.
 * createSmartWallet is not idempotent — a second call for the same signer
 * returns 409 already_exists — so we list and match on owner instead.
 */
async function findSmartWalletByOwner(ownerAddress: string): Promise<string> {
  const client = (Coinbase as any).apiClients?.smartWallet;
  if (!client?.listSmartWallets) {
    throw new Error('CDP smartWallet API client unavailable');
  }
  let page: string | undefined;
  do {
    const res = await client.listSmartWallets(100, page);
    for (const w of res.data?.data ?? []) {
      if (w.owners?.some((o: string) => o.toLowerCase() === ownerAddress.toLowerCase())) {
        return w.address;
      }
    }
    page = res.data?.has_more ? res.data?.next_page : undefined;
  } while (page);
  throw new Error(`No CDP smart wallet found for owner ${ownerAddress}`);
}

/**
 * Get (or provision) the real smart wallet for a pod's agent.
 *
 * Idempotent: the derived signer is deterministic, so createSmartWallet on the
 * same signer resolves to a stable address; once persisted we return the
 * stored address without touching CDP.
 *
 * Persists to community_agent_config:
 *   agent_wallet          — the real smart wallet address (consumed everywhere)
 *   agent_wallet_type     — 'cdp_smart_wallet'
 *   legacy_agent_wallet   — the previous derived/pseudo address, for attribution
 */
export async function getOrCreateAgentWallet(podId: string): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config')
    .eq('pod_id', podId)
    .single();

  const cfg = row?.community_agent_config || {};

  if (cfg.agent_wallet_type === 'cdp_smart_wallet' && cfg.agent_wallet) {
    return cfg.agent_wallet as string;
  }

  configureCdp();
  const signer = privateKeyToAccount(deriveAgentSignerKey(podId));
  let address: string;
  try {
    const wallet = await createSmartWallet({ signer });
    address = wallet.address.toLowerCase();
  } catch (err: any) {
    if (err?.httpCode === 409 || err?.apiCode === 'already_exists') {
      address = (await findSmartWalletByOwner(signer.address)).toLowerCase();
    } else {
      throw err;
    }
  }

  const legacyWallet = cfg.agent_wallet || deriveAgentWallet(podId);

  const merged = {
    ...cfg,
    agent_wallet: address,
    agent_wallet_type: 'cdp_smart_wallet',
    legacy_agent_wallet: legacyWallet,
    agent_wallet_created_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('pod_modules')
    .update({ community_agent_config: merged, updated_at: new Date().toISOString() })
    .eq('pod_id', podId);

  // The agent's display profile follows it to the new address
  await ensureAgentProfile(address, cfg.agent_name || 'Community Agent', cfg.agent_avatar_url || null);

  console.log(`✅ Agent wallet provisioned for pod ${podId}: ${address} (legacy: ${legacyWallet})`);
  return address;
}

/**
 * Register the agent's address in the on-chain AgentRegistry.
 *
 * Sent from the backend admin smart wallet (authorized caller / exec hat
 * wearer), gasless via the Coinbase paymaster once the registry contract is
 * whitelisted. Idempotent: skips if the address is already registered.
 */
export async function registerAgentOnchain(podId: string, agentAddress: string): Promise<string | null> {
  const registry = getRegistryAddress();
  const publicClient = getPublicClient();

  const alreadyRegistered = await publicClient.readContract({
    address: registry,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isRegistered',
    args: [agentAddress as `0x${string}`],
  });
  if (alreadyRegistered) {
    console.log(`ℹ️ Agent ${agentAddress} already registered on-chain`);
    return null;
  }

  const adminKey = process.env.POD_ADMIN_PRIVATE_KEY;
  const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!adminKey) throw new Error('POD_ADMIN_PRIVATE_KEY not configured');
  if (!paymasterUrl) throw new Error('NEXT_PUBLIC_PAYMASTER not configured');

  configureCdp();
  const signer = privateKeyToAccount(
    adminKey.startsWith('0x') ? (adminKey as `0x${string}`) : `0x${adminKey}`,
  );
  const wallet = toSmartWallet({ smartWalletAddress: ADMIN_SMART_WALLET, signer });

  const callData = encodeFunctionData({
    abi: AGENT_REGISTRY_ABI,
    functionName: 'registerAgent',
    args: [agentAddress as `0x${string}`, podIdToBytes32(podId)],
  });

  const result = await sendUserOperation(wallet, {
    calls: [{ to: registry, data: callData, value: 0n }],
    chainId: 8453,
    paymasterUrl,
  });

  const receipt = await waitForUserOperation({
    userOpHash: result.userOpHash,
    smartWalletAddress: wallet.address,
  });

  const txHash = (receipt as any).transaction_hash || result.userOpHash;

  // Record the registration tx alongside the wallet config
  const { data: row } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config')
    .eq('pod_id', podId)
    .single();
  const cfg = row?.community_agent_config || {};
  await supabaseAdmin
    .from('pod_modules')
    .update({
      community_agent_config: {
        ...cfg,
        agent_registry_tx: txHash,
        agent_registered_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('pod_id', podId);

  console.log(`✅ Agent ${agentAddress} registered on-chain (pod ${podId}): ${txHash}`);
  return txHash;
}

/** Is this wallet registered in the on-chain AgentRegistry right now? */
export async function isAgentRegisteredOnchain(agentAddress: string): Promise<boolean> {
  return getPublicClient().readContract({
    address: getRegistryAddress(),
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isRegistered',
    args: [agentAddress as `0x${string}`],
  });
}

/**
 * Register the agent and do not return until the chain agrees — or until the
 * attempts are spent, in which case the failure is recorded on the config
 * (`agent_registration_pending`) and rethrown. Registration used to be
 * fire-and-forget; an agent could then post for as long as the registration
 * silently failed, which is exactly what the constitution monitor promises
 * cannot happen. (Audit Phase 2, step 2.)
 */
export async function ensureAgentRegistered(
  podId: string,
  agentAddress: string,
  attempts = 3,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await registerAgentOnchain(podId, agentAddress);
      if (await isAgentRegisteredOnchain(agentAddress)) {
        await patchAgentConfig(podId, { agent_registration_pending: false, agent_registration_error: null });
        return;
      }
      lastError = new Error('registration transaction sent but isRegistered is still false');
    } catch (err) {
      lastError = err;
      console.warn(`[agentWallet] registration attempt ${attempt}/${attempts} failed for ${agentAddress}:`, err);
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 4_000 * attempt));
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  await patchAgentConfig(podId, { agent_registration_pending: true, agent_registration_error: message });
  throw new Error(`Agent ${agentAddress} could not be registered on-chain: ${message}`);
}

async function patchAgentConfig(podId: string, patch: Record<string, unknown>): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config')
    .eq('pod_id', podId)
    .single();
  await supabaseAdmin
    .from('pod_modules')
    .update({
      community_agent_config: { ...(row?.community_agent_config || {}), ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq('pod_id', podId);
}

/**
 * Full identity view for an agent — wallet address, type, and live on-chain
 * registration status. Used by the agent identity API/UI.
 */
export async function getAgentIdentity(podId: string): Promise<AgentIdentity | null> {
  const { data: row } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_enabled, community_agent_config')
    .eq('pod_id', podId)
    .single();

  if (!row?.community_agent_enabled) return null;

  const cfg = row.community_agent_config || {};
  const legacyAddress = cfg.legacy_agent_wallet || deriveAgentWallet(podId);
  const isReal = cfg.agent_wallet_type === 'cdp_smart_wallet' && cfg.agent_wallet;
  const address = isReal ? cfg.agent_wallet : cfg.agent_wallet || legacyAddress;

  let registeredOnchain = false;
  let activeOnchain = false;

  if (isReal && process.env.NEXT_PUBLIC_AGENT_REGISTRY) {
    try {
      const publicClient = getPublicClient();
      const registry = getRegistryAddress();
      const [registered, active] = await Promise.all([
        publicClient.readContract({
          address: registry,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'isRegistered',
          args: [address as `0x${string}`],
        }),
        publicClient.readContract({
          address: registry,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'isAgent',
          args: [address as `0x${string}`],
        }),
      ]);
      registeredOnchain = registered;
      activeOnchain = active;
    } catch (err) {
      console.warn(`[agentWalletService] registry read failed for pod ${podId}:`, err);
    }
  }

  return {
    address,
    walletType: isReal ? 'cdp_smart_wallet' : 'legacy_pseudo',
    legacyAddress,
    registeredOnchain,
    activeOnchain,
    registryTxHash: cfg.agent_registry_tx || null,
  };
}
