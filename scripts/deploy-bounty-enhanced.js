const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Enhanced BountyManager...");

  // Get the contract factory
  const BountyManagerEnhanced = await ethers.getContractFactory("BountyManagerEnhanced");

  // Deploy SYSTEM and SELF tokens first (if not already deployed)
  const SystemToken = await ethers.getContractFactory("SystemToken");
  const SelfToken = await ethers.getContractFactory("SelfToken");

  console.log("Deploying SYSTEM token...");
  const systemToken = await SystemToken.deploy();
  await systemToken.deployed();
  console.log("SYSTEM token deployed to:", systemToken.address);

  console.log("Deploying SELF token...");
  const selfToken = await SelfToken.deploy();
  await selfToken.deployed();
  console.log("SELF token deployed to:", selfToken.address);

  // Deploy the enhanced bounty manager
  console.log("Deploying Enhanced BountyManager...");
  const bountyManager = await BountyManagerEnhanced.deploy(
    systemToken.address,
    selfToken.address
  );
  await bountyManager.deployed();

  console.log("Enhanced BountyManager deployed to:", bountyManager.address);

  // Grant roles to the deployer
  const [deployer] = await ethers.getSigners();
  
  console.log("Setting up roles...");
  await bountyManager.grantRole(await bountyManager.BOUNTY_CREATOR_ROLE(), deployer.address);
  await bountyManager.grantRole(await bountyManager.BOUNTY_REVIEWER_ROLE(), deployer.address);
  
  console.log("Roles granted to deployer:", deployer.address);

  // Verify deployment
  console.log("\n=== Deployment Summary ===");
  console.log("Enhanced BountyManager:", bountyManager.address);
  console.log("SYSTEM Token:", systemToken.address);
  console.log("SELF Token:", selfToken.address);
  console.log("Deployer:", deployer.address);
  console.log("Deployer has BOUNTY_CREATOR_ROLE:", await bountyManager.hasRole(await bountyManager.BOUNTY_CREATOR_ROLE(), deployer.address));
  console.log("Deployer has BOUNTY_REVIEWER_ROLE:", await bountyManager.hasRole(await bountyManager.BOUNTY_REVIEWER_ROLE(), deployer.address));

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    bountyManager: bountyManager.address,
    systemToken: systemToken.address,
    selfToken: selfToken.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  const fs = require('fs');
  fs.writeFileSync(
    `deployment-${network.name}-${Date.now()}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment info saved to file.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 