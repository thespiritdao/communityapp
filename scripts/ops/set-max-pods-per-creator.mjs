// scripts/ops/set-max-pods-per-creator.mjs
// Calls setMaxPodsPerCreator on PodCreationManagerV2 to raise the limit
// Usage: node scripts/ops/set-max-pods-per-creator.mjs

import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Usage: node scripts/ops/set-max-pods-per-creator.mjs <newMax> [parentPodId]
// Each parent pod has its own PodCreationManager (pods.creation_manager_address).
// parentPodId defaults to NEXT_PUBLIC_COMMUNITY_POD_ID.
const PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const NEW_MAX = process.argv[2] ? BigInt(process.argv[2]) : null;
const PARENT_POD_ID = process.argv[3] || process.env.NEXT_PUBLIC_COMMUNITY_POD_ID;

if (!PRIVATE_KEY || NEW_MAX === null || !PARENT_POD_ID) {
  console.error('Usage: node scripts/ops/set-max-pods-per-creator.mjs <newMax> [parentPodId]');
  console.error('Needs POD_ADMIN_PRIVATE_KEY and NEXT_PUBLIC_COMMUNITY_POD_ID (or a pod id argument).');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: parentPod } = await sb.from('pods').select('name, creation_manager_address').eq('id', PARENT_POD_ID).single();
const CONTRACT = parentPod?.creation_manager_address;
if (!CONTRACT) {
  console.error(`Pod ${PARENT_POD_ID} has no creation_manager_address.`);
  process.exit(1);
}
console.log(`Parent pod: ${parentPod.name} — creation manager ${CONTRACT}`);

const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);

const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

const ABI = [
  {
    name: 'setMaxPodsPerCreator',
    type: 'function',
    inputs: [{ name: '_max', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'maxPodsPerCreator',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

async function main() {
  console.log(`Admin wallet: ${account.address}`);
  console.log(`Contract: ${CONTRACT}`);

  const current = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'maxPodsPerCreator',
  });
  console.log(`Current maxPodsPerCreator: ${current}`);
  console.log(`Setting to: ${NEW_MAX}`);

  const { request } = await publicClient.simulateContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'setMaxPodsPerCreator',
    args: [NEW_MAX],
    account,
  });

  const hash = await walletClient.writeContract(request);
  console.log(`Tx hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status}`);

  const updated = await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'maxPodsPerCreator',
  });
  console.log(`New maxPodsPerCreator: ${updated}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
