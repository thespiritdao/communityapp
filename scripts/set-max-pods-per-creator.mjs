// scripts/set-max-pods-per-creator.mjs
// Calls setMaxPodsPerCreator on PodCreationManagerV2 to raise the limit
// Usage: node scripts/set-max-pods-per-creator.mjs

import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });
dotenv.config({ path: resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const CONTRACT = '0x4fb924E6CfDf9B14eE03360423E4fde1aeE91Dd4';
const NEW_MAX = 20n;

if (!PRIVATE_KEY) {
  console.error('Missing POD_ADMIN_PRIVATE_KEY in .env.local');
  process.exit(1);
}

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
