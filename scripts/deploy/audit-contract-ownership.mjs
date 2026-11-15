/**
 * Ownership audit for contracts involved in the V3 treasury migration.
 *
 * Reads owner() / authorizedProxy / authorizedDeployer (where applicable)
 * from every contract address in .env and reports which wallet controls each.
 * Run: node scripts/deploy/audit-contract-ownership.mjs
 */

import 'dotenv/config';
import { createPublicClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const client = createPublicClient({ chain: base, transport: http(RPC) });

const OWNER_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const PROXY_ABI = [
  { name: 'authorizedProxy', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const DEPLOYER_ABI = [
  { name: 'authorizedDeployer', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const TREASURY_FACTORY_ABI = [
  { name: 'treasuryFactory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const FACTORY_ABI = [
  { name: 'factory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

// Wallets to recognise in the report, derived from the environment.
const addrOfKey = (k) => {
  try { return k ? privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`).address : null; } catch { return null; }
};
const KNOWN_WALLETS = Object.fromEntries(
  [
    [addrOfKey(process.env.PRIVATE_KEY), 'DEPLOYER (PRIVATE_KEY)'],
    [addrOfKey(process.env.POD_ADMIN_PRIVATE_KEY), 'POD_ADMIN (POD_ADMIN_PRIVATE_KEY)'],
    [process.env.BACKEND_SMART_WALLET_ADDRESS, 'BACKEND SMART WALLET'],
    [process.env.CONTRACT_ADMIN_ADDRESS, 'CONTRACT ADMIN (CONTRACT_ADMIN_ADDRESS)'],
  ]
    .filter(([a]) => a && /^0x[0-9a-fA-F]{40}$/.test(a))
    .map(([a, label]) => [getAddress(a), label]),
);

function labelWallet(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '(none / unset)';
  try {
    const checksum = getAddress(addr);
    return KNOWN_WALLETS[checksum] || `(unknown wallet ${checksum})`;
  } catch {
    return `(invalid addr: ${addr})`;
  }
}

const TARGETS = [
  // Format: [envVar, label, [checks]]
  ['NEXT_PUBLIC_POD_CREATION_MANAGER', 'PodCreationManagerV2', ['owner', 'treasuryFactory']],
  ['NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY', 'PodCreationManagerFactory', ['owner', 'treasuryFactory']],
  ['NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED', 'PurchaseRouterDecentralized', ['owner', 'treasuryFactory']],
  ['NEXT_PUBLIC_PURCHASE_ROUTER', 'PurchaseRouter', ['owner']],
  ['NEXT_PUBLIC_POD_SELF_DISTRIBUTOR', 'PodSELFDistributor', ['owner', 'treasuryFactory', 'authorizedProxy']],
  ['NEXT_PUBLIC_POD_TREASURY_FACTORY', 'PodTreasuryFactory (V2)', ['owner', 'authorizedProxy']],
  ['NEXT_PUBLIC_POD_TREASURY_FACTORY_V3', 'PodTreasuryFactoryV3 (NEW)', ['owner', 'authorizedProxy', 'authorizedDeployer']],
  ['NEXT_PUBLIC_POD_TREASURY_DEPLOYER_V3', 'PodTreasuryDeployerV3 (NEW)', ['owner', 'factory']],
  ['NEXT_PUBLIC_POD_AUTH_FACTORY', 'PodAuthorizationFactory', ['owner']],
  ['NEXT_PUBLIC_POD_AUTH_PROXY', 'PodAuthProxy', ['owner']],
  ['NEXT_PUBLIC_TREASURY_PROXY', 'TreasuryProxy', ['owner']],
  ['NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS', 'BountyManagerV4', ['owner']],
  ['NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS', 'HatsModuleFactory (Hats Protocol)', ['owner']],
];

async function read(addr, fn) {
  const abi = {
    owner: OWNER_ABI,
    authorizedProxy: PROXY_ABI,
    authorizedDeployer: DEPLOYER_ABI,
    treasuryFactory: TREASURY_FACTORY_ABI,
    factory: FACTORY_ABI,
  }[fn];
  try {
    return await client.readContract({ address: addr, abi, functionName: fn });
  } catch (e) {
    return `(function not present or call failed: ${e.shortMessage || e.message?.slice(0, 60)})`;
  }
}

async function main() {
  console.log('\n=== Contract Ownership Audit ===');
  console.log('RPC:', RPC);
  console.log('Known wallets:');
  for (const [addr, label] of Object.entries(KNOWN_WALLETS)) {
    console.log(`  ${addr} → ${label}`);
  }
  console.log('');

  for (const [envVar, label, checks] of TARGETS) {
    const raw = process.env[envVar];
    if (!raw) {
      console.log(`${label}: NOT SET (${envVar} missing from .env)`);
      console.log('');
      continue;
    }

    let addr;
    try {
      addr = getAddress(raw.trim());
    } catch {
      console.log(`${label}: INVALID ADDRESS in env: "${raw}"`);
      console.log('');
      continue;
    }

    console.log(`${label}`);
    console.log(`  Address: ${addr}`);

    for (const fn of checks) {
      const result = await read(addr, fn);
      if (typeof result === 'string' && result.startsWith('(')) {
        console.log(`  ${fn}: ${result}`);
      } else {
        console.log(`  ${fn}: ${result} → ${labelWallet(result)}`);
      }
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error('Audit failed:', e);
  process.exit(1);
});
