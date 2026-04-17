'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  FileText,
  PenTool,
  X,
  Shield,
  AlertCircle,
  ExternalLink,
  CheckCircle,
} from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { AgreementIPFSService } from '../services/AgreementIPFSService';
import { keccak256, toHex, encodeFunctionData } from 'viem';
import { useSendUserOperationWithAttribution } from '@/wallet/hooks/useSendUserOperationWithAttribution';

interface OnChainAgreementSigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementCid: string;
  eligibilityModuleAddress: `0x${string}`;
  hatId: bigint;
  podName: string;
  onSuccess?: () => void;
}

/**
 * On-Chain Agreement Signing Modal
 *
 * This modal handles ON-CHAIN agreement signatures for eligibility criteria.
 * Different from MembershipAgreementModal which handles OFF-CHAIN membership applications.
 *
 * Flow:
 * 1. Fetch agreement text from IPFS using CID
 * 2. Display agreement to user
 * 3. User signs on-chain via eligibility module contract
 * 4. Signature is stored on-chain and checked by eligibility module
 */
export const OnChainAgreementSigningModal: React.FC<
  OnChainAgreementSigningModalProps
> = ({
  isOpen,
  onClose,
  agreementCid,
  eligibilityModuleAddress,
  hatId,
  podName,
  onSuccess,
}) => {
  const [agreementText, setAgreementText] = useState<string>('');
  const [isLoadingAgreement, setIsLoadingAgreement] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [hasAlreadySigned, setHasAlreadySigned] = useState(false);
  const [checkingSignatureStatus, setCheckingSignatureStatus] = useState(false);

  const { toast } = useToast();
  const { evmAddress: address } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperationWithAttribution();
  const publicClient = usePublicClient();

  // Eligibility Module ABI - only the functions we need
  // FIXED: Updated to match actual EligibilityModule.sol contract signatures
  const ELIGIBILITY_MODULE_ABI = [
    {
      name: 'signAgreement',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: '_agreementHash', type: 'bytes32' }, // ✅ FIXED: Only ONE parameter (not two)
      ],
      outputs: [],
    },
    {
      name: 'hasSignedAgreement',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: '_agreementHash', type: 'bytes32' }, // ✅ FIXED: agreementHash is FIRST
        { name: '_user', type: 'address' }, // ✅ FIXED: user address is SECOND
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const;

  // Hats Protocol ABI - for minting HATs
  const HATS_PROTOCOL_ABI = [
    {
      name: 'mintHat',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'hatId', type: 'uint256' },
        { name: 'wearer', type: 'address' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'wearer', type: 'address' },
        { name: 'hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const;

  const HATS_PROTOCOL_ADDRESS =
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;

  // Fetch agreement from IPFS when modal opens
  useEffect(() => {
    if (isOpen && agreementCid) {
      fetchAgreementFromIPFS();
      checkIfAlreadySigned();
    }
  }, [isOpen, agreementCid]);

  const fetchAgreementFromIPFS = async () => {
    try {
      setIsLoadingAgreement(true);
      console.log('📥 Fetching agreement from IPFS:', agreementCid);

      const text = await AgreementIPFSService.fetchAgreement(agreementCid);
      setAgreementText(text);

      console.log('✅ Agreement loaded successfully');
    } catch (error: any) {
      console.error('❌ Failed to fetch agreement:', error);
      toast({
        title: 'Failed to Load Agreement',
        description: error.message || 'Could not fetch agreement from IPFS',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAgreement(false);
    }
  };

  const checkIfAlreadySigned = async () => {
    if (!address || !publicClient) return;

    try {
      setCheckingSignatureStatus(true);
      console.log('🔍 Checking if user has already signed agreement...');

      // Create agreement hash from CID to check signature status
      const agreementHash = keccak256(toHex(agreementCid));

      const result = await publicClient.readContract({
        address: eligibilityModuleAddress,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'hasSignedAgreement',
        args: [agreementHash, address], // ✅ FIXED: agreementHash first, then address
      });

      setHasAlreadySigned(result as boolean);

      if (result) {
        console.log('✅ User has already signed this agreement');
      } else {
        console.log('📝 User has not signed this agreement yet');
      }
    } catch (error: any) {
      console.error('⚠️ Error checking signature status:', error);
      // Don't show error to user, just assume they haven't signed
      setHasAlreadySigned(false);
    } finally {
      setCheckingSignatureStatus(false);
    }
  };

  const handleSignAgreement = async () => {
    if (!address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to sign the agreement.',
        variant: 'destructive',
      });
      return;
    }

    if (!agreementText.trim()) {
      toast({
        title: 'Agreement Not Loaded',
        description: 'Please wait for the agreement to load.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSigning(true);

      // Create agreement hash from CID (contract expects bytes32 hash)
      const agreementHash = keccak256(toHex(agreementCid));

      console.log('📝 Signing agreement on-chain...', {
        cid: agreementCid,
        hash: agreementHash,
        hatId: hatId.toString(),
        module: eligibilityModuleAddress,
      });

      toast({
        title: 'Please Sign',
        description: 'Please confirm the transaction in your wallet.',
        duration: 3000,
      });

      await sendUserOperation({
        calls: [{
          to: eligibilityModuleAddress,
          value: 0n,
          data: encodeFunctionData({
            abi: ELIGIBILITY_MODULE_ABI,
            functionName: 'signAgreement',
            args: [agreementHash],
          }),
        }],
      } as any);

      toast({
        title: 'Agreement Signed! ✅',
        description:
          'You are now eligible for membership. A pod leader can now add you as a member.',
        duration: 8000,
      });

      setHasAlreadySigned(true);
      onSuccess?.();

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('❌ Failed to sign agreement:', error);

      let errorMessage = 'Failed to sign agreement on-chain.';

      if (
        error.message?.includes('User rejected') ||
        error.message?.includes('User denied')
      ) {
        errorMessage = 'Transaction was cancelled. Please try again.';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction fees.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Signing Failed',
        description: errorMessage,
        variant: 'destructive',
        duration: 8000,
      });
    } finally {
      setIsSigning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      style={{
        paddingBottom: 'var(--bottom-nav-height, 80px)',
        paddingTop: '16px',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: '100%',
          minHeight: '400px',
        }}
      >
        {/* Header */}
        <div
          className="p-4 sm:p-6 border-b bg-gradient-to-r"
          style={{
            backgroundImage: 'linear-gradient(to right, #E8F1EE, #EDEAF0)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className="p-2 rounded-full"
                style={{ backgroundColor: '#D1E6DC' }}
              >
                <FileText className="w-6 h-6" style={{ color: '#2F5D50' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {hasAlreadySigned
                    ? 'Agreement Already Signed'
                    : 'Sign Agreement to Join'}
                </h3>
                <p className="text-sm text-gray-600">Pod: {podName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSigning}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6"
          style={{ minHeight: 0 }}
        >
          {/* Loading State */}
          {isLoadingAgreement || checkingSignatureStatus ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="animate-spin rounded-full h-12 w-12 border-b-2"
                style={{ borderColor: '#2F5D50' }}
              ></div>
              <span className="ml-3 text-gray-600">
                {isLoadingAgreement
                  ? 'Loading agreement from IPFS...'
                  : 'Checking signature status...'}
              </span>
            </div>
          ) : hasAlreadySigned ? (
            /* Already Signed State */
            <div className="text-center py-8">
              <CheckCircle
                className="h-16 w-16 mx-auto mb-4"
                style={{ color: '#3F7A5A' }}
              />
              <h4 className="text-xl font-semibold text-gray-900 mb-2">
                You've Already Signed!
              </h4>
              <p className="text-gray-600 mb-4">
                Your signature for this agreement has been recorded on-chain.
              </p>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: '#E8F1EE',
                  border: '1px solid #B8D9CA',
                }}
              >
                <p className="text-sm" style={{ color: '#1F453A' }}>
                  ✅ Signature verified on-chain for HAT ID: {hatId.toString()}
                </p>
              </div>
            </div>
          ) : (
            /* Agreement Display */
            <div className="space-y-6">
              {/* IPFS Info */}
              <Card
                style={{
                  backgroundColor: '#E8F1EE',
                  border: '1px solid #B8D9CA',
                }}
              >
                <CardHeader className="pb-3">
                  <CardTitle
                    className="text-sm font-medium flex items-center"
                    style={{ color: '#1F453A' }}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    On-Chain Agreement
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <p className="text-sm" style={{ color: '#2F5D50' }}>
                    This agreement is stored on IPFS and your signature will be
                    recorded on the blockchain.
                  </p>
                  <div
                    className="flex items-center space-x-2 text-xs"
                    style={{ color: '#1F453A' }}
                  >
                    <span
                      className="font-mono px-2 py-1 rounded"
                      style={{ backgroundColor: '#D1E6DC' }}
                    >
                      {agreementCid.substring(0, 12)}...{agreementCid.slice(-8)}
                    </span>
                    <a
                      href={AgreementIPFSService.getGatewayUrl(agreementCid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:underline"
                    >
                      View on IPFS <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Agreement Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Agreement Terms
                </label>
                <div className="border border-gray-300 rounded-md p-4 bg-gray-50 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans">
                    {agreementText}
                  </pre>
                </div>
              </div>

              {/* Warning */}
              <Card
                style={{
                  backgroundColor: '#FAF4EC',
                  border: '1px solid #E8D7B8',
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle
                      className="w-5 h-5 mt-0.5 flex-shrink-0"
                      style={{ color: '#C6933F' }}
                    />
                    <div>
                      <h5 className="font-medium" style={{ color: '#7A5F3F' }}>
                        Important Notice
                      </h5>
                      <p className="text-sm mt-1" style={{ color: '#9B7F5F' }}>
                        By signing this agreement on-chain, you acknowledge that
                        you have read and agree to the terms above. Your
                        signature will be permanently recorded on the blockchain
                        and is required for pod access.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {hasAlreadySigned ? (
                <span className="font-medium" style={{ color: '#3F7A5A' }}>
                  ✓ Signed on-chain
                </span>
              ) : (
                <span>Signing requires a blockchain transaction</span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={onClose} disabled={isSigning}>
                {hasAlreadySigned ? 'Close' : 'Cancel'}
              </Button>

              {!hasAlreadySigned && (
                <Button
                  onClick={handleSignAgreement}
                  disabled={isSigning || isLoadingAgreement || !agreementText}
                  className="text-white"
                  style={{ backgroundColor: '#3F7A5A' }}
                  onMouseEnter={(e) =>
                    !e.currentTarget.disabled &&
                    (e.currentTarget.style.backgroundColor = '#2F5D50')
                  }
                  onMouseLeave={(e) =>
                    !e.currentTarget.disabled &&
                    (e.currentTarget.style.backgroundColor = '#3F7A5A')
                  }
                >
                  {isSigning ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Signing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <PenTool className="w-4 h-4" />
                      <span>Sign Agreement On-Chain</span>
                    </div>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
