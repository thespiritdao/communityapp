/**
 * Deployment script for PodGovernance V2 (No backend wallet needed)
 *
 * Usage:
 * npx hardhat run scripts/deploy-pod-governance-v2.cjs --network base
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying PodGovernance V2 (Gasless with CDP)...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Contract addresses
  const ADVOCATE_TOKEN = "0x3Ad7e51578294366035ea41aAf0A15f6037a3789"; // Advocate NFT

  console.log("📋 Configuration:");
  console.log("   Advocate Token:", ADVOCATE_TOKEN);
  console.log("   Architecture: Signature-based (NO backend wallet needed)");
  console.log("   Gas Sponsorship: Coinbase CDP (whitelist after deployment)");
  console.log();

  // Deploy contract
  const PodGovernanceV2 = await ethers.getContractFactory("PodGovernanceV2");
  const podGovernance = await PodGovernanceV2.deploy(ADVOCATE_TOKEN);

  await podGovernance.waitForDeployment();
  const address = await podGovernance.getAddress();

  console.log("✅ PodGovernance V2 deployed to:", address);
  console.log();

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const advocateToken = await podGovernance.advocateToken();
  const voteTypehash = await podGovernance.VOTE_TYPEHASH();

  console.log("   Advocate Token:", advocateToken);
  console.log("   Vote Typehash:", voteTypehash);
  console.log("   EIP-712 Domain: SpiritDAO Governance v1");
  console.log();

  console.log("📝 Next steps:");
  console.log("   1. Update .env with:");
  console.log(`      NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=${address}`);
  console.log();
  console.log("   2. Whitelist contract with Coinbase CDP:");
  console.log("      → Go to: https://portal.cdp.coinbase.com/");
  console.log(`      → Add contract: ${address}`);
  console.log("      → Enable gasless transactions");
  console.log();
  console.log("   3. Verify contract on Basescan:");
  console.log(`      npx hardhat verify --network base ${address} ${ADVOCATE_TOKEN}`);
  console.log();
  console.log("   4. Test voting flow:");
  console.log("      → User signs vote with EIP-712 in frontend");
  console.log("      → Frontend submits to contract (gasless via CDP)");
  console.log("      → Contract verifies signature and records vote");
  console.log();
  console.log("🎉 No backend wallet needed! Fully decentralized!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
