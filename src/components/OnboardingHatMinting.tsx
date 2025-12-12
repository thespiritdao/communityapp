/**
 * Onboarding Hat Minting Component
 *
 * Mints Executive Pod Member hat to new users during testnet onboarding
 * Uses CDP embedded wallet hooks directly (no wagmi required)
 */

'use client';

import React, { useState } from 'react';
import { useSendEvmTransaction, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import {
  createMintBetaTesterHatCall,
  createMintExecutiveLeaderHatCall,
} from '@/services/executiveHatService';

interface OnboardingHatMintingProps {
  walletAddress: `0x${string}`;
  isFirstUser: boolean;
  onSuccess: (txHash: string) => void;
  onError: (error: Error) => void;
}

export function OnboardingHatMinting({
  walletAddress,
  isFirstUser,
  onSuccess,
  onError,
}: OnboardingHatMintingProps) {
  const { sendEvmTransaction, data } = useSendEvmTransaction();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Safety gate: Ensure CDP EVM context is fully ready
  const walletReady = Boolean(currentUser && evmAddress);

  const handleMintHat = async () => {
    try {
      setTxStatus('preparing');
      console.log('🎩 Preparing hat mint transaction...');

      // Verify wallet address exists
      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      console.log('🔑 Using wallet address:', walletAddress);

      // Create the hat minting call
      const hatCall = isFirstUser
        ? createMintExecutiveLeaderHatCall(walletAddress)
        : createMintBetaTesterHatCall(walletAddress);

      console.log('✅ Hat minting call created:', {
        isFirstUser,
        hatType: isFirstUser ? 'Executive Leader' : 'Beta Tester',
        recipient: walletAddress,
        contractAddress: hatCall.to,
      });

      console.log('📤 Sending transaction via CDP...');
      setTxStatus('pending');

      // Send transaction using CDP hook
      // CDP automatically uses:
      // - The currently signed-in user's EVM account
      // - The network configured in CDPReactProvider
      // - Proper gas settings and transaction type
      // DO NOT pass: evmAccount, network, chainId, or type
      const result = await sendEvmTransaction({
        transaction: {
          to: hatCall.to,
          data: hatCall.data,
          value: BigInt(hatCall.value || 0),
        },
      });

      console.log('📤 Transaction result:', result);

      if (result.transactionHash) {
        console.log('✅ Transaction confirmed:', result.transactionHash);
        setTxHash(result.transactionHash);
        setTxStatus('success');
        onSuccess(result.transactionHash);
      } else {
        throw new Error('No transaction hash returned');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('❌ Hat minting failed:', errorMsg);
      console.error('Full error:', err);
      setErrorMessage(errorMsg);
      setTxStatus('error');
      onError(err as Error);
    }
  };

  if (txStatus === 'success') {
    return (
      <div className="text-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="text-green-500 text-4xl">✅</div>
          <p className="text-sm text-gray-600 font-medium">Access Granted!</p>
          <p className="text-xs text-gray-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Status Display */}
        <div
          style={{
            background: 'rgba(143, 170, 161, 0.1)',
            border: '1px solid #D8D2C8',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          {txStatus === 'idle' && (
            <p className="text-sm text-gray-600">Ready to grant access</p>
          )}
          {txStatus === 'preparing' && (
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-[#2F5D50] rounded-full"></div>
              <p className="text-sm text-gray-600">Preparing transaction...</p>
            </div>
          )}
          {txStatus === 'pending' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-[#2F5D50] rounded-full"></div>
                <p className="text-sm text-gray-600">Transaction pending...</p>
              </div>
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#2F5D50] hover:underline"
                >
                  View on Basescan →
                </a>
              )}
            </div>
          )}
          {txStatus === 'error' && (
            <div className="text-red-600">
              <p className="text-sm font-medium">Transaction failed</p>
              <p className="text-xs mt-1">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleMintHat}
          disabled={!walletReady || txStatus === 'preparing' || txStatus === 'pending'}
          className="sacred-primary-button"
          style={{
            width: '100%',
            background: !walletReady || txStatus === 'preparing' || txStatus === 'pending' ? '#8FAAA1' : '#2F5D50',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 18px',
            fontSize: '16px',
            fontWeight: '500',
            letterSpacing: '0.02em',
            cursor: !walletReady || txStatus === 'preparing' || txStatus === 'pending' ? 'not-allowed' : 'pointer',
            opacity: !walletReady || txStatus === 'preparing' || txStatus === 'pending' ? 0.6 : 1,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (txStatus === 'idle' || txStatus === 'error') {
              e.currentTarget.style.background = '#254A40';
            }
          }}
          onMouseLeave={(e) => {
            if (txStatus === 'idle' || txStatus === 'error') {
              e.currentTarget.style.background = '#2F5D50';
            }
          }}
        >
          {txStatus === 'preparing' && 'Preparing...'}
          {txStatus === 'pending' && 'Confirming...'}
          {(txStatus === 'idle' || txStatus === 'error') && 'Grant Access'}
        </button>

        {/* Info */}
        <div
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#8FAAA1',
          }}
        >
          <p style={{ marginBottom: '4px' }}>
            ⛓️ Base Mainnet · Gas fees sponsored
          </p>
          {!isFirstUser && (
            <p style={{ fontStyle: 'italic' }}>
              This role grants you pod creation and management abilities for
              30 days
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
