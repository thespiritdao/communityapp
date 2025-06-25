// src/features/test-cart/components/Checkout.tsx
'use client';

import React from 'react';
import { useWriteContract } from '@coinbase/onchainkit';  
import { TOKENS } from '../constants';
import { CartItem } from '../types';

interface CheckoutProps {
  items: CartItem[];
  total: number;
  selectedToken: 'SELF' | 'SYSTEM' | null;
  onTokenSelect: (token: 'SELF' | 'SYSTEM') => void;
}

export function Checkout({ items, total, selectedToken, onTokenSelect }: CheckoutProps) {
  const purchaseContract = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
  const { writeContract, isPending } = useWriteContract();

  const handlePurchase = async () => {
    if (!selectedToken) return;

    try {
      await writeContract({
        address: purchaseContract,
        abi: [
          {
            name: 'purchase',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ type: 'bool' }]
          }
        ],
        functionName: 'purchase',
        args: [TOKENS[selectedToken], BigInt(total * 1e18)],
      });
    } catch (error) {
      console.error('Purchase failed:', error);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Checkout</h2>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Select Payment Token</h3>
        <div className="flex space-x-4">
          <button
            onClick={() => onTokenSelect('SELF')}
            className={`px-4 py-2 rounded ${
              selectedToken === 'SELF' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200'
            }`}
          >
            SELF Token
          </button>
          <button
            onClick={() => onTokenSelect('SYSTEM')}
            className={`px-4 py-2 rounded ${
              selectedToken === 'SYSTEM' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200'
            }`}
          >
            SYSTEM Token
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Order Summary</h3>
        <div className="bg-gray-50 p-4 rounded">
          <div className="flex justify-between mb-2">
            <span>Subtotal:</span>
            <span>${total}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span>Gas Fee:</span>
            <span>Sponsored</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total:</span>
            <span>${total}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handlePurchase}
        disabled={!selectedToken || isPending}
        className={`w-full py-3 rounded font-semibold ${
          !selectedToken || isPending
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isPending ? 'Processing...' : 'Complete Purchase'}
      </button>
    </div>
  );
}
