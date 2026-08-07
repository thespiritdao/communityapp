/**
 * Onboarding Minting Component
 *
 * For first user: mints Executive Leader HAT
 * For all other users: mints Proof of Curiosity token (gasless via CDP paymaster)
 */

'use client';

import React, { useState } from 'react';
import { useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
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

  const totalSteps = isFirstUser ? 3 : 1;
  const [txStatus, setTxStatus] = useState<'idle' | 'minting-hat' | 'minting-poc' | 'minting-nft' | 'delegating' | 'success' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState<string>('Ready to begin');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const walletReady = Boolean(currentUser && evmAddress);

  const handleMint = async () => {
    let finalHash = 'confirmed';
    try {
      if (!walletAddress) throw new Error('No wallet address available');
      if (!currentUser?.evmSmartAccounts?.[0]) throw new Error('Smart account not available');

      if (isFirstUser) {
        // ── First user: mint Executive Leader HAT + Advocate NFT + delegate ──
        // NOTE: This founding-user bootstrap has already run in production. The
        // mint-hat / mint-advocate routes are now server-to-server only
        // (internal secret), so this browser branch would 401. It is retained
        // only for a fresh-environment bootstrap; if ever needed again, run the
        // bootstrap server-side with INTERNAL_API_SECRET rather than here.

        setTxStatus('minting-hat');
        setCurrentStep('Granting platform access...');

        const hatResponse = await fetch('/api/onboarding/mint-hat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, isFirstUser }),
        });
        const hatResult = await hatResponse.json();
        if (!hatResult.success) throw new Error(hatResult.error || 'HAT minting failed');

        setTxStatus('minting-nft');
        setCurrentStep('Granting governance voting power...');

        const nftResponse = await fetch('/api/onboarding/mint-advocate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
        });
        const nftResult = await nftResponse.json();

        if (nftResult.success && nftResult.needsDelegation && ADVOCATE_ADDRESS) {
          setTxStatus('delegating');
          setCurrentStep('Activating voting power...');
          try {
            const smartAccount = currentUser.evmSmartAccounts[0];
            const delegateCallData = encodeFunctionData({
              abi: ADVOCATE_ABI,
              functionName: 'delegate',
              args: [walletAddress],
            });
            await sendUserOperation({
              evmSmartAccount: smartAccount,
              network: 'base',
              calls: [{ to: ADVOCATE_ADDRESS, value: 0n, data: delegateCallData }],
              useCdpPaymaster: true,
            });
          } catch {
            // Non-critical — user can delegate later
          }
        }

        setTxHash(hatResult.transactionHash);
      finalHash = hatResult.transactionHash;

      } else {
        // ── Regular user: mint Proof of Curiosity token ──

        setTxStatus('minting-poc');
        setCurrentStep('Minting membership token...');

        const pocResponse = await fetch('/api/onboarding/mint-poc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
        });
        const pocResult = await pocResponse.json();
        if (!pocResult.success) throw new Error(pocResult.error || 'Membership token minting failed');

        finalHash = pocResult.transactionHash || 'confirmed';
        setTxHash(finalHash);
      }

      setTxStatus('success');
      setCurrentStep('Complete!');
      onSuccess(finalHash);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
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

  const isProcessing = txStatus === 'minting-hat' || txStatus === 'minting-poc' || txStatus === 'minting-nft' || txStatus === 'delegating';
  const stepLabel =
    txStatus === 'minting-hat' ? `📝 Step 1/${totalSteps}` :
    txStatus === 'minting-poc' ? `🌱 Step 1/1` :
    txStatus === 'minting-nft' ? `🎖️ Step 2/${totalSteps}` :
    txStatus === 'delegating'  ? `🗳️ Step 3/${totalSteps}` : '';

  return (
    <div className="w-full">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          {isProcessing && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-[#2F5D50] rounded-full"></div>
                <p className="text-sm text-gray-600">{currentStep}</p>
              </div>
              <div className="text-xs text-gray-500">{stepLabel}</div>
            </div>
          )}
          {txStatus === 'error' && (
            <div className="text-red-600">
              <p className="text-sm font-medium">Transaction failed</p>
              <p className="text-xs mt-1">{errorMessage}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleMint}
          disabled={!walletReady || isProcessing}
          className="sacred-primary-button"
          style={{
            width: '100%',
            background: !walletReady || isProcessing ? '#8FAAA1' : '#2F5D50',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 18px',
            fontSize: '16px',
            fontWeight: '500',
            letterSpacing: '0.02em',
            cursor: !walletReady || isProcessing ? 'not-allowed' : 'pointer',
            opacity: !walletReady || isProcessing ? 0.6 : 1,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!isProcessing) e.currentTarget.style.background = '#254A40';
          }}
          onMouseLeave={(e) => {
            if (!isProcessing) e.currentTarget.style.background = '#2F5D50';
          }}
        >
          {isProcessing ? 'Processing...' : 'Grant Access'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '12px', color: '#8FAAA1' }}>
          <p style={{ marginBottom: '4px' }}>⛓️ Base Mainnet · Gas fees sponsored</p>
          {!isFirstUser && (
            <p style={{ fontStyle: 'italic' }}>Grants access to community features</p>
          )}
        </div>
      </div>
    </div>
  );
}
