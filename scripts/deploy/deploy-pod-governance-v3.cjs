/**
 * Deployment script for PodGovernance V3 (Simplified for AA Wallets)
 *
 * Usage:
 * npx hardhat run scripts/deploy/deploy-pod-governance-v3.cjs --network base
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying PodGovernance V3 (Simplified for CDP AA Wallets)...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Advocate (membership) NFT from the environment.
  const ADVOCATE_TOKEN = process.env.NEXT_PUBLIC_ADVOCATE;
  if (!ADVOCATE_TOKEN) throw new Error("Set NEXT_PUBLIC_ADVOCATE before deploying.");

  console.log("📋 Configuration:");
  console.log("   Advocate Token:", ADVOCATE_TOKEN);
  console.log("   Architecture: Simplified (uses msg.sender, no EIP-712)");
  console.log("   Wallet Type: CDP Embedded Wallet (Account Abstraction)");
  console.log("   Gas Sponsorship: Coinbase CDP (whitelist after deployment)");
  console.log();

  // Deploy contract
  const PodGovernanceV3 = await ethers.getContractFactory("PodGovernanceV3");
  const podGovernance = await PodGovernanceV3.deploy(ADVOCATE_TOKEN);

  await podGovernance.waitForDeployment();
  const address = await podGovernance.getAddress();

  console.log("✅ PodGovernance V3 deployed to:", address);
  console.log();

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const advocateToken = await podGovernance.advocateToken();
  const forValue = await podGovernance.FOR();
  const againstValue = await podGovernance.AGAINST();
  const abstainValue = await podGovernance.ABSTAIN();

  console.log("   Advocate Token:", advocateToken);
  console.log("   Vote Values: FOR=" + forValue + ", AGAINST=" + againstValue + ", ABSTAIN=" + abstainValue);
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
  console.log("      → User clicks vote button");
  console.log("      → App calls sendUserOperation (CDP)");
  console.log("      → Contract validates voter and records vote");
  console.log("      → CDP sponsors all gas");
  console.log();
  console.log("🎉 Simplified architecture - no EIP-712 signatures needed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
