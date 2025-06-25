import { ethers } from "hardhat";

async function main() {
  // Hard‑coded for testing:
  const to   = "0x12a0cf22d632c859b793f852af03b9d515580244";
  const type = 1;  // or 0, depending on how your contract interprets memberType

  const nftAddr = "0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0";

  // sanity check
  console.log("Minting to:", to, "with type:", type, "on NFT contract:", nftAddr);

  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const Advocate = await ethers.getContractFactory("AdvocateMembership");
  const advocate  = Advocate.attach(nftAddr);

  console.log(`Calling mint("${to}", ${type}, "")…`);
  const tx = await advocate.mint(to, type, "");
  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("✅ Minted!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
