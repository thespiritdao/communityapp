/**
 * Deployment script for AgentExclusionEligibilityModule (Congregant Phase 2)
 *
 * Hats eligibility module: any address in AgentRegistry is ineligible for
 * hats this module is attached to. Live hats currently use placeholder
 * eligibility addresses (no code), so a single instance with no inner module
 * preserves existing behavior for humans while excluding agents.
 *
 * Usage:
 * npx hardhat run scripts/deploy-agent-exclusion-module.cjs --network base
 *
 * Env:
 *   NEXT_PUBLIC_AGENT_REGISTRY   — deployed AgentRegistry address (required)
 *   INNER_ELIGIBILITY            — optional module to chain (default: none)
 *
 * After deploy: node scripts/attach-agent-exclusion.mjs --dry-run
 */

const { ethers } = require("hardhat");

async function main() {
  const registry = process.env.NEXT_PUBLIC_AGENT_REGISTRY;
  if (!registry || !/^0x[a-fA-F0-9]{40}$/.test(registry)) {
    throw new Error("NEXT_PUBLIC_AGENT_REGISTRY not set");
  }
  const inner = process.env.INNER_ELIGIBILITY || ethers.ZeroAddress;

  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying AgentExclusionEligibilityModule...");
  console.log("📝 Deployer:", deployer.address);
  console.log("📋 AgentRegistry:", registry);
  console.log("📋 Inner eligibility:", inner);
  console.log();

  const Module = await ethers.getContractFactory("AgentExclusionEligibilityModule");
  const module = await Module.deploy(registry, inner);
  await module.waitForDeployment();
  const address = await module.getAddress();

  console.log("✅ Deployed to:", address);
  console.log();
  console.log("📝 Next steps:");
  console.log(`   1. Set NEXT_PUBLIC_AGENT_EXCLUSION_MODULE=${address}`);
  console.log("   2. Attach to hats: node scripts/attach-agent-exclusion.mjs --dry-run");
  console.log("   3. Verify:");
  console.log(`      npx hardhat verify --network base ${address} ${registry} ${inner}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
