/**
 * Deploy HatMinter (src/contracts/HatMinter.sol).
 *
 * HatMinter lets the backend mint the default community's member hat to new
 * members during onboarding, gas sponsored, and mint the executive leader hat.
 * It must itself wear a hat that is admin of both (the governance pod's
 * management hat) before it can mint.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy-hat-minter.cjs --network base
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY            deployer EOA (see hardhat.config.cjs)
 *   MEMBER_HAT_ID                   default community's membership_hat_id
 *   EXECUTIVE_POD_LEADER_HAT_ID     governance pod's management_hat_id
 *   HAT_MINTER_OWNER                initial owner (default: deployer)
 *   NEXT_PUBLIC_HATS_CONTRACT       Hats Protocol (defaults to the canonical address)
 */
const { ethers } = require('hardhat');

async function main() {
  const hats = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
  const memberHat = process.env.MEMBER_HAT_ID;
  const execLeaderHat = process.env.EXECUTIVE_POD_LEADER_HAT_ID;
  if (!memberHat || !execLeaderHat) {
    throw new Error('Set MEMBER_HAT_ID and EXECUTIVE_POD_LEADER_HAT_ID (see the header of this file).');
  }

  const [deployer] = await ethers.getSigners();
  const owner = process.env.HAT_MINTER_OWNER || deployer.address;
  console.log('Deploying HatMinter');
  console.log('  deployer:          ', deployer.address);
  console.log('  Hats Protocol:     ', hats);
  console.log('  member hat:        ', memberHat);
  console.log('  executive leader:  ', execLeaderHat);
  console.log('  owner:             ', owner);

  const HatMinter = await ethers.getContractFactory('HatMinter');
  const minter = await HatMinter.deploy(hats, BigInt(memberHat), BigInt(execLeaderHat), owner);
  await minter.waitForDeployment();
  const address = await minter.getAddress();
  console.log('\nHatMinter deployed at', address);

  console.log('\nNext steps:');
  console.log(`  1. Set NEXT_PUBLIC_HAT_MINTER=${address} locally and in your hosting env.`);
  console.log(`  2. Mint the executive leader hat (${execLeaderHat}) to ${address} so it can mint.`);
  console.log('  3. Authorize the backend smart wallet as a caller:');
  console.log('       npx tsx scripts/deploy/authorize-backend-caller.ts');
  console.log('  4. Add the contract to your CDP paymaster allowlist.');
  console.log('  5. Check: npx tsx scripts/deploy/verify-hat-minter-setup.ts');
  console.log(`\nVerify source: npx hardhat verify --network base ${address} ${hats} ${memberHat} ${execLeaderHat} ${owner}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
