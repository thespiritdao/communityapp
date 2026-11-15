/**
 * Wires up V3 treasury contracts after deployment:
 *   1. Updates the DEPLOYER_V3 to point at the new FACTORY_V3_CORRECT
 *   2. Updates FACTORY_V3_CORRECT to recognize DEPLOYER_V3 as authorized
 *   3. Updates four downstream contracts (PodCreationManagerV2,
 *      PodSELFDistributor, PurchaseRouterDecentralized, PodCreationManagerFactory)
 *      to point at FACTORY_V3_CORRECT
 *
 * Signs with CONTRACT_ADMIN_PRIVATE_KEY (owner of most of these contracts)
 * AND POD_ADMIN_PRIVATE_KEY (owner of PodCreationManagerFactory).
 * All contract addresses come from the NEXT_PUBLIC_* variables in .env.
 *
 * Each step checks if the change is already applied — safe to re-run.
 *
 * Run: node scripts/deploy/wire-treasury-factory.mjs
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const need = (k) => {
  const v = process.env[k];
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) { console.error(`Missing or invalid ${k} in .env`); process.exit(1); }
  return getAddress(v);
};
const FACTORY_V3_CORRECT = need('NEXT_PUBLIC_POD_TREASURY_FACTORY_V3');
const DEPLOYER_V3 = need('NEXT_PUBLIC_POD_TREASURY_DEPLOYER_V3');

const POD_CREATION_MANAGER_V2 = need('NEXT_PUBLIC_POD_CREATION_MANAGER');
const POD_SELF_DISTRIBUTOR = need('NEXT_PUBLIC_POD_SELF_DISTRIBUTOR');
const PURCHASE_ROUTER_DECENTRALIZED = need('NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED');
const POD_CREATION_MANAGER_FACTORY = need('NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY');

const PERSONAL_KEY = process.env.CONTRACT_ADMIN_PRIVATE_KEY;
const POD_ADMIN_KEY = process.env.POD_ADMIN_PRIVATE_KEY;

if (!PERSONAL_KEY) {
  console.error('Missing CONTRACT_ADMIN_PRIVATE_KEY in .env (the wallet that owns these contracts).');
  console.error('Add it for this run only and delete it afterwards.');
  process.exit(1);
}
if (!POD_ADMIN_KEY) {
  console.error('Missing POD_ADMIN_PRIVATE_KEY in .env');
  process.exit(1);
}

const personalAccount = privateKeyToAccount(PERSONAL_KEY);
const podAdminAccount = privateKeyToAccount(POD_ADMIN_KEY);

console.log('Contract admin wallet (most setters):', personalAccount.address);
console.log('Pod admin wallet (factory setter):', podAdminAccount.address);
console.log('');

// Optional safety check: if CONTRACT_ADMIN_ADDRESS is set, the key must match it,
// so a wrong key fails here instead of reverting on the first setter.
const EXPECTED_PERSONAL = process.env.CONTRACT_ADMIN_ADDRESS;
if (EXPECTED_PERSONAL && personalAccount.address.toLowerCase() !== EXPECTED_PERSONAL.toLowerCase()) {
  console.error(`❌ CONTRACT_ADMIN_PRIVATE_KEY derives to ${personalAccount.address},`);
  console.error(`   not CONTRACT_ADMIN_ADDRESS ${EXPECTED_PERSONAL}. Setters would revert.`);
  process.exit(1);
}

const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
const personalWallet = createWalletClient({ account: personalAccount, chain: base, transport: http(RPC) });
const podAdminWallet = createWalletClient({ account: podAdminAccount, chain: base, transport: http(RPC) });

const ABI = {
  treasuryFactory: [{ name: 'treasuryFactory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
  factory: [{ name: 'factory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
  authorizedDeployer: [{ name: 'authorizedDeployer', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
  updateTreasuryFactory: [{ name: 'updateTreasuryFactory', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_treasuryFactory', type: 'address' }], outputs: [] }],
  updateFactory: [{ name: 'updateFactory', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'newFactory', type: 'address' }], outputs: [] }],
  updateAuthorizedDeployer: [{ name: 'updateAuthorizedDeployer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_newDeployer', type: 'address' }], outputs: [] }],
};

async function readAddr(addr, fn) {
  return (await publicClient.readContract({
    address: addr,
    abi: ABI[fn],
    functionName: fn,
  })).toLowerCase();
}

async function callIfNeeded({ label, target, currentGetter, expected, callFn, callAbiName, wallet }) {
  console.log(`\n→ ${label}`);
  console.log(`  Target: ${target}`);
  const current = await readAddr(target, currentGetter);
  const exp = expected.toLowerCase();
  console.log(`  Current ${currentGetter}: ${current}`);
  console.log(`  Expected:              ${exp}`);
  if (current === exp) {
    console.log('  ✅ Already set, no transaction needed');
    return;
  }
  console.log(`  ⚙️  Sending ${callFn}(${expected}) from ${wallet.account.address}`);
  try {
    const hash = await wallet.writeContract({
      address: target,
      abi: ABI[callAbiName],
      functionName: callFn,
      args: [expected],
    });
    console.log(`  Tx submitted: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
    } else {
      console.log(`  ❌ Transaction reverted`);
    }
  } catch (e) {
    console.log(`  ❌ Failed: ${e.shortMessage || e.message?.split('\n')[0]}`);
  }
}

async function main() {
  console.log('=== Wiring V3 treasury infrastructure ===\n');

  // Step 1: Deployer.factory → FACTORY_V3_CORRECT
  await callIfNeeded({
    label: 'Step 1: PodTreasuryDeployerV3.updateFactory',
    target: DEPLOYER_V3,
    currentGetter: 'factory',
    expected: FACTORY_V3_CORRECT,
    callFn: 'updateFactory',
    callAbiName: 'updateFactory',
    wallet: personalWallet,
  });

  // Step 2: Factory.authorizedDeployer → DEPLOYER_V3
  await callIfNeeded({
    label: 'Step 2: PodTreasuryFactoryV3.updateAuthorizedDeployer',
    target: FACTORY_V3_CORRECT,
    currentGetter: 'authorizedDeployer',
    expected: DEPLOYER_V3,
    callFn: 'updateAuthorizedDeployer',
    callAbiName: 'updateAuthorizedDeployer',
    wallet: personalWallet,
  });

  // Step 3a: PodCreationManagerV2.treasuryFactory → FACTORY_V3_CORRECT
  await callIfNeeded({
    label: 'Step 3a: PodCreationManagerV2.updateTreasuryFactory',
    target: POD_CREATION_MANAGER_V2,
    currentGetter: 'treasuryFactory',
    expected: FACTORY_V3_CORRECT,
    callFn: 'updateTreasuryFactory',
    callAbiName: 'updateTreasuryFactory',
    wallet: personalWallet,
  });

  // Step 3b: PodSELFDistributor.treasuryFactory → FACTORY_V3_CORRECT
  await callIfNeeded({
    label: 'Step 3b: PodSELFDistributor.updateTreasuryFactory',
    target: POD_SELF_DISTRIBUTOR,
    currentGetter: 'treasuryFactory',
    expected: FACTORY_V3_CORRECT,
    callFn: 'updateTreasuryFactory',
    callAbiName: 'updateTreasuryFactory',
    wallet: personalWallet,
  });

  // Step 3c: PurchaseRouterDecentralized.treasuryFactory → FACTORY_V3_CORRECT
  await callIfNeeded({
    label: 'Step 3c: PurchaseRouterDecentralized.updateTreasuryFactory',
    target: PURCHASE_ROUTER_DECENTRALIZED,
    currentGetter: 'treasuryFactory',
    expected: FACTORY_V3_CORRECT,
    callFn: 'updateTreasuryFactory',
    callAbiName: 'updateTreasuryFactory',
    wallet: personalWallet,
  });

  // Step 3d: PodCreationManagerFactory.treasuryFactory → FACTORY_V3_CORRECT (POD_ADMIN signs)
  await callIfNeeded({
    label: 'Step 3d: PodCreationManagerFactory.updateTreasuryFactory (POD_ADMIN signs)',
    target: POD_CREATION_MANAGER_FACTORY,
    currentGetter: 'treasuryFactory',
    expected: FACTORY_V3_CORRECT,
    callFn: 'updateTreasuryFactory',
    callAbiName: 'updateTreasuryFactory',
    wallet: podAdminWallet,
  });

  console.log('\n=== Done ===');
  console.log('Final state:');
  console.log(`  Deployer.factory:              ${await readAddr(DEPLOYER_V3, 'factory')}`);
  console.log(`  Factory.authorizedDeployer:    ${await readAddr(FACTORY_V3_CORRECT, 'authorizedDeployer')}`);
  console.log(`  PodCreationManagerV2:          ${await readAddr(POD_CREATION_MANAGER_V2, 'treasuryFactory')}`);
  console.log(`  PodSELFDistributor:            ${await readAddr(POD_SELF_DISTRIBUTOR, 'treasuryFactory')}`);
  console.log(`  PurchaseRouterDecentralized:   ${await readAddr(PURCHASE_ROUTER_DECENTRALIZED, 'treasuryFactory')}`);
  console.log(`  PodCreationManagerFactory:     ${await readAddr(POD_CREATION_MANAGER_FACTORY, 'treasuryFactory')}`);
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
