// src/utils/tokenCheck.ts

import { readContract } from "@wagmi/actions";
import { getAccount } from "wagmi/actions";

// Minimal ABIs for testing
export const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];

export const erc721Abi = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];

// Environment Variables for Tokens
const SYSTEM_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
const PROOF_OF_CURIOSITY_CONTRACT = process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY as `0x${string}`;
// MARKET_ADMIN_TOKEN_CONTRACT removed - replaced by MARKET_MANAGEMENT Hat token
const NETWORK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "8453"); // Base Chain

// Debug logging (optional)
console.log("SYSTEM_TOKEN_CONTRACT:", SYSTEM_TOKEN_CONTRACT);
console.log("SELF_TOKEN_CONTRACT:", SELF_TOKEN_CONTRACT);
console.log("PROOF_OF_CURIOSITY_CONTRACT:", PROOF_OF_CURIOSITY_CONTRACT);
// MARKET_ADMIN_TOKEN_CONTRACT debug logging removed

export async function fetchTokenBalances(walletAddress: string): Promise<{
  hasProofOfCuriosity: boolean;
  hasMarketManagement: boolean;
  systemBalance: bigint;
  selfBalance: bigint;
}> {
  try {
    // Ensure required contract addresses are available
    if (!SYSTEM_TOKEN_CONTRACT || !SELF_TOKEN_CONTRACT || !PROOF_OF_CURIOSITY_CONTRACT) {
      console.error("❌ Missing required token contract addresses in .env.");
      return { hasProofOfCuriosity: false, hasMarketManagement: false, systemBalance: 0n, selfBalance: 0n };
    }

    // Market admin call removed - this function now only handles basic tokens
    // Market management is checked via Hat tokens in the main fetchTokenBalances function

    const [proofOfCuriosity, systemBalance, selfBalance] = await Promise.all([
      readContract({
        address: PROOF_OF_CURIOSITY_CONTRACT,
        abi: erc721Abi, // Using ERC721 ABI for membership token
        functionName: "balanceOf",
        args: [walletAddress],
        chainId: NETWORK_CHAIN_ID,
      }),
      readContract({
        address: SYSTEM_TOKEN_CONTRACT,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
        chainId: NETWORK_CHAIN_ID,
      }),
      readContract({
        address: SELF_TOKEN_CONTRACT,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
        chainId: NETWORK_CHAIN_ID,
      })
    ]);

    console.log("ProofOfCuriosity balance:", proofOfCuriosity.toString());
    // Market admin balance logging removed

    return {
      hasProofOfCuriosity: proofOfCuriosity > 0n,
      hasMarketManagement: false, // This simplified function doesn't check Hat tokens
      systemBalance,
      selfBalance,
    };
  } catch (error) {
    console.error("❌ Error fetching token balances:", error);
    return { hasProofOfCuriosity: false, hasMarketManagement: false, systemBalance: 0n, selfBalance: 0n };
  }
}
