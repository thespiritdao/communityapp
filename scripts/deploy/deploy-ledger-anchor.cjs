/**
 * Deployment script for LedgerAnchor (Congregant Phase 6)
 *
 * Anchors periodic Merkle roots of the activity ledger onchain, making the
 * ledger tamper-evident.
 *
 * Usage:
 * npx hardhat run scripts/deploy/deploy-ledger-anchor.cjs --network base
 *
 * Owner defaults to the pod-admin EOA (which also sends the weekly anchoring
 * transactions from the cron).
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const initialOwner = process.env.LEDGER_ANCHOR_OWNER || deployer.address;

  console.log("🚀 Deploying LedgerAnchor...");
  console.log("📝 Deployer:", deployer.address);
  console.log("📋 Initial owner:", initialOwner);
  console.log();

  const LedgerAnchor = await ethers.getContractFactory("LedgerAnchor");
  const contract = await LedgerAnchor.deploy(initialOwner);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("✅ LedgerAnchor deployed to:", address);
  console.log();
  console.log("📝 Next steps:");
  console.log(`   1. Set NEXT_PUBLIC_LEDGER_ANCHOR=${address} (Vercel + .env)`);
  console.log("   2. Verify on Basescan:");
  console.log(`      npx hardhat verify --network base ${address} ${initialOwner}`);
  console.log("   3. The anchor-ledger cron posts weekly roots automatically.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
