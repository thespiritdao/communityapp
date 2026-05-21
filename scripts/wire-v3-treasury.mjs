/**
 * Wires up V3 treasury contracts after deployment:
 *   1. Updates the DEPLOYER_V3 to point at the new FACTORY_V3_CORRECT
 *   2. Updates FACTORY_V3_CORRECT to recognize DEPLOYER_V3 as authorized
 *   3. Updates four downstream contracts (PodCreationManagerV2,
 *      PodSELFDistributor, PurchaseRouterDecentralized, PodCreationManagerFactory)
 *      to point at FACTORY_V3_CORRECT
 *
 * Signs with PRIVATE_KEY (your personal wallet, owner of most contracts)
 * AND POD_ADMIN_PRIVATE_KEY (owner of PodCreationManagerFactory).
 *
 * Each step checks if the change is already applied — safe to re-run.
 *
 * Run: node scripts/wire-v3-treasury.mjs
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const FACTORY_V3_CORRECT = '0x6CeD549C1f08690e435007E661552f4F76229a9B';
const DEPLOYER_V3 = '0x1c7b54794d2DF824e4E77D50e27f01A0D5736A2A';

const POD_CREATION_MANAGER_V2 = '0x2Af75c32435e64a528FCD2204d3F6CD763f98218';
const POD_SELF_DISTRIBUTOR = '0x8a80eC4e958d73B8A19dFBa594882c598f14036c';
const PURCHASE_ROUTER_DECENTRALIZED = '0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9';
const POD_CREATION_MANAGER_FACTORY = '0x99A291f4a4402dCBd1b44ad79549293e2103244F';

const PERSONAL_KEY = process.env.PERSONAL_PRIVATE_KEY;
const POD_ADMIN_KEY = process.env.POD_ADMIN_PRIVATE_KEY;

if (!PERSONAL_KEY) {
  console.error('Missing PERSONAL_PRIVATE_KEY in .env');
  console.error('Export from MetaMask: account icon → Account Details → Show Private Key');
  console.error('Add line: PERSONAL_PRIVATE_KEY=0x...');
  console.error('Delete it after this script completes.');
  process.exit(1);
}
if (!POD_ADMIN_KEY) {
  console.error('Missing POD_ADMIN_PRIVATE_KEY in .env');
  process.exit(1);
}

const personalAccount = privateKeyToAccount(PERSONAL_KEY);
const podAdminAccount = privateKeyToAccount(POD_ADMIN_KEY);

console.log('Personal wallet (most setters):', personalAccount.address);
console.log('Pod admin wallet (factory setter):', podAdminAccount.address);
console.log('');

const EXPECTED_PERSONAL = '0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d';
const EXPECTED_POD_ADMIN = '0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF';

if (personalAccount.address.toLowerCase() !== EXPECTED_PERSONAL.toLowerCase()) {
  console.error(`❌ PERSONAL_PRIVATE_KEY derives to wrong wallet.`);
  console.error(`   Got:      ${personalAccount.address}`);
  console.error(`   Expected: ${EXPECTED_PERSONAL}`);
  console.error(`   This wallet doesn't own the target contracts; setters will revert.`);
  process.exit(1);
}
if (podAdminAccount.address.toLowerCase() !== EXPECTED_POD_ADMIN.toLowerCase()) {
  console.error(`❌ POD_ADMIN_PRIVATE_KEY derives to wrong wallet.`);
  console.error(`   Got:      ${podAdminAccount.address}`);
  console.error(`   Expected: ${EXPECTED_POD_ADMIN}`);
  process.exit(1);
}
console.log('✅ Both wallet keys match expected owners.\n');

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
