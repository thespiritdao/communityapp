// src/utils/tokenGateService.ts
import { fetchTokenBalances, TokenBalances, fetchERC1155Balance } from './fetchTokenBalances';

export async function fetchUnifiedTokenBalances(walletAddress: string): Promise<{
  hasProofOfCuriosity: boolean;
  hasERC1155Admin: boolean;
  systemBalance: string;
  selfBalance: string;
}> {
  // Get ERC-721 and ERC-20 based balances
  const balances: TokenBalances = await fetchTokenBalances(walletAddress);

  // Only check the admin token if the environment variable is defined
  const adminTokenAddress = process.env.NEXT_PUBLIC_ADMIN_ERC1155;
  let hasERC1155Admin = false;
  if (adminTokenAddress) {
    try {
      // Check admin token balance using ERC-1155
      const adminBalance = await fetchERC1155Balance(walletAddress, adminTokenAddress as `0x${string}`, 1);
      hasERC1155Admin = adminBalance > 0n;
    } catch (error) {
      console.error("Error fetching ERC1155 admin token balance:", error);
      hasERC1155Admin = false;
    }
  } else {
    // For the main DAO forum, we don’t require the admin token.
    hasERC1155Admin = false;
  }

  return {
    hasProofOfCuriosity: balances.hasProofOfCuriosity,
    hasERC1155Admin,
    systemBalance: balances.systemBalance,
    selfBalance: balances.selfBalance,
  };
}
