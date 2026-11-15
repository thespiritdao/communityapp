/**
 * Deployment script for AgentRegistry (Congregant architecture, Phase 1)
 *
 * On-chain registry of AI agent addresses. Token mint guards and Hats
 * eligibility modules read from this contract to enforce agent exclusion
 * constitutionally (see CONGREGANT_INTEGRATION_SCOPE.md, Phases 1-2).
 *
 * Usage:
 * npx hardhat run scripts/deploy/deploy-agent-registry.cjs --network base
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY            — deployer EOA (hardhat.config.cjs)
 *   EXECUTIVE_POD_LEADER_HAT_ID     — admin hat: the governance pod's management_hat_id (required)
 *   AGENT_REGISTRY_OWNER            — initial owner, normally BACKEND_SMART_WALLET_ADDRESS (required)
 *   NEXT_PUBLIC_HATS_CONTRACT       — Hats Protocol (defaults to the canonical address)
 */

const { ethers } = require("hardhat");

// Hats Protocol (same address on every chain).
const HATS_PROTOCOL =
  process.env.NEXT_PUBLIC_HATS_CONTRACT || "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137";

async function main() {
  console.log("🚀 Deploying AgentRegistry...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n",
  );

  // Owning the registry with the backend smart wallet lets the backend key
  // register agents gaslessly.
  const adminHatId = process.env.EXECUTIVE_POD_LEADER_HAT_ID;
  const initialOwner = process.env.AGENT_REGISTRY_OWNER || process.env.BACKEND_SMART_WALLET_ADDRESS;
  if (!adminHatId || !initialOwner) {
    throw new Error(
      "Set EXECUTIVE_POD_LEADER_HAT_ID (governance pod's management_hat_id) and " +
        "AGENT_REGISTRY_OWNER (or BACKEND_SMART_WALLET_ADDRESS).",
    );
  }

  console.log("📋 Configuration:");
  console.log("   Hats Protocol:", HATS_PROTOCOL);
  console.log("   Admin Hat ID:", adminHatId);
  console.log("   Initial Owner:", initialOwner);
  console.log();

  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy(HATS_PROTOCOL, adminHatId, initialOwner);

  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("✅ AgentRegistry deployed to:", address);
  console.log();

  // Verify deployment state
  console.log("🔍 Verifying deployment...");
  console.log("   hatsProtocol:", await registry.hatsProtocol());
  console.log("   adminHatId:", "0x" + (await registry.adminHatId()).toString(16).padStart(64, "0"));
  console.log("   owner:", await registry.owner());
  console.log("   agentCount:", (await registry.agentCount()).toString());
  console.log();

  console.log("📝 Next steps:");
  console.log("   1. Update env (Vercel + local .env) with:");
  console.log(`      NEXT_PUBLIC_AGENT_REGISTRY=${address}`);
  console.log();
  console.log("   2. Whitelist contract with Coinbase CDP for gasless registration:");
  console.log("      → https://portal.cdp.coinbase.com/");
  console.log(`      → Add contract: ${address} (registerAgent, deactivateAgent, reactivateAgent)`);
  console.log();
  console.log("   3. Verify on Basescan:");
  console.log(
    `      npx hardhat verify --network base ${address} ${HATS_PROTOCOL} ${adminHatId} ${initialOwner}`,
  );
  console.log();
  console.log("   4. Agent wallets are provisioned and registered when a pod enables its");
  console.log("      community agent (src/services/communityAgent/agentWalletService.ts).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
