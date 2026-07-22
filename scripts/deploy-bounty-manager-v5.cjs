/**
 * Deploy BountyManagerV5 — fixes audit finding BM-001 (2026-07-21):
 * V4.createBounty was permissionless and pulled treasury funds from a
 * caller-supplied address against every treasury's standing max-approval,
 * letting any wallet drain any pod treasury.
 *
 * V5:
 *  - Treasury funds are always pulled from the pod's REGISTERED treasury.
 *  - Treasury funding requires the caller to wear the pod leader hat OR a hat
 *    the leader authorized via setAuthorizedFunderHat (granular roles on-chain).
 *  - Pods must be registered first (registerPodMetadata) — no silent auto-register.
 *  - pause() actually works (whenNotPaused on all value-moving functions).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-bounty-manager-v5.cjs --network base
 * (DEPLOYER_PRIVATE_KEY must be set in .env — deployer becomes the immutable admin.)
 */

const hre = require('hardhat');

async function main() {
  console.log('🚀 Deploying BountyManagerV5 (BM-001 fix)...\n');

  // Base mainnet config. NOTE: defaults are the CONFIRMED live token addresses.
  const HATS_PROTOCOL_ADDRESS =
    process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
  const SYSTEM_TOKEN_ADDRESS =
    process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '0x00f75717Ab019DE0e452605098cFDc4FccEbc701';
  const SELF_TOKEN_ADDRESS =
    process.env.NEXT_PUBLIC_SELF_TOKEN || '0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298';

  console.log('Configuration:');
  console.log('  Network:', hre.network.name);
  console.log('  Hats Protocol:', HATS_PROTOCOL_ADDRESS);
  console.log('  $SYSTEM Token:', SYSTEM_TOKEN_ADDRESS);
  console.log('  $SELF Token:', SELF_TOKEN_ADDRESS);
  console.log('');

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying from (becomes immutable admin):', deployer.address);
  console.log('Balance:', hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), 'ETH');
  console.log('');

  const BountyManagerV5 = await hre.ethers.getContractFactory('BountyManagerV5');
  const bountyManager = await BountyManagerV5.deploy(
    HATS_PROTOCOL_ADDRESS,
    SYSTEM_TOKEN_ADDRESS,
    SELF_TOKEN_ADDRESS,
  );

  await bountyManager.waitForDeployment();
  const address = await bountyManager.getAddress();

  console.log('✅ BountyManagerV5 deployed to:', address);
  console.log('');

  // Verify configuration
  console.log('🔍 Verifying deployment...');
  console.log('  admin:', await bountyManager.admin());
  console.log('  hatsProtocol:', await bountyManager.hatsProtocol());
  console.log('  systemToken:', await bountyManager.systemToken());
  console.log('  selfToken:', await bountyManager.selfToken());
  console.log('  $SYSTEM whitelisted:', await bountyManager.allowedTokens(SYSTEM_TOKEN_ADDRESS));
  console.log('  $SELF whitelisted:', await bountyManager.allowedTokens(SELF_TOKEN_ADDRESS));
  console.log('');

  console.log('📋 NEXT STEPS:');
  console.log('');
  console.log(`1. Set env: NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=${address}  (Vercel + local .env)`);
  console.log('2. Regenerate app ABI (already compiled by this run):');
  console.log('   node scripts/sync-bounty-v5-abi.cjs');
  console.log('3. Whitelist V5 with the Coinbase Paymaster (createBounty, placeBid, assignBounty,');
  console.log('   releasePayment, cancelBounty, registerPodMetadata, setAuthorizedFunderHat).');
  console.log('   Remove the old V4 from the paymaster whitelist.');
  console.log('4. Revoke old-V4 max-approval on funded treasuries (proposeRevokeBountyApproval).');
  console.log('5. Verify on Basescan:');
  console.log(`   npx hardhat verify --network base ${address} ${HATS_PROTOCOL_ADDRESS} ${SYSTEM_TOKEN_ADDRESS} ${SELF_TOKEN_ADDRESS}`);
  console.log('');
  console.log('✅ Deployment complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
