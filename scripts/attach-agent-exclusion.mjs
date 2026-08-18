// scripts/attach-agent-exclusion.mjs
//
// Congregant Phase 2: attach the AgentExclusionEligibilityModule to every
// live hat so agent addresses are constitutionally ineligible.
//
// For each hat found in pod_role_permissions + pods (management/membership):
//   - skip if the module is already attached or the hat is immutable
//   - check the signer is a Hats admin for the hat (isAdminOfHat)
//   - call Hats.changeHatEligibility(hatId, module)
//   - verify via viewHat
//
// Usage:
//   node scripts/attach-agent-exclusion.mjs --dry-run
//   node scripts/attach-agent-exclusion.mjs
//
// Env: NEXT_PUBLIC_AGENT_EXCLUSION_MODULE, POD_ADMIN_PRIVATE_KEY (hat admin),
//      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const HATS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

const HATS_ABI = parseAbi([
  'function viewHat(uint256) view returns (string details, uint32 maxSupply, uint32 supply, address eligibility, address toggle, string imageURI, uint16 lastHatId, bool mutable_, bool active)',
  'function isAdminOfHat(address user, uint256 hatId) view returns (bool)',
  'function changeHatEligibility(uint256 hatId, address newEligibility) external',
]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const moduleAddress = requireEnv('NEXT_PUBLIC_AGENT_EXCLUSION_MODULE');
const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

// TOP_HAT_PRIVATE_KEY (temporary — remove after use!) overrides the backend
// admin key for hats only the top-hat wearer can modify.
let adminKey = process.env.TOP_HAT_PRIVATE_KEY || requireEnv('POD_ADMIN_PRIVATE_KEY');
if (!adminKey.startsWith('0x')) adminKey = `0x${adminKey}`;
const account = privateKeyToAccount(adminKey);

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

async function collectHats() {
  const hats = new Map(); // hatId → label
  const { data: roles } = await supabase
    .from('pod_role_permissions')
    .select('role_name, token_address')
    .eq('is_active', true);
  for (const r of roles ?? []) {
    if (r.token_address?.startsWith('0x')) hats.set(r.token_address, r.role_name);
  }
  const { data: pods } = await supabase
    .from('pods')
    .select('name, management_hat_id, membership_hat_id')
    .eq('is_active', true);
  for (const p of pods ?? []) {
    if (p.management_hat_id?.startsWith('0x')) hats.set(p.management_hat_id, `${p.name} (mgmt)`);
    if (p.membership_hat_id?.startsWith('0x')) hats.set(p.membership_hat_id, `${p.name} (member)`);
  }
  return hats;
}

async function main() {
  console.log(`Attach agent-exclusion module ${DRY_RUN ? '(DRY RUN)' : '(EXECUTING)'}`);
  console.log(`Module: ${moduleAddress}`);
  console.log(`Signer: ${account.address}\n`);

  const hats = await collectHats();
  let attached = 0;
  let skipped = 0;
  let blocked = 0;

  for (const [hatId, label] of hats) {
    const id = BigInt(hatId);
    let hat;
    try {
      hat = await publicClient.readContract({
        address: HATS, abi: HATS_ABI, functionName: 'viewHat', args: [id],
      });
    } catch {
      console.log(`⚠️  ${label}: viewHat failed — skipping`);
      skipped++;
      continue;
    }
    const [, , , eligibility, , , , mutable_] = hat;

    if (eligibility.toLowerCase() === moduleAddress.toLowerCase()) {
      console.log(`✓  ${label}: already attached`);
      skipped++;
      continue;
    }
    if (!mutable_) {
      console.log(`🔒 ${label}: hat is immutable — cannot attach`);
      blocked++;
      continue;
    }

    const isAdmin = await publicClient.readContract({
      address: HATS, abi: HATS_ABI, functionName: 'isAdminOfHat', args: [account.address, id],
    });
    if (!isAdmin) {
      console.log(`🚫 ${label}: signer is not a Hats admin for this hat (current eligibility ${eligibility})`);
      blocked++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`→  ${label}: would attach (replacing ${eligibility})`);
      attached++;
      continue;
    }

    try {
      const txHash = await walletClient.writeContract({
        address: HATS, abi: HATS_ABI, functionName: 'changeHatEligibility', args: [id, moduleAddress],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`✅ ${label}: attached (tx ${txHash})`);
      attached++;
    } catch (err) {
      console.log(`❌ ${label}: changeHatEligibility failed — ${err.shortMessage || err.message}`);
      blocked++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would attach' : 'Attached'}: ${attached}, skipped: ${skipped}, blocked: ${blocked}`);
  if (blocked > 0) {
    console.log('Blocked hats need a different admin signer (e.g. top hat wearer) or are immutable.');
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
