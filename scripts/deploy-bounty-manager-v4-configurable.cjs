/**
 * Deploy BountyManagerV4 - Configurable Token Addresses
 *
 * V4 improvements over V3:
 * - Token addresses configurable at deployment
 * - Token whitelist for future expansion
 * - Admin can update tokens post-deployment
 *
 * Usage: node scripts/deploy-bounty-manager-v4-configurable.cjs
 */

const hre = require('hardhat');

async function main() {
  console.log('🚀 Deploying BountyManagerV4 (Configurable Tokens)...\n');

  // Configuration for Base mainnet
  const HATS_PROTOCOL_ADDRESS = '0x3bc1a0ad72417f2d411118085256fc53cbddd137'; // Base mainnet
  const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5';
  const SELF_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SELF_TOKEN || '0x1b8d424695E63ABca04E94bA46c03f1D83e14020';

  console.log('Configuration:');
  console.log('  Network:', hre.network.name);
  console.log('  Hats Protocol:', HATS_PROTOCOL_ADDRESS);
  console.log('  $SYSTEM Token:', SYSTEM_TOKEN_ADDRESS);
  console.log('  $SELF Token:', SELF_TOKEN_ADDRESS);
  console.log('');

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying from:', deployer.address);
  console.log('Balance:', hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), 'ETH');
  console.log('');

  // Deploy BountyManagerV4
  console.log('📝 Deploying BountyManagerV4...');
  const BountyManagerV4 = await hre.ethers.getContractFactory('BountyManagerV4');
  const bountyManager = await BountyManagerV4.deploy(
    HATS_PROTOCOL_ADDRESS,
    SYSTEM_TOKEN_ADDRESS,
    SELF_TOKEN_ADDRESS
  );

  await bountyManager.waitForDeployment();
  const bountyManagerAddress = await bountyManager.getAddress();

  console.log('✅ BountyManagerV4 deployed to:', bountyManagerAddress);
  console.log('');

  // Verify configuration
  console.log('🔍 Verifying deployment...');
  const hatsAddress = await bountyManager.hatsProtocol();
  const systemToken = await bountyManager.systemToken();
  const selfToken = await bountyManager.selfToken();
  const feeRecipient = await bountyManager.feeRecipient();
  const platformFee = await bountyManager.platformFeeRate();

  console.log('  Hats Protocol:', hatsAddress);
  console.log('  $SYSTEM Token:', systemToken);
  console.log('  $SELF Token:', selfToken);
  console.log('  Fee Recipient:', feeRecipient);
  console.log('  Platform Fee:', platformFee.toString(), 'bps (', Number(platformFee) / 100, '%)');
  console.log('');

  // Check token whitelist
  const systemAllowed = await bountyManager.allowedTokens(SYSTEM_TOKEN_ADDRESS);
  const selfAllowed = await bountyManager.allowedTokens(SELF_TOKEN_ADDRESS);
  console.log('  $SYSTEM Whitelisted:', systemAllowed);
  console.log('  $SELF Whitelisted:', selfAllowed);
  console.log('');

  // Display next steps
  console.log('📋 NEXT STEPS:');
  console.log('');
  console.log('1. Update .env file:');
  console.log(`   NEXT_PUBLIC_BOUNTY_MANAGER_V4_ADDRESS=${bountyManagerAddress}`);
  console.log('   NEXT_PUBLIC_USE_BOUNTY_V4=true');
  console.log('');
  console.log('2. Generate ABI:');
  console.log('   npm run compile');
  console.log('   cp artifacts/src/contracts/BountyManagerV4.sol/BountyManagerV4.json src/abis/');
  console.log('');
  console.log('3. Verify contract on Basescan:');
  console.log(`   npx hardhat verify --network base ${bountyManagerAddress} ${HATS_PROTOCOL_ADDRESS} ${SYSTEM_TOKEN_ADDRESS} ${SELF_TOKEN_ADDRESS}`);
  console.log('');
  console.log('4. (Optional) Add more tokens to whitelist:');
  console.log('   bountyManager.setTokenAllowed(tokenAddress, true)');
  console.log('');
  console.log('✅ Deployment complete!');
  console.log('');
  console.log('💡 V4 Benefits:');
  console.log('   ✅ Configurable token addresses (set at deployment)');
  console.log('   ✅ Token whitelist for future expansion');
  console.log('   ✅ Admin can update tokens post-deployment');
  console.log('   ✅ No need to redeploy if token addresses change');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
