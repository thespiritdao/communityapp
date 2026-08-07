/**
 * Bounty system migration — full clean redeploy.
 *
 * Why: the BountyManagerV5 at 0xFE0007CbEe68ea201A238B23EF9Da13f4e918857 was
 * registered with the pods' OLD treasury addresses, and pod metadata is
 * write-once (no update function). The old treasuries' token approvals are
 * bound to the even older manager (immutable in both treasury versions), so
 * treasury-funded bounties on 0xFE00 can never work. The only clean fix is a
 * fresh deploy of everything, wired together correctly:
 *
 *   1. Deploy a new BountyManagerV5 (deployer becomes admin, enabling
 *      registerPodMetadataFor — no pod-leader hats needed for registration).
 *   2. Deploy a PodTreasuryV3 per pod with the new manager baked in
 *      (constructor grants it unlimited SYSTEM/SELF approvals).
 *   3. registerPodMetadataFor each pod on the new manager, pointing at its
 *      new treasury.
 *   4. Update Supabase pods.treasury_contract_address.
 *
 * Uses POD_ADMIN_PRIVATE_KEY from .env (0x617b20f7... — wears the Exec Pod
 * management hat, but deployment/registration here doesn't need any hat).
 *
 * DRY-RUN by default. Pass --execute to send transactions:
 *   node scripts/deploy-treasury-contracts.mjs            # print plan only
 *   node scripts/deploy-treasury-contracts.mjs --execute  # deploy for real
 *
 * After a successful run, update NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS in .env,
 * in Vercel, and the hardcoded fallbacks in src/ (the script prints the list),
 * then redeploy the app. Executive Pod's old treasury still holds funds —
 * move them via its multisig proposal flow (old treasury 0x6cd35eb6...).
 */
import { createWalletClient, createPublicClient, http, encodeDeployData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTE = process.argv.includes('--execute');

// Load env (split on first '=' only — values like JWTs may contain '=')
const env = Object.fromEntries(
  readFileSync(join(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const PRIVATE_KEY = env.POD_ADMIN_PRIVATE_KEY;
const RPC_URL = env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
if (!PRIVATE_KEY) throw new Error('POD_ADMIN_PRIVATE_KEY not found in .env');

const bountyManagerArtifact = JSON.parse(
  readFileSync(join(__dirname, '../artifacts/src/contracts/BountyManagerV5.sol/BountyManagerV5.json'), 'utf8'),
);
const treasuryArtifact = JSON.parse(
  readFileSync(join(__dirname, '../artifacts/src/contracts/treasury-deploy/PodTreasuryV3.sol/PodTreasuryV3.json'), 'utf8'),
);

const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const PROXY = '0x2015f0a8f809e21664c36d98005fcfca49ebd904'; // hat-gated TreasuryProxy (2026-08-07)
const SYSTEM_TOKEN = '0x00f75717Ab019DE0e452605098cFDc4FccEbc701';
const SELF_TOKEN = '0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298';
const SUPPORTED_TOKENS = [SYSTEM_TOKEN, SELF_TOKEN];

// Management hat doubles as the bounty leader hat at registration.
// Hat IDs verified against pods table + Hats protocol 2026-08-02.
const PODS = [
  {
    name: 'Executive Pod',
    id: 'e35c9e25-d29f-4988-b1e8-2902e960b94c',
    managementHatId: BigInt('0x0000074900010000000000000000000000000000000000000000000000000000'),
    thresholdBps: 5001n, // THRESHOLD_FLOOR_BPS (50% + 1)
  },
  {
    name: 'Temporal Naturalism',
    id: 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0',
    managementHatId: BigInt('0x0000074900020001000000000000000000000000000000000000000000000000'),
    thresholdBps: 5001n,
  },
  {
    name: 'Treegens DAO',
    id: 'a4f2eb44-c2d5-4c49-8629-f6f818960f98',
    managementHatId: 50280301357069824200217031064706067747510226502815431114826197237760000n,
    thresholdBps: 5001n,
  },
];

async function deployContract(label, artifact, args) {
  console.log(`\nDeploying ${label}...`);
  if (!EXECUTE) {
    console.log('  [dry-run] constructor args:', args.map(String).join(', '));
    return `0xDRYRUN_${label.replace(/\W/g, '_')}`;
  }
  const hash = await walletClient.sendTransaction({
    data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args }),
  });
  console.log(`  tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${label} deployment reverted (tx ${hash})`);
  console.log(`  address: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN (pass --execute to deploy)'}`);
console.log('Deployer:', account.address);
const balance = await publicClient.getBalance({ address: account.address });
console.log('Deployer ETH balance:', Number(balance) / 1e18);

// ── 1. New BountyManagerV5 (deployer becomes admin) ──────────────────────────
const bountyManager = await deployContract('BountyManagerV5', bountyManagerArtifact, [
  HATS_CONTRACT,
  SYSTEM_TOKEN,
  SELF_TOKEN,
]);

// ── 2. One PodTreasuryV3 per pod, approving the new manager ──────────────────
const treasuries = {};
for (const pod of PODS) {
  treasuries[pod.id] = await deployContract(`PodTreasuryV3 (${pod.name})`, treasuryArtifact, [
    HATS_CONTRACT,
    pod.managementHatId,
    pod.id,
    SUPPORTED_TOKENS,
    PROXY,
    bountyManager,
    pod.thresholdBps,
  ]);
}

// ── 3. Register each pod on the new manager (admin bypass) ───────────────────
for (const pod of PODS) {
  console.log(`\nRegistering ${pod.name} on new BountyManager...`);
  if (!EXECUTE) {
    console.log(`  [dry-run] registerPodMetadataFor("${pod.id}", ${pod.managementHatId}, ${treasuries[pod.id]})`);
    continue;
  }
  const hash = await walletClient.writeContract({
    address: bountyManager,
    abi: bountyManagerArtifact.abi,
    functionName: 'registerPodMetadataFor',
    args: [pod.id, pod.managementHatId, treasuries[pod.id]],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Registration for ${pod.name} reverted (tx ${hash})`);
  console.log(`  registered (tx ${hash})`);
}

// ── 4. Update Supabase treasury addresses ────────────────────────────────────
if (EXECUTE) {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  for (const pod of PODS) {
    const { error } = await supabase
      .from('pods')
      .update({
        treasury_contract_address: treasuries[pod.id],
        treasury_deployed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pod.id);
    console.log(error ? `  DB update FAILED for ${pod.name}: ${error.message}` : `  DB updated: ${pod.name}`);
  }
} else {
  console.log('\n[dry-run] Would update pods.treasury_contract_address for all 3 pods in Supabase.');
}

console.log('\n=== MIGRATION COMPLETE ===');
console.log('NEW_BOUNTY_MANAGER=' + bountyManager);
for (const pod of PODS) console.log(`NEW_TREASURY (${pod.name})=` + treasuries[pod.id]);
console.log(`
Follow-ups:
  1. Set NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=${bountyManager} in .env AND Vercel.
  2. Update the hardcoded fallbacks (currently 0xFE0007Cb...) in:
     - src/features/bounty/hooks/useBountyV2.ts
     - src/features/bounty/components/BountyFormV2.tsx (2 places)
     - src/app/api/cron/update-pending-bounties{,-v2,-v3}/route.ts
     - src/app/api/cron/update-pending-bids/route.ts
  3. Redeploy the app on Vercel.
  4. Executive Pod's OLD treasury (0x6cd35eb6281C49d58DBEfaB20E67E9e141Baf8Af)
     still holds ~0.93 SYSTEM + 0.88 SELF. Move via its multisig proposal flow
     to the new Exec treasury printed above.`);
