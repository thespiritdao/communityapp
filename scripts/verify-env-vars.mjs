import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Load environment variables
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN;
const TOKEN_FAUCET = process.env.NEXT_PUBLIC_TOKEN_FAUCET;
const PURCHASE_ROUTER = process.env.NEXT_PUBLIC_PURCHASE_ROUTER;
const PURCHASE_ROUTER_DECENTRALIZED = process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED;
const BOUNTY_MANAGER = process.env.NEXT_PUBLIC_BOUNTY_MANAGER;
const EVENT_MANAGER = process.env.NEXT_PUBLIC_EVENT_MANAGER;

const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

async function verifyContract(address, name) {
  console.log(`\n🔍 Verifying ${name}...`);
  console.log(`   Address: ${address}`);

  if (!address) {
    console.log('   ❌ Not set in environment');
    return false;
  }

  try {
    // Check if contract exists
    const code = await publicClient.getBytecode({ address });

    if (code && code !== '0x') {
      console.log('   ✅ Contract exists on-chain');
      return true;
    } else {
      console.log('   ❌ No contract code at this address');
      return false;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🔍 ENVIRONMENT VARIABLES VERIFICATION');
  console.log('═'.repeat(70));

  const results = {
    systemToken: await verifyContract(SYSTEM_TOKEN, 'SystemToken'),
    tokenFaucet: await verifyContract(TOKEN_FAUCET, 'TokenFaucet'),
    purchaseRouter: await verifyContract(PURCHASE_ROUTER, 'PurchaseRouter'),
    purchaseRouterDecentralized: await verifyContract(PURCHASE_ROUTER_DECENTRALIZED, 'PurchaseRouterDecentralized'),
    bountyManager: await verifyContract(BOUNTY_MANAGER, 'BountyManager'),
    eventManager: await verifyContract(EVENT_MANAGER, 'EventManager')
  };

  console.log('\n' + '═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));

  Object.entries(results).forEach(([key, success]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${success ? '✅' : '❌'} ${label}`);
  });

  const allValid = Object.values(results).every(v => v);

  if (allValid) {
    console.log('\n✅ All environment variables are valid!');
    console.log('   You can proceed with frontend deployment.');
  } else {
    console.log('\n⚠️  Some environment variables are invalid.');
    console.log('   Fix these before deploying frontend.');
  }

  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
