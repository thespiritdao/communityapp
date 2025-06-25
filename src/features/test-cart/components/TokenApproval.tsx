'use client';

import React from 'react';
import { useWriteContract } from '@coinbase/onchainkit';
import { TOKENS } from '../constants';

interface TokenApprovalProps {
  selectedToken: 'SELF' | 'SYSTEM' | null;
  amount: number;
  onApprovalComplete: () => void;
}

export function TokenApproval({ selectedToken, amount, onApprovalComplete }: TokenApprovalProps) {
  const spenderAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
  
  const { writeContract, isPending } = useWriteContract();

  const handleApprove = async () => {
    if (!selectedToken) return;

    try {
      await writeContract({
        address: TOKENS[selectedToken],
        abi: [
          {
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ type: 'bool' }]
          }
        ],
        functionName: 'approve',
        args: [spenderAddress, BigInt(amount * 1e18)],
      });
      onApprovalComplete();
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  if (!selectedToken) return null;

  return (
    <div className="p-4 bg-yellow-50 rounded-lg mb-4">
      <h3 className="text-lg font-semibold mb-2">Token Approval Required</h3>
      <p className="text-gray-600 mb-4">
        You need to approve the contract to spend your {selectedToken} tokens before proceeding with the purchase.
      </p>
      <button
        onClick={handleApprove}
        disabled={isPending}
        className={`w-full py-2 rounded font-semibold ${
          isPending
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-yellow-500 text-white hover:bg-yellow-600'
        }`}
      >
        {isPending ? 'Approving...' : `Approve ${selectedToken} Tokens`}
      </button>
    </div>
  );
}