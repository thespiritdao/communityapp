// scripts/mint.js
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  // ─── YOUR CONFIG ──────────────────────────────────────────────────────────
  // 1) The RPC URL for Base (or whichever network you deployed to):
  const RPC_URL = process.env.RPC_URL || "https://mainnet.base.org";
  // 2) Your private key (the one that has the minting permissions):
  const PK      = process.env.PRIVATE_KEY!;
  // 3) Your deployed AdvocateMembership address:
  const NFT_ADDR = "0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0";
  // 4) The wallet you want to mint _to_:
  const TO       = "0x12a0cf22d632c859b793f852af03b9d515580244";
  // 5) The memberType argument your contract expects (probably 0 or 1):
  const MEMBER_TYPE = 1;
  // ──────────────────────────────────────────────────────────────────────────

  if (!PK) {
    console.error("❌ Please set PRIVATE_KEY in your .env");
    process.exit(1);
  }

  // Load the ABI you already have in src/abis:
  const abiPath = path.resolve(__dirname, "../src/abis/AdvocateMembershipABI.json");
  const { abi } = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  // Set up provider & signer:
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PK, provider);

  console.log(`›› Minting on ${provider.connection.url}`);
  console.log(`›› From: ${wallet.address}`);
  console.log(`›› To:   ${TO}, type=${MEMBER_TYPE}`);
  console.log(`›› NFT:  ${NFT_ADDR}`);

  // Attach to your contract:
  const contract = new ethers.Contract(NFT_ADDR, abi, wallet);

  // Send the transaction:
  const tx = await contract.mint(TO, MEMBER_TYPE, "");
  console.log("⏳ tx submitted:", tx.hash);
  await tx.wait();
  console.log("✅ Minted!");  
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
