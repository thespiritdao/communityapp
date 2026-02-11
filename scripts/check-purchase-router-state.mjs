import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import fs from 'fs/promises';

// PurchaseRouter contract details
const PURCHASE_ROUTER = '0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78';
const PURCHASE_ROUTER_DECENTRALIZED = '0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9';

// Contract deployment block (estimate - adjust if you know exact block)
const DEPLOYMENT_BLOCK = 15000000n; // Base mainnet launched ~July 2024

// PurchaseRouter ABI (events only)
const PURCHASE_ROUTER_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'productId', type: 'string' },
      { indexed: false, name: 'destinationType', type: 'uint8' },
      { indexed: false, name: 'destinationAddress', type: 'address' },
      { indexed: false, name: 'podId', type: 'uint256' }
    ],
    name: 'ProductDestinationSet',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'treasury', type: 'address' },
      { indexed: false, name: 'authorized', type: 'bool' }
    ],
    name: 'TreasuryAuthorized',
    type: 'event'
  }
];

const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

async function checkPurchaseRouterState(contractAddress, contractName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 CHECKING ${contractName.toUpperCase()} STATE`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Contract: ${contractAddress}`);

  try {
    // Get ProductDestinationSet events
    console.log('\n🔍 Fetching ProductDestinationSet events...');
    const productEvents = await publicClient.getContractEvents({
      address: contractAddress,
      abi: PURCHASE_ROUTER_ABI,
      eventName: 'ProductDestinationSet',
      fromBlock: DEPLOYMENT_BLOCK,
      toBlock: 'latest'
    });

    console.log(`✅ Found ${productEvents.length} product destination configurations`);

    if (productEvents.length > 0) {
      console.log('\n📦 Product Configurations:');
      productEvents.forEach((event, index) => {
        const { productId, destinationType, destinationAddress, podId } = event.args;
        const destTypes = ['BURN', 'WALLET', 'POD_TREASURY'];
        console.log(`  ${index + 1}. Product: "${productId}"`);
        console.log(`     Type: ${destTypes[destinationType] || 'UNKNOWN'}`);
        console.log(`     Address: ${destinationAddress}`);
        console.log(`     Pod ID: ${podId}`);
      });
    }

    // Get TreasuryAuthorized events
    console.log('\n🔍 Fetching TreasuryAuthorized events...');
    const treasuryEvents = await publicClient.getContractEvents({
      address: contractAddress,
      abi: PURCHASE_ROUTER_ABI,
      eventName: 'TreasuryAuthorized',
      fromBlock: DEPLOYMENT_BLOCK,
      toBlock: 'latest'
    });

    console.log(`✅ Found ${treasuryEvents.length} treasury authorization events`);

    // Filter for currently authorized (last event per treasury)
    const treasuryMap = new Map();
    treasuryEvents.forEach(event => {
      const { treasury, authorized } = event.args;
      treasuryMap.set(treasury, authorized);
    });

    const authorizedTreasuries = Array.from(treasuryMap.entries())
      .filter(([_, authorized]) => authorized)
      .map(([treasury, _]) => treasury);

    console.log(`✅ Currently authorized treasuries: ${authorizedTreasuries.length}`);

    if (authorizedTreasuries.length > 0) {
      console.log('\n🏛️  Authorized Treasuries:');
      authorizedTreasuries.forEach((treasury, index) => {
        console.log(`  ${index + 1}. ${treasury}`);
      });
    }

    return {
      contractName,
      contractAddress,
      products: productEvents.map(e => ({
        productId: e.args.productId,
        destinationType: e.args.destinationType,
        destinationAddress: e.args.destinationAddress,
        podId: e.args.podId,
        blockNumber: e.blockNumber,
        transactionHash: e.transactionHash
      })),
      treasuries: authorizedTreasuries
    };

  } catch (error) {
    console.error(`❌ Error checking ${contractName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 PURCHASE ROUTER STATE ASSESSMENT');
  console.log('This will help determine migration complexity\n');

  // Check both PurchaseRouter contracts
  const centralizedState = await checkPurchaseRouterState(
    PURCHASE_ROUTER,
    'PurchaseRouter'
  );

  const decentralizedState = await checkPurchaseRouterState(
    PURCHASE_ROUTER_DECENTRALIZED,
    'PurchaseRouterDecentralized'
  );

  // Summary and recommendations
  console.log(`\n${'='.repeat(70)}`);
  console.log('📋 MIGRATION ASSESSMENT SUMMARY');
  console.log(`${'='.repeat(70)}`);

  const totalProducts = (centralizedState?.products.length || 0) +
                       (decentralizedState?.products.length || 0);
  const totalTreasuries = (centralizedState?.treasuries.length || 0) +
                         (decentralizedState?.treasuries.length || 0);

  console.log(`\n📊 Total State to Migrate:`);
  console.log(`   Products: ${totalProducts}`);
  console.log(`   Treasuries: ${totalTreasuries}`);

  console.log(`\n💡 Recommendation:`);
  if (totalProducts < 10 && totalTreasuries < 5) {
    console.log('   ✅ MANUAL RECONFIGURATION (Low complexity)');
    console.log('   - Products < 10: Can reconfigure manually (~1 hour)');
    console.log('   - Treasuries < 5: Can re-authorize manually (~15 min)');
    console.log('   - Total time: ~1-2 hours');
  } else {
    console.log('   ⚠️  AUTOMATED MIGRATION SCRIPT RECOMMENDED (Medium complexity)');
    console.log(`   - Products ≥ 10: Automated script recommended`);
    console.log(`   - Treasuries ≥ 5: Include in automation`);
    console.log('   - Script development: ~2 hours');
    console.log('   - Total time: ~3-4 hours');
  }

  // Save state to JSON for migration
  if (centralizedState || decentralizedState) {
    const stateExport = {
      exportDate: new Date().toISOString(),
      centralizedRouter: centralizedState,
      decentralizedRouter: decentralizedState,
      summary: {
        totalProducts,
        totalTreasuries,
        migrationComplexity: (totalProducts < 10 && totalTreasuries < 5) ? 'LOW' : 'MEDIUM'
      }
    };

    await fs.writeFile(
      'purchase-router-state-export.json',
      JSON.stringify(stateExport, null, 2)
    );

    console.log(`\n💾 State exported to: purchase-router-state-export.json`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Assessment complete!');
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(console.error);
