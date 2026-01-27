/**
 * Deployment script for PodGovernance contract
 *
 * Usage:
 * npx hardhat run scripts/deploy-pod-governance.cjs --network base
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying PodGovernance contract...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Contract addresses
  const ADVOCATE_TOKEN = "0x3Ad7e51578294366035ea41aAf0A15f6037a3789"; // From your data

  // Vote recorder will be the backend service wallet
  // For now, use deployer address (update after deployment)
  const VOTE_RECORDER = deployer.address;

  console.log("📋 Configuration:");
  console.log("   Advocate Token:", ADVOCATE_TOKEN);
  console.log("   Vote Recorder:", VOTE_RECORDER);
  console.log();

  // Deploy contract
  const PodGovernance = await ethers.getContractFactory("PodGovernance");
  const podGovernance = await PodGovernance.deploy(ADVOCATE_TOKEN, VOTE_RECORDER);

  await podGovernance.waitForDeployment();
  const address = await podGovernance.getAddress();

  console.log("✅ PodGovernance deployed to:", address);
  console.log();

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const advocateToken = await podGovernance.advocateToken();
  const voteRecorder = await podGovernance.voteRecorder();
  const owner = await podGovernance.owner();

  console.log("   Advocate Token:", advocateToken);
  console.log("   Vote Recorder:", voteRecorder);
  console.log("   Owner:", owner);
  console.log();

  console.log("📝 Next steps:");
  console.log("   1. Update .env with:");
  console.log(`      NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=${address}`);
  console.log("   2. Create backend service wallet for vote recording");
  console.log("   3. Call setVoteRecorder() with service wallet address");
  console.log("   4. Verify contract on Basescan:");
  console.log(`      npx hardhat verify --network base ${address} ${ADVOCATE_TOKEN} ${VOTE_RECORDER}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
