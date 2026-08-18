// scripts/migrate-agent-wallets.mjs
//
// Congregant architecture Phase 1: migrate every pod agent from its legacy
// derived pseudo-address (0xca10 + pod UUID) to a real CDP smart wallet, and
// register it in the on-chain AgentRegistry.
//
// For each pod with community_agent_enabled = true:
//   1. Derive the agent's deterministic signer (AGENT_WALLET_MASTER_KEY + podId)
//      and resolve its CDP smart wallet address
//   2. Update community_agent_config (agent_wallet → real, legacy_agent_wallet kept)
//   3. Move the agent's user_profiles row to the new address
//   4. Rewrite historical attribution (forum threads/posts, chat messages,
//      events, explorer events) from the legacy address to the real one,
//      so the agent's history stays unified under a single identity
//   5. Register the address in AgentRegistry (gasless, via backend admin
//      smart wallet) — skipped with --skip-onchain or if the registry env
//      var is unset
//
// Usage:
//   node scripts/migrate-agent-wallets.mjs --dry-run     # report only, no writes
//   node scripts/migrate-agent-wallets.mjs               # execute
//   node scripts/migrate-agent-wallets.mjs --skip-onchain
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   AGENT_WALLET_MASTER_KEY, CDP_API_KEY, EXECUTIVE_MINTING_PRIVATE_KEY
// For on-chain registration: NEXT_PUBLIC_AGENT_REGISTRY, POD_ADMIN_PRIVATE_KEY,
//   NEXT_PUBLIC_PAYMASTER

import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
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
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_ONCHAIN = process.argv.includes('--skip-onchain');

const ADMIN_SMART_WALLET = '0x05c06af9fe1a996144902D9571d1d2783866cF63';
const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

const AGENT_REGISTRY_ABI = parseAbi([
  'function registerAgent(address agent, bytes32 podId) external',
  'function isRegistered(address account) external view returns (bool)',
]);

// Attribution rewrite targets: [table, address column]
const ATTRIBUTION_TABLES = [
  ['forum_threads', 'author_address'],
  ['forum_posts', 'author_address'],
  ['chat_messages', 'sender_wallet_id'],
  ['events', 'creator_address'],
  ['explorer_events', 'actor'],
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

/** Mirrors src/services/communityAgent/types.ts deriveAgentWallet() */
function deriveLegacyWallet(podId) {
  const hex = podId.replace(/-/g, '');
  return `0x${`ca10${hex}`.padEnd(40, '0')}`.toLowerCase();
}

/** Mirrors src/services/communityAgent/agentWalletService.ts */
function deriveAgentSignerKey(podId) {
  const master = requireEnv('AGENT_WALLET_MASTER_KEY');
  for (let counter = 0; counter < 256; counter++) {
    const digest = createHmac('sha256', master)
      .update(`agent-signer:v1:${podId}:${counter}`)
      .digest('hex');
    const key = BigInt(`0x${digest}`);
    if (key > 0n && key < SECP256K1_N) return `0x${digest}`;
  }
  throw new Error('Failed to derive valid signer key');
}

function podIdToBytes32(podId) {
  return `0x${podId.replace(/-/g, '').toLowerCase().padStart(64, '0')}`;
}

function configureCdp() {
  const apiKeyName = requireEnv('CDP_API_KEY');
  let privateKey = requireEnv('EXECUTIVE_MINTING_PRIVATE_KEY');
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  Coinbase.configure({ apiKeyName, privateKey });
}

/** createSmartWallet is not idempotent — resolve an existing wallet by owner */
async function findSmartWalletByOwner(ownerAddress) {
  const client = Coinbase.apiClients?.smartWallet;
  if (!client?.listSmartWallets) throw new Error('CDP smartWallet API client unavailable');
  let page;
  do {
    const res = await client.listSmartWallets(100, page);
    for (const w of res.data?.data ?? []) {
      if (w.owners?.some((o) => o.toLowerCase() === ownerAddress.toLowerCase())) {
        return w.address;
      }
    }
    page = res.data?.has_more ? res.data?.next_page : undefined;
  } while (page);
  throw new Error(`No CDP smart wallet found for owner ${ownerAddress}`);
}

async function rewriteAttribution(oldAddress, newAddress) {
  const counts = {};
  for (const [table, column] of ATTRIBUTION_TABLES) {
    if (DRY_RUN) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, oldAddress);
      counts[table] = error ? `error: ${error.message}` : (count ?? 0);
    } else {
      const { data, error } = await supabase
        .from(table)
        .update({ [column]: newAddress })
        .eq(column, oldAddress)
        .select('id');
      counts[table] = error ? `error: ${error.message}` : (data?.length ?? 0);
    }
  }
  return counts;
}

