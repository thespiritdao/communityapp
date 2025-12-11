/**
 * Onboarding Hat Minting Component
 *
 * Mints Executive Pod Member hat to new users during testnet onboarding
 * Uses Coinbase OnchainKit Transaction with sponsored transactions
 */

'use client';

import React, { useEffect, useState } from 'react';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
import { useAccount } from 'wagmi';
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
  const { address } = useAccount();
  const [contracts, setContracts] = useState<any[]>([]);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔍 OnboardingHatMinting - checking prerequisites:', {
      wagmiAddress: address,
      walletAddress,
      isFirstUser,
      hasWagmiAddress: !!address,
      hasWalletAddress: !!walletAddress,
    });

    // Use walletAddress from props - don't wait for wagmi address
    // CDP embedded wallet may not sync with wagmi immediately
    if (!walletAddress) {
      console.log('⏳ Waiting for wallet address...');
      return;
    }

    // Set timeout to show error if preparation takes too long
    const timeoutId = setTimeout(() => {
      if (contracts.length === 0) {
        const errorMsg = 'Transaction preparation is taking longer than expected. This might be a connectivity issue.';
        console.error('⏰', errorMsg);
        setPreparationError(errorMsg);
      }
    }, 10000); // 10 seconds

    try {
      console.log('🎩 Creating hat minting call for:', walletAddress);

      // First user gets Executive Leader hat, others get Beta Tester hat
      const hatCall = isFirstUser
        ? createMintExecutiveLeaderHatCall(walletAddress)
        : createMintBetaTesterHatCall(walletAddress);

      console.log('✅ Hat minting call created:', {
        isFirstUser,
        hatType: isFirstUser ? 'Executive Leader' : 'Beta Tester',
        recipient: walletAddress,
        contractAddress: hatCall.to,
        callData: hatCall.data?.substring(0, 20) + '...',
      });

      setContracts([hatCall]);
      clearTimeout(timeoutId); // Clear timeout if successful
    } catch (error) {
      console.error('❌ Error creating hat minting call:', error);
      clearTimeout(timeoutId);
      setPreparationError(error instanceof Error ? error.message : 'Unknown error');
      onError(error as Error);
    }

    return () => clearTimeout(timeoutId);
  }, [walletAddress, isFirstUser]); // Removed address dependency

  const handleSuccess = (response: any) => {
    console.log('✅ Hat minted successfully:', response);
    const txHash =
      response?.transactionReceipts?.[0]?.transactionHash ||
      response?.hash ||
      '';
    onSuccess(txHash);
  };

  const handleError = (error: any) => {
    console.error('❌ Hat minting failed:', error);
    onError(error);
  };

  if (contracts.length === 0) {
    return (
      <div className="text-center p-4">
        <div className="flex flex-col items-center gap-3">
          {!preparationError ? (
            <>
              <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-[#2F5D50] rounded-full"></div>
              <p className="text-sm text-gray-600">Preparing transaction...</p>
              <p className="text-xs text-gray-400">
                This may take a few moments
              </p>
            </>
          ) : (
            <>
              <div className="text-red-500 text-4xl">⚠️</div>
              <p className="text-sm text-red-600 font-medium">Transaction Preparation Failed</p>
              <p className="text-xs text-gray-500 max-w-sm">
                {preparationError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 bg-[#2F5D50] text-white rounded-lg text-sm hover:bg-[#254A40]"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Transaction
        chainId={8453} // Base Mainnet
        calls={contracts}
        onSuccess={handleSuccess}
        onError={handleError}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Transaction Status */}
          <div
            style={{
              background: 'rgba(143, 170, 161, 0.1)',
              border: '1px solid #D8D2C8',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <TransactionStatus>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </div>
            </TransactionStatus>
          </div>

          {/* Action Button - Sacred Primary Action Style */}
          <TransactionButton
            text="Grant Access"
            className="sacred-primary-button"
          />

          <style jsx>{`
            :global(.sacred-primary-button) {
              width: 100% !important;
              background: #2F5D50 !important;
              color: #FFFFFF !important;
              border: none !important;
              border-radius: 12px !important;
              padding: 12px 18px !important;
              font-size: 16px !important;
              font-weight: 500 !important;
              letter-spacing: 0.02em !important;
              cursor: pointer !important;
              transition: all 0.2s ease !important;
            }

            :global(.sacred-primary-button:hover) {
              background: #254A40 !important;
            }

            :global(.sacred-primary-button:disabled) {
              opacity: 0.6 !important;
              cursor: not-allowed !important;
            }
          `}</style>

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
      </Transaction>
    </div>
  );
}
