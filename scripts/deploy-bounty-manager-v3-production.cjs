/**
 * Deploy BountyManagerV3 - Decentralized Bounty System
 *
 * This contract eliminates dependency on centralized PodBountyService
 * and uses Hats Protocol directly for permissions.
 *
 * Usage: node scripts/deploy-bounty-manager-v3-production.cjs
 */

const hre = require('hardhat');

async function main() {
  console.log('🚀 Deploying BountyManagerV3 (Decentralized)...\n');

  // Configuration for Base mainnet
  const HATS_PROTOCOL_ADDRESS = '0x3bc1a0ad72417f2d411118085256fc53cbddd137'; // Base mainnet

  console.log('Configuration:');
  console.log('  Network:', hre.network.name);
  console.log('  Hats Protocol:', HATS_PROTOCOL_ADDRESS);
  console.log('');

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying from:', deployer.address);
  console.log('Balance:', hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), 'ETH');
  console.log('');

  // Deploy BountyManagerV3
  console.log('📝 Deploying BountyManagerV3...');
  const BountyManagerV3 = await hre.ethers.getContractFactory('BountyManagerV3');
  const bountyManager = await BountyManagerV3.deploy(HATS_PROTOCOL_ADDRESS);

  await bountyManager.waitForDeployment();
  const bountyManagerAddress = await bountyManager.getAddress();

  console.log('✅ BountyManagerV3 deployed to:', bountyManagerAddress);
  console.log('');

  // Verify configuration
  console.log('🔍 Verifying deployment...');
  const hatsAddress = await bountyManager.hatsProtocol();
  const feeRecipient = await bountyManager.feeRecipient();
  const platformFee = await bountyManager.platformFeeRate();

  console.log('  Hats Protocol:', hatsAddress);
  console.log('  Fee Recipient:', feeRecipient);
  console.log('  Platform Fee:', platformFee.toString(), 'bps (', Number(platformFee) / 100, '%)');
  console.log('');

  // Display next steps
  console.log('📋 NEXT STEPS:');
  console.log('');
  console.log('1. Update .env file:');
  console.log(`   NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=${bountyManagerAddress}`);
  console.log('   NEXT_PUBLIC_USE_BOUNTY_V3=true');
  console.log('');
  console.log('2. Generate ABI:');
  console.log('   npm run compile');
  console.log('   cp artifacts/src/contracts/BountyManagerV3.sol/BountyManagerV3.json src/abis/');
  console.log('');
  console.log('3. Verify contract on Basescan:');
  console.log(`   npx hardhat verify --network base ${bountyManagerAddress} ${HATS_PROTOCOL_ADDRESS}`);
  console.log('');
  console.log('✅ Deployment complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
