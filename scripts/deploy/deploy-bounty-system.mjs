/**
 * Deploy the bounty system: one BountyManagerV5, one PodTreasuryV3 per pod,
 * each pod registered on the manager, and pods.treasury_contract_address
 * updated in the database.
 *
 * Treasuries approve the manager in their constructor and pod metadata on the
 * manager is write-once, so a new manager always needs new treasuries; run this
 * for the first deployment, or when replacing the manager.
 *
 *   1. Deploy BountyManagerV5 (the deployer becomes its admin, which enables
 *      registerPodMetadataFor without pod-leader hats).
 *   2. Deploy a PodTreasuryV3 per pod with the new manager baked in.
 *   3. registerPodMetadataFor each pod, pointing at its treasury.
 *   4. Update pods.treasury_contract_address.
 *
 * Pods: every active pod with a management_hat_id, or only BOUNTY_POD_IDS
 * (comma-separated UUIDs) when set. Each pod's management hat is its bounty
 * leader hat.
 *
 * Env: POD_ADMIN_PRIVATE_KEY (deployer), NEXT_PUBLIC_SYSTEM_TOKEN,
 * NEXT_PUBLIC_SELF_TOKEN, NEXT_PUBLIC_TREASURY_PROXY, NEXT_PUBLIC_RPC_URL,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_HATS_CONTRACT (defaults to the canonical address).
 * Compile first: npx hardhat compile
 *
 * DRY-RUN by default. Pass --execute to send transactions:
 *   node scripts/deploy/deploy-bounty-system.mjs            # print plan only
 *   node scripts/deploy/deploy-bounty-system.mjs --execute  # deploy for real
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
  readFileSync(join(__dirname, '../../.env'), 'utf8')
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
  readFileSync(join(__dirname, '../../artifacts/src/contracts/BountyManagerV5.sol/BountyManagerV5.json'), 'utf8'),
);
const treasuryArtifact = JSON.parse(
  readFileSync(join(__dirname, '../../artifacts/src/contracts/treasury-deploy/PodTreasuryV3.sol/PodTreasuryV3.json'), 'utf8'),
);

const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

const HATS_CONTRACT = env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const PROXY = env.NEXT_PUBLIC_TREASURY_PROXY; // hat-gated TreasuryProxy
const SYSTEM_TOKEN = env.NEXT_PUBLIC_SYSTEM_TOKEN;
const SELF_TOKEN = env.NEXT_PUBLIC_SELF_TOKEN;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_TREASURY_PROXY: PROXY, NEXT_PUBLIC_SYSTEM_TOKEN: SYSTEM_TOKEN, NEXT_PUBLIC_SELF_TOKEN: SELF_TOKEN })) {
  if (!v) throw new Error(`${k} not found in .env`);
}
const SUPPORTED_TOKENS = [SYSTEM_TOKEN, SELF_TOKEN];

// Pods from the database. Management hat doubles as the bounty leader hat.
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const onlyIds = (env.BOUNTY_POD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
let podQuery = supabase.from('pods').select('id, name, management_hat_id').not('management_hat_id', 'is', null).eq('is_active', true);
if (onlyIds.length) podQuery = podQuery.in('id', onlyIds);
const { data: podRows, error: podErr } = await podQuery;
if (podErr) throw new Error('Could not read pods: ' + podErr.message);
const PODS = (podRows ?? []).map((p) => ({
  name: p.name,
  id: p.id,
  managementHatId: BigInt(p.management_hat_id),
  thresholdBps: 5001n, // THRESHOLD_FLOOR_BPS (50% + 1)
}));
if (PODS.length === 0) throw new Error('No pods to set up (check BOUNTY_POD_IDS or pods.management_hat_id).');
console.log(`Pods: ${PODS.map((p) => p.name).join(', ')}`);

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
  console.log(`\n[dry-run] Would update pods.treasury_contract_address for ${PODS.length} pods.`);
}

console.log(EXECUTE ? '\n=== BOUNTY SYSTEM DEPLOYED ===' : '\n=== DRY RUN COMPLETE (nothing sent) ===');
console.log('NEW_BOUNTY_MANAGER=' + bountyManager);
for (const pod of PODS) console.log(`NEW_TREASURY (${pod.name})=` + treasuries[pod.id]);
console.log(`
Follow-ups:
  1. Set NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=${bountyManager} locally and in your hosting env.
  2. Add the manager and treasuries to your CDP paymaster allowlist.
  3. Redeploy the app.
  4. If a previous treasury still holds funds, move them through its proposal flow.`);
