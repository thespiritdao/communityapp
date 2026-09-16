/**
 * Deploy PodEligibilityModule (audit Phase 2, step 3).
 *
 * Composes agent exclusion + admin revocation + an optional criteria module
 * into one Hats eligibility module for pod hats. Replaces
 * AgentExclusionEligibilityModule on those hats (whose inner module is
 * immutable and zero).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-pod-eligibility-module.cjs --network base
 *
 * Env:
 *   NEXT_PUBLIC_HATS_CONTRACT             — Hats Protocol (required)
 *   NEXT_PUBLIC_AGENT_REGISTRY            — AgentRegistry (required)
 *   NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS — criteria module to chain (optional;
 *                                            pass CRITERIA_MODULE=0x0 to chain none)
 *   DEPLOYER_PRIVATE_KEY                  — funded deployer on Base
 *
 * After deploy:
 *   1. Set NEXT_PUBLIC_POD_ELIGIBILITY_MODULE=<address> (local + Vercel), redeploy.
 *   2. Attach to each pod's member and leader hats:
 *        node scripts/attach-pod-eligibility.mjs --dry-run
 *      changeHatEligibility must be signed by each hat's admin.
 */

const { ethers } = require('hardhat');

async function main() {
  const hats = process.env.NEXT_PUBLIC_HATS_CONTRACT;
  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  const criteria = process.env.CRITERIA_MODULE || process.env.NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS || ethers.ZeroAddress;
  for (const [name, value] of Object.entries({ hats, registry })) {
    if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${name} not set`);
  }
  const criteriaAddress = /^0x0+$/.test(criteria) ? ethers.ZeroAddress : criteria;

  const [deployer] = await ethers.getSigners();
  console.log('Deploying PodEligibilityModule');
  console.log('  deployer :', deployer.address);
  console.log('  hats     :', hats);
  console.log('  registry :', registry);
  console.log('  criteria :', criteriaAddress);

  const Module = await ethers.getContractFactory('PodEligibilityModule');
  const module = await Module.deploy(hats, registry, criteriaAddress);
  await module.waitForDeployment();
  const address = await module.getAddress();

  console.log('\nDeployed to:', address);
  console.log('\nNext:');
  console.log(`  NEXT_PUBLIC_POD_ELIGIBILITY_MODULE=${address}`);
  console.log('  node scripts/attach-pod-eligibility.mjs --dry-run');
  console.log(`  npx hardhat verify --network base ${address} ${hats} ${registry} ${criteriaAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
