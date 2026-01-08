/**
 * Onboarding Hat Minting Component
 *
 * Mints Beta Tester HAT and Advocate NFT to new users during onboarding
 * Uses CDP embedded wallet hooks directly (no wagmi required)
 *
 * Flow:
 * 1. Mint Beta Tester HAT (for permissions)
 * 2. Mint 1 Advocate NFT (for governance voting power)
 * 3. Auto-delegate NFT to user (activates voting power)
 */

'use client';

import React, { useState } from 'react';
import { useCurrentUser, useEvmAddress, useSendUserOperation } from '@coinbase/cdp-hooks';
import { encodeFunctionData, parseAbi } from 'viem';

interface OnboardingHatMintingProps {
  walletAddress: `0x${string}`;
  isFirstUser: boolean;
  onSuccess: (txHash: string) => void;
  onError: (error: Error) => void;
}

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}` | undefined;

const ADVOCATE_ABI = parseAbi([
  'function delegate(address delegatee) external',
]);

export function OnboardingHatMinting({
  walletAddress,
  isFirstUser,
  onSuccess,
  onError,
}: OnboardingHatMintingProps) {
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();

  const [txStatus, setTxStatus] = useState<'idle' | 'minting-hat' | 'minting-nft' | 'delegating' | 'success' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState<string>('Ready to begin');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Safety gate: Ensure CDP EVM context is fully ready
  const walletReady = Boolean(currentUser && evmAddress);

  const handleMintHat = async () => {
    try {
      // Verify wallet address exists
      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      if (!currentUser?.evmSmartAccounts?.[0]) {
        throw new Error('Smart account not available');
      }

      console.log('🎩 Starting onboarding process...');
      console.log('🔑 Recipient wallet address:', walletAddress);
      console.log('👤 User type:', isFirstUser ? 'First User (Executive Leader)' : 'Beta Tester');

      // ========================================
      // STEP 1: Mint Beta Tester HAT
      // ========================================
      setTxStatus('minting-hat');
      setCurrentStep('Granting access permissions...');
      console.log('📤 Step 1/3: Minting Beta Tester HAT...');

      const hatResponse = await fetch('/api/onboarding/mint-hat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          isFirstUser,
        }),
      });

      const hatResult = await hatResponse.json();

      if (!hatResult.success) {
        throw new Error(hatResult.error || 'HAT minting failed');
      }

      console.log('✅ HAT minted successfully!');
      console.log('   Transaction:', hatResult.transactionHash);
      console.log('   HAT:', hatResult.hatName);

      // ========================================
      // STEP 2: Mint Advocate NFT
      // ========================================
      setTxStatus('minting-nft');
      setCurrentStep('Granting governance voting power...');
      console.log('📤 Step 2/3: Minting Advocate NFT...');

      const nftResponse = await fetch('/api/onboarding/mint-advocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
        }),
      });

      const nftResult = await nftResponse.json();

      if (!nftResult.success) {
        // Don't fail onboarding if Advocate minting fails - user can get it later
        console.warn('⚠️ Advocate NFT minting failed:', nftResult.error);
        console.warn('   User can create governance proposals after receiving Advocate NFT manually');
      } else {
        console.log('✅ Advocate NFT minted successfully!');
        console.log('   Transaction:', nftResult.mintTransactionHash);

        // ========================================
        // STEP 3: Auto-delegate to self for voting power
        // ========================================
        if (nftResult.needsDelegation && ADVOCATE_ADDRESS) {
          setTxStatus('delegating');
          setCurrentStep('Activating voting power...');
          console.log('📤 Step 3/3: Delegating NFT to user for voting power...');

          try {
            const smartAccount = currentUser.evmSmartAccounts[0];

            const delegateCallData = encodeFunctionData({
              abi: ADVOCATE_ABI,
              functionName: 'delegate',
              args: [walletAddress],
            });

            const delegateResult = await sendUserOperation({
              evmSmartAccount: smartAccount,
              network: 'base',
              calls: [{
                to: ADVOCATE_ADDRESS,
                value: 0n,
                data: delegateCallData,
              }],
              useCdpPaymaster: true,
            });

            console.log('✅ Delegation successful! User now has voting power');
            console.log('   Operation:', delegateResult.userOperationHash);
          } catch (delegateError) {
            console.warn('⚠️ Auto-delegation failed:', delegateError);
            console.warn('   User will need to delegate manually from governance page');
            // Don't fail onboarding - delegation can be done later
          }
        }
      }

      // ========================================
      // SUCCESS: All done!
      // ========================================
      setTxHash(hatResult.transactionHash);
      setTxStatus('success');
      setCurrentStep('Complete!');
      onSuccess(hatResult.transactionHash);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('❌ Onboarding failed:', errorMsg);
      console.error('Full error:', err);
      setErrorMessage(errorMsg);
      setTxStatus('error');
      setCurrentStep('Failed');
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
            <p className="text-sm text-gray-600">{currentStep}</p>
          )}
          {(txStatus === 'minting-hat' || txStatus === 'minting-nft' || txStatus === 'delegating') && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-[#2F5D50] rounded-full"></div>
                <p className="text-sm text-gray-600">{currentStep}</p>
              </div>
              <div className="text-xs text-gray-500">
                {txStatus === 'minting-hat' && '📝 Step 1/3'}
                {txStatus === 'minting-nft' && '🎖️ Step 2/3'}
                {txStatus === 'delegating' && '🗳️ Step 3/3'}
              </div>
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
          disabled={!walletReady || txStatus === 'minting-hat' || txStatus === 'minting-nft' || txStatus === 'delegating'}
          className="sacred-primary-button"
          style={{
            width: '100%',
            background: !walletReady || txStatus === 'minting-hat' || txStatus === 'minting-nft' || txStatus === 'delegating' ? '#8FAAA1' : '#2F5D50',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 18px',
            fontSize: '16px',
            fontWeight: '500',
            letterSpacing: '0.02em',
            cursor: !walletReady || txStatus === 'minting-hat' || txStatus === 'minting-nft' || txStatus === 'delegating' ? 'not-allowed' : 'pointer',
            opacity: !walletReady || txStatus === 'minting-hat' || txStatus === 'minting-nft' || txStatus === 'delegating' ? 0.6 : 1,
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
          {txStatus === 'minting-hat' && 'Minting...'}
          {txStatus === 'minting-nft' && 'Minting...'}
          {txStatus === 'delegating' && 'Activating...'}
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
              Grants pod management + governance voting power
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