async function moveProfile(oldAddress, newAddress) {
  const { data: oldProfile } = await supabase
    .from('user_profiles')
    .select('wallet_address, first_name')
    .eq('wallet_address', oldAddress)
    .maybeSingle();

  const { data: newProfile } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('wallet_address', newAddress)
    .maybeSingle();

  if (!oldProfile) return 'no legacy profile';
  if (DRY_RUN) return newProfile ? 'would delete legacy (new exists)' : 'would move to new address';

  if (newProfile) {
    // New profile already provisioned — drop the legacy row
    const { error } = await supabase.from('user_profiles').delete().eq('wallet_address', oldAddress);
    return error ? `error: ${error.message}` : 'deleted legacy (new exists)';
  }
  const { error } = await supabase
    .from('user_profiles')
    .update({ wallet_address: newAddress })
    .eq('wallet_address', oldAddress);
  return error ? `error: ${error.message}` : 'moved to new address';
}

async function registerOnchain(podId, agentAddress) {
  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  if (!registry) return 'skipped (NEXT_PUBLIC_AGENT_REGISTRY unset)';

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  const alreadyRegistered = await publicClient.readContract({
    address: registry,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isRegistered',
    args: [agentAddress],
  });
  if (alreadyRegistered) return 'already registered';
  if (DRY_RUN) return 'would register';

  const adminKey = requireEnv('POD_ADMIN_PRIVATE_KEY');
  const paymasterUrl = requireEnv('NEXT_PUBLIC_PAYMASTER');

  const signer = privateKeyToAccount(adminKey.startsWith('0x') ? adminKey : `0x${adminKey}`);
  const wallet = toSmartWallet({ smartWalletAddress: ADMIN_SMART_WALLET, signer });

  const callData = encodeFunctionData({
    abi: AGENT_REGISTRY_ABI,
    functionName: 'registerAgent',
    args: [agentAddress, podIdToBytes32(podId)],
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
  return receipt.transaction_hash || result.userOpHash;
}

async function main() {
  console.log(`Agent wallet migration ${DRY_RUN ? '(DRY RUN — no writes)' : '(EXECUTING)'}\n`);

  const { data: pods, error } = await supabase
    .from('pod_modules')
    .select('pod_id, community_agent_config')
    .eq('community_agent_enabled', true);

  if (error) {
    console.error('Failed to load agent pods:', error.message);
    process.exit(1);
  }
  if (!pods?.length) {
    console.log('No pods with community agent enabled. Nothing to do.');
    return;
  }

  configureCdp();

  for (const row of pods) {
    const podId = row.pod_id;
    const cfg = row.community_agent_config || {};
    const agentName = cfg.agent_name || 'Community Agent';
    console.log(`\n─── Pod ${podId} (${agentName}) ───`);

    if (cfg.agent_wallet_type === 'cdp_smart_wallet' && cfg.agent_wallet) {
      console.log(`  Already migrated: ${cfg.agent_wallet}`);
      if (!SKIP_ONCHAIN) {
        console.log(`  Registry: ${await registerOnchain(podId, cfg.agent_wallet)}`);
      }
      continue;
    }

    const legacyWallet = (cfg.agent_wallet || deriveLegacyWallet(podId)).toLowerCase();

    // Resolve the real smart wallet address (deterministic — same signer
    // always resolves to the same address, so this is safe to re-run).
    // createSmartWallet 409s if the wallet exists; fall back to listing by owner.
    const signer = privateKeyToAccount(deriveAgentSignerKey(podId));
    let newAddress;
    try {
      const wallet = await createSmartWallet({ signer });
      newAddress = wallet.address.toLowerCase();
    } catch (err) {
      if (err?.httpCode === 409 || err?.apiCode === 'already_exists') {
        newAddress = (await findSmartWalletByOwner(signer.address)).toLowerCase();
      } else {
        throw err;
      }
    }

    console.log(`  Legacy address: ${legacyWallet}`);
    console.log(`  Real address:   ${newAddress}`);

    if (!DRY_RUN) {
      const merged = {
        ...cfg,
        agent_wallet: newAddress,
        agent_wallet_type: 'cdp_smart_wallet',
        legacy_agent_wallet: legacyWallet,
        agent_wallet_created_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from('pod_modules')
        .update({ community_agent_config: merged, updated_at: new Date().toISOString() })
        .eq('pod_id', podId);
      if (updateError) {
        console.error(`  Config update FAILED: ${updateError.message} — skipping pod`);
        continue;
      }
      console.log('  Config updated.');
    }

    console.log(`  Profile: ${await moveProfile(legacyWallet, newAddress)}`);

    const counts = await rewriteAttribution(legacyWallet, newAddress);
    for (const [table, result] of Object.entries(counts)) {
      console.log(`  ${DRY_RUN ? 'Would rewrite' : 'Rewrote'} ${table}: ${result}`);
    }

    if (!SKIP_ONCHAIN) {
      const txResult = await registerOnchain(podId, newAddress);
      console.log(`  Registry: ${txResult}`);
      if (!DRY_RUN && txResult.startsWith('0x')) {
        const { data: fresh } = await supabase
          .from('pod_modules')
          .select('community_agent_config')
          .eq('pod_id', podId)
          .single();
        await supabase
          .from('pod_modules')
          .update({
            community_agent_config: {
              ...(fresh?.community_agent_config || {}),
              agent_registry_tx: txResult,
              agent_registered_at: new Date().toISOString(),
            },
          })
          .eq('pod_id', podId);
      }
    }
  }

  console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to execute.' : ''}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
