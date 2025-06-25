const { ethers } = require("hardhat");

async function main() {
  console.log("Testing Enhanced Bounty System...");

  // Get signers
  const [deployer, reviewer1, reviewer2, bidder1, bidder2] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Reviewer 1:", reviewer1.address);
  console.log("Reviewer 2:", reviewer2.address);
  console.log("Bidder 1:", bidder1.address);
  console.log("Bidder 2:", bidder2.address);

  // Deploy tokens
  const SystemToken = await ethers.getContractFactory("SystemToken");
  const SelfToken = await ethers.getContractFactory("SelfToken");

  console.log("\nDeploying tokens...");
  const systemToken = await SystemToken.deploy();
  const selfToken = await SelfToken.deploy();
  await systemToken.deployed();
  await selfToken.deployed();

  console.log("SYSTEM token:", systemToken.address);
  console.log("SELF token:", selfToken.address);

  // Deploy enhanced bounty manager
  const BountyManagerEnhanced = await ethers.getContractFactory("BountyManagerEnhanced");
  console.log("\nDeploying Enhanced BountyManager...");
  const bountyManager = await BountyManagerEnhanced.deploy(
    systemToken.address,
    selfToken.address
  );
  await bountyManager.deployed();
  console.log("Enhanced BountyManager:", bountyManager.address);

  // Setup roles
  console.log("\nSetting up roles...");
  await bountyManager.grantRole(await bountyManager.BOUNTY_CREATOR_ROLE(), deployer.address);
  await bountyManager.grantRole(await bountyManager.BOUNTY_REVIEWER_ROLE(), deployer.address);
  await bountyManager.grantRole(await bountyManager.BOUNTY_REVIEWER_ROLE(), reviewer1.address);
  await bountyManager.grantRole(await bountyManager.BOUNTY_REVIEWER_ROLE(), reviewer2.address);

  // Mint tokens to deployer
  console.log("\nMinting tokens...");
  const mintAmount = ethers.utils.parseEther("10000");
  await systemToken.mint(deployer.address, mintAmount);
  await selfToken.mint(deployer.address, mintAmount);
  console.log("Minted 10,000 tokens to deployer");

  // Approve tokens for bounty manager
  console.log("\nApproving tokens...");
  await systemToken.approve(bountyManager.address, mintAmount);
  await selfToken.approve(bountyManager.address, mintAmount);
  console.log("Approved tokens for bounty manager");

  // Test 1: Create a milestone-based bounty
  console.log("\n=== Test 1: Milestone-based Bounty ===");
  
  const bountyValue = ethers.utils.parseEther("1000");
  const reviewers = [reviewer1.address, reviewer2.address];
  
  console.log("Creating milestone-based bounty...");
  await bountyManager.createBounty(
    "Build Mobile App",
    "Develop a React Native mobile application",
    "Development",
    bountyValue,
    systemToken.address,
    reviewers,
    1, // PaymentStructure.Milestones
    ethers.utils.parseEther("0"), // upfront
    bountyValue // completion
  );
  console.log("Bounty created with ID: 0");

  // Test 2: Place bids
  console.log("\n=== Test 2: Placing Bids ===");
  
  console.log("Bidder 1 placing bid...");
  await bountyManager.connect(bidder1).placeBid(0);
  console.log("Bidder 2 placing bid...");
  await bountyManager.connect(bidder2).placeBid(0);

  // Test 3: Assign bounty
  console.log("\n=== Test 3: Assigning Bounty ===");
  
  console.log("Assigning bounty to bidder 1...");
  await bountyManager.assignBounty(0, bidder1.address);
  
  // Check escrow
  const escrowBalance = await bountyManager.getEscrowBalance(systemToken.address);
  console.log("Escrow balance:", ethers.utils.formatEther(escrowBalance), "SYSTEM");

  // Test 4: Create milestones
  console.log("\n=== Test 4: Creating Milestones ===");
  
  const milestoneDescriptions = ["UI Design", "Core Features", "Testing & Launch"];
  const dueDates = [
    Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60, // 14 days
    Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60, // 21 days
  ];
  const paymentAmounts = [
    ethers.utils.parseEther("300"),
    ethers.utils.parseEther("500"),
    ethers.utils.parseEther("200"),
  ];

  console.log("Creating milestones...");
  await bountyManager.createMilestones(0, milestoneDescriptions, dueDates, paymentAmounts);
  console.log("Milestones created");

  // Test 5: Approve milestones
  console.log("\n=== Test 5: Approving Milestones ===");
  
  // Get milestone IDs
  const milestoneIds = await bountyManager.getBountyMilestones(0);
  console.log("Milestone IDs:", milestoneIds.map(id => id.toString()));

  // Approve first milestone
  console.log("Reviewer 1 approving milestone 0...");
  await bountyManager.connect(reviewer1).approveMilestone(0, milestoneIds[0]);
  console.log("Reviewer 2 approving milestone 0...");
  await bountyManager.connect(reviewer2).approveMilestone(0, milestoneIds[0]);

  // Check payment
  const bidder1Balance = await systemToken.balanceOf(bidder1.address);
  console.log("Bidder 1 balance after milestone 0:", ethers.utils.formatEther(bidder1Balance), "SYSTEM");

  // Test 6: Complete all milestones
  console.log("\n=== Test 6: Completing All Milestones ===");
  
  for (let i = 1; i < milestoneIds.length; i++) {
    console.log(`Approving milestone ${i}...`);
    await bountyManager.connect(reviewer1).approveMilestone(0, milestoneIds[i]);
    await bountyManager.connect(reviewer2).approveMilestone(0, milestoneIds[i]);
  }

  // Check final balances
  const finalBidder1Balance = await systemToken.balanceOf(bidder1.address);
  const finalEscrowBalance = await bountyManager.getEscrowBalance(systemToken.address);
  
  console.log("\n=== Final Results ===");
  console.log("Bidder 1 final balance:", ethers.utils.formatEther(finalBidder1Balance), "SYSTEM");
  console.log("Final escrow balance:", ethers.utils.formatEther(finalEscrowBalance), "SYSTEM");
  console.log("Bounty status:", await bountyManager.getBounty(0));

  console.log("\n✅ Enhanced bounty system test completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 