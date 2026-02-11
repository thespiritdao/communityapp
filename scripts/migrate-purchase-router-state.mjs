import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import fs from 'fs/promises';

// New contract addresses (set after deployment)
const NEW_PURCHASE_ROUTER = process.env.NEW_PURCHASE_ROUTER;
const NEW_PURCHASE_ROUTER_DECENTRALIZED = process.env.NEW_PURCHASE_ROUTER_DECENTRALIZED;

// PurchaseRouter ABI (admin functions)
const PURCHASE_ROUTER_ABI = [
  {
    inputs: [
      { name: 'treasury', type: 'address' },
      { name: 'authorized', type: 'bool' }
    ],
    name: 'setTreasuryAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'productId', type: 'string' },
      { name: 'destinationType', type: 'uint8' },
      { name: 'destinationAddress', type: 'address' },
      { name: 'podId', type: 'uint256' }
    ],
    name: 'setProductDestination',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

async function migrateState(contractAddress, stateData, contractName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 MIGRATING ${contractName.toUpperCase()} STATE`);
  console.log(`${'='.repeat(70)}`);
  console.log(`New Contract: ${contractAddress}\n`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  console.log(`Migrating from wallet: ${account.address}\n`);

  // Step 1: Re-authorize treasuries
  if (stateData.treasuries && stateData.treasuries.length > 0) {
    console.log(`📋 Step 1: Re-authorizing ${stateData.treasuries.length} treasuries...`);

    for (let i = 0; i < stateData.treasuries.length; i++) {
      const treasury = stateData.treasuries[i];
      console.log(`   ${i + 1}/${stateData.treasuries.length} Authorizing: ${treasury}`);

      try {
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: PURCHASE_ROUTER_ABI,
          functionName: 'setTreasuryAuthorization',
          args: [treasury, true]
        });

        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`      ✅ Authorized (tx: ${hash.slice(0, 10)}...)`);

      } catch (error) {
        console.error(`      ❌ Failed:`, error.message);
      }
    }
  } else {
    console.log('📋 Step 1: No treasuries to authorize\n');
  }

  // Step 2: Re-set product destinations
  if (stateData.products && stateData.products.length > 0) {
    console.log(`\n📦 Step 2: Re-configuring ${stateData.products.length} products...`);

    for (let i = 0; i < stateData.products.length; i++) {
      const product = stateData.products[i];
      console.log(`   ${i + 1}/${stateData.products.length} Product: "${product.productId}"`);

      try {
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: PURCHASE_ROUTER_ABI,
          functionName: 'setProductDestination',
          args: [
            product.productId,
            product.destinationType,
            product.destinationAddress,
            product.podId
          ]
        });

        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`      ✅ Configured (tx: ${hash.slice(0, 10)}...)`);

      } catch (error) {
        console.error(`      ❌ Failed:`, error.message);
      }
    }
  } else {
    console.log('\n📦 Step 2: No products to configure\n');
  }

  console.log(`\n✅ ${contractName} migration complete!`);
}

async function main() {
  console.log('🔄 PURCHASE ROUTER STATE MIGRATION');
  console.log('This will re-import state to new contracts\n');

  // Load exported state
  let stateExport;
  try {
    const data = await fs.readFile('purchase-router-state-export.json', 'utf-8');
    stateExport = JSON.parse(data);
    console.log('✅ Loaded state export from purchase-router-state-export.json');
    console.log(`   Exported: ${stateExport.exportDate}`);
    console.log(`   Products: ${stateExport.summary.totalProducts}`);
    console.log(`   Treasuries: ${stateExport.summary.totalTreasuries}\n`);
  } catch (error) {
    console.error('❌ Could not load purchase-router-state-export.json');
    console.log('Run: node scripts/check-purchase-router-state.mjs first');
    process.exit(1);
  }

  // Check new contract addresses
  if (!NEW_PURCHASE_ROUTER) {
    console.error('❌ NEW_PURCHASE_ROUTER not set in environment');
    console.log('Set: export NEW_PURCHASE_ROUTER=0x...');
    process.exit(1);
  }

  if (!NEW_PURCHASE_ROUTER_DECENTRALIZED) {
    console.error('❌ NEW_PURCHASE_ROUTER_DECENTRALIZED not set in environment');
    console.log('Set: export NEW_PURCHASE_ROUTER_DECENTRALIZED=0x...');
    process.exit(1);
  }

  // Migrate both contracts
  if (stateExport.centralizedRouter) {
    await migrateState(
      NEW_PURCHASE_ROUTER,
      stateExport.centralizedRouter,
      'PurchaseRouter'
    );
  }

  if (stateExport.decentralizedRouter) {
    await migrateState(
      NEW_PURCHASE_ROUTER_DECENTRALIZED,
      stateExport.decentralizedRouter,
      'PurchaseRouterDecentralized'
    );
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ ALL STATE MIGRATION COMPLETE!');
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(console.error);
