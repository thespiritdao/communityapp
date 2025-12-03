//src/features/identity/components/UnlockMembership.tsx

import type React from 'react';
import { useContractRead } from 'wagmi';
import { UNLOCK_PUBLIC_LOCK_ABI } from '@/app/api/utils/contractABI';

interface UnlockMembershipProps {
  walletAddress: string;
  contractAddress: string;
}

export const UnlockMembership: React.FC<UnlockMembershipProps> = ({
  walletAddress,
  contractAddress,
}) => {
  // Use wagmi to call the 'balanceOf' function using your Unlock Public Lock ABI
  const {
    data: balance,
    isLoading,
    isError,
  } = useContractRead({
    address: contractAddress as `0x${string}`,
    abi: UNLOCK_PUBLIC_LOCK_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  });

  if (isLoading) return <p>Loading membership status...</p>;
  if (isError) return <p>Error fetching membership status.</p>;

  // Determine if the user holds any membership tokens
  const hasMembership =
    typeof balance === 'bigint'
      ? balance > 0n
      : typeof balance === 'number'
        ? balance > 0
        : false;

  return (
    <div>
      {hasMembership ? (
        <p>User holds membership tokens. Balance: {balance ? String(balance) : '0'}</p>
      ) : (
        <p>No membership tokens found.</p>
      )}
    </div>
  );
};
