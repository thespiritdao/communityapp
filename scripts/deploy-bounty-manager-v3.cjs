const hre = require('hardhat');

/**
 * Deploy BountyManagerV3 with HATs Protocol integration
 *
 * This script deploys the decentralized bounty manager that uses HATs directly
 * instead of relying on the centralized PodBountyService registry.
 */
async function main() {
  console.log('🚀 Deploying BountyManagerV3 to Base mainnet...\n');

  // Contract addresses on Base mainnet
  const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137'; // Base mainnet Hats Protocol

  console.log('Configuration:');
  console.log('  Network:', hre.network.name);
  console.log('  Hats Protocol:', HATS_PROTOCOL_ADDRESS);
  console.log('  SYSTEM Token:', '0x1317Ae277266D38C4E492558f8693F14143a6A65');
  console.log('  SELF Token:', '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21');
  console.log('');

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', hre.ethers.formatEther(balance), 'ETH\n');

  // Deploy BountyManagerV3
  console.log('📦 Deploying BountyManagerV3...');
  const BountyManagerV3 = await hre.ethers.getContractFactory('BountyManagerV3');
  const bountyManager = await BountyManagerV3.deploy(HATS_PROTOCOL_ADDRESS);

  await bountyManager.waitForDeployment();
  const bountyManagerAddress = await bountyManager.getAddress();

  console.log('✅ BountyManagerV3 deployed to:', bountyManagerAddress);
  console.log('');

  // Verify configuration
  console.log('🔍 Verifying deployment configuration...');
  const hatsAddress = await bountyManager.hatsProtocol();
  const feeRecipient = await bountyManager.feeRecipient();
  const platformFeeRate = await bountyManager.platformFeeRate();
  const systemToken = await bountyManager.SYSTEM_TOKEN();
  const selfToken = await bountyManager.SELF_TOKEN();

  console.log('  Hats Protocol:', hatsAddress);
  console.log('  Fee Recipient:', feeRecipient);
  console.log('  Platform Fee:', Number(platformFeeRate) / 100, '%');
  console.log('  SYSTEM Token:', systemToken);
  console.log('  SELF Token:', selfToken);
  console.log('');

  // Summary
  console.log('📋 Deployment Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Contract Address:', bountyManagerAddress);
  console.log('Network:', hre.network.name);
  console.log('Transaction Hash:', bountyManager.deploymentTransaction()?.hash);
  console.log('Deployer:', deployer.address);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Next steps
  console.log('📝 Next Steps:');
  console.log('');
  console.log('1. Update .env.local:');
  console.log(`   NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=${bountyManagerAddress}`);
  console.log('');
  console.log('2. Generate ABI:');
  console.log('   npm run compile');
  console.log('   cp artifacts/src/contracts/BountyManagerV3.sol/BountyManagerV3.json src/abis/');
  console.log('');
  console.log('3. Update frontend:');
  console.log('   - Update useBountyV2.ts to use V3 contract');
  console.log('   - Update BountyFormV2.tsx to include leaderHatId parameter');
  console.log('');
  console.log('4. Verify on BaseScan:');
  console.log(`   npx hardhat verify --network base ${bountyManagerAddress} ${HATS_PROTOCOL_ADDRESS}`);
  console.log('');

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: bountyManagerAddress,
    hatsProtocol: hatsAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    transactionHash: bountyManager.deploymentTransaction()?.hash,
  };

  const fs = require('fs');
  const path = require('path');
  const deploymentsDir = path.join(__dirname, '..', 'deployments');

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = path.join(deploymentsDir, `bounty-manager-v3-${hre.network.name}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log('💾 Deployment info saved to:', filename);
  console.log('');

  console.log('✅ Deployment complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
