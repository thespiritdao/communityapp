import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import fs from 'fs/promises';

// Configuration
const HATS_PROTOCOL_BASE = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const EXECUTIVE_HAT_ID = '0x0000008800010000000000000000000000000000000000000000000000000000';

// Load SystemTokenV2 bytecode (you'll need to compile first)
// For now, this is a template - you'll need to compile the contract

const NETWORK = process.argv[2] || 'testnet'; // 'testnet' or 'mainnet'

async function main() {
  console.log('🚀 SystemTokenV2 Deployment Script');
  console.log(`Network: ${NETWORK === 'testnet' ? 'Base Sepolia' : 'Base Mainnet'}\n`);

  // Check for private key
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in environment');
    console.log('\nAdd to .env.local:');
    console.log('DEPLOYER_PRIVATE_KEY=0x...');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const chain = NETWORK === 'testnet' ? baseSepolia : base;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain,
    transport: http()
  });

  console.log(`Deployer address: ${account.address}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${balance} wei (${Number(balance) / 1e18} ETH)\n`);

  if (balance === 0n) {
    console.error('❌ Deployer has no ETH for gas');
    console.log('Send some ETH to:', account.address);
    process.exit(1);
  }

  console.log('📋 Deployment Parameters:');
  console.log(`   Initial Supply: 0 (migrating from V1)`);
  console.log(`   Executive Address: ${account.address}`);
  console.log(`   Hats Protocol: ${HATS_PROTOCOL_BASE}`);
  console.log(`   Executive Hat ID: ${EXECUTIVE_HAT_ID}`);
  console.log('\n⚠️  MANUAL STEP REQUIRED:');
  console.log('   1. Compile SystemTokenV2.sol using Hardhat or Foundry');
  console.log('   2. Deploy using your preferred tool');
  console.log('   3. Verify on Basescan');
  console.log('\n📝 Hardhat deployment command:');
  console.log(`   npx hardhat run scripts/deploy.js --network ${NETWORK === 'testnet' ? 'baseSepolia' : 'base'}`);
  console.log('\n📝 Foundry deployment command:');
  console.log(`   forge create SystemTokenV2 \\`);
  console.log(`     --rpc-url ${chain.rpcUrls.default.http[0]} \\`);
  console.log(`     --private-key $DEPLOYER_PRIVATE_KEY \\`);
  console.log(`     --constructor-args 0 ${account.address} ${HATS_PROTOCOL_BASE} ${EXECUTIVE_HAT_ID} \\`);
  console.log(`     --verify`);

  console.log('\n✅ After deployment, save the address and continue to next step');
}

main().catch(console.error);
