// scripts/mintMembership.cjs
const { ethers } = require("hardhat");

async function main() {
  const to      = "0x12a0cf22d632c859b793f852af03b9d515580244";
  const type    = 1;
  const nftAddr = "0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0";

  console.log("Minting to:", to, "type:", type);
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const Advocate = await ethers.getContractFactory("AdvocateMembership");
  const advocate  = Advocate.attach(nftAddr);

  const tx = await advocate.mint(to, type, "");
  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("✅ Minted!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
