// src/utils/tokenGateService.ts
import {
  fetchTokenBalances,
  type TokenBalance,
} from './fetchTokenBalances';

export async function fetchUnifiedTokenBalances(
  walletAddress: string,
): Promise<{
  hasProofOfCuriosity: boolean;
  hasERC1155Admin: boolean;
  systemBalance: string;
  selfBalance: string;
}> {
  // Get ERC-721 and ERC-20 based balances
  const balances: TokenBalance = await fetchTokenBalances(walletAddress);

  // TODO: ERC1155 admin token check removed - fetchERC1155Balance function doesn't exist
  // For the main DAO forum, we don't require the admin token.
  const hasERC1155Admin = false;

  return {
    hasProofOfCuriosity: balances.hasProofOfCuriosity,
    hasERC1155Admin,
    systemBalance: balances.systemBalance,
    selfBalance: balances.selfBalance,
  };
}
