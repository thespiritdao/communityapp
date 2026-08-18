/**
 * Deployment script for AgentRegistry (Congregant architecture, Phase 1)
 *
 * On-chain registry of AI agent addresses. Token mint guards and Hats
 * eligibility modules read from this contract to enforce agent exclusion
 * constitutionally (see CONGREGANT_INTEGRATION_SCOPE.md, Phases 1-2).
 *
 * Usage:
 * npx hardhat run scripts/deploy-agent-registry.cjs --network base
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY            — deployer EOA (hardhat.config.cjs)
 *   EXECUTIVE_POD_LEADER_HAT_ID     — admin hat (defaults to current tree 0x00000749 value)
 *   AGENT_REGISTRY_OWNER            — initial owner (defaults to backend admin smart wallet)
 */

const { ethers } = require("hardhat");

// Hats Protocol on Base mainnet (immutable)
const HATS_PROTOCOL = "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137";

// Executive Pod Leader hat (top hat tree 0x00000749) — see src/lib/hatRegistry.ts.
// If the hat tree has been redeployed, override via EXECUTIVE_POD_LEADER_HAT_ID.
const DEFAULT_EXEC_LEADER_HAT_ID =
  "0x0000074900010000000000000000000000000000000000000000000000000000";

// Backend admin smart wallet (authorized caller in mint-poc / self-mint routes).
// Owning the registry lets the existing backend key register agents gaslessly.
const DEFAULT_OWNER = "0x05c06af9fe1a996144902D9571d1d2783866cF63";

async function main() {
  console.log("🚀 Deploying AgentRegistry...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n",
  );

  const adminHatId = process.env.EXECUTIVE_POD_LEADER_HAT_ID || DEFAULT_EXEC_LEADER_HAT_ID;
  const initialOwner = process.env.AGENT_REGISTRY_OWNER || DEFAULT_OWNER;

  console.log("📋 Configuration:");
  console.log("   Hats Protocol:", HATS_PROTOCOL);
  console.log("   Admin Hat ID:", adminHatId);
  console.log("   Initial Owner:", initialOwner);
  console.log();

  if (!process.env.EXECUTIVE_POD_LEADER_HAT_ID) {
    console.log("⚠️  Using DEFAULT Executive Pod Leader hat ID (tree 0x00000749).");
    console.log("   Verify against pod_role_permissions.token_address before mainnet deploy!");
    console.log();
  }

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
  console.log("   4. Provision + register agent wallets:");
  console.log("      node scripts/migrate-agent-wallets.mjs --dry-run");
  console.log("      node scripts/migrate-agent-wallets.mjs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
