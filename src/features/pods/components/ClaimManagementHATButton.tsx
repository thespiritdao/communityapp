'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, CheckCircle, Loader2 } from 'lucide-react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface ClaimManagementHATButtonProps {
  podId: string;
  podName: string;
  managementHatId: string;
  podLeads: string[]; // Array of leader wallet addresses
  eligibilityModuleAddress?: string;
}

const HATS_PROTOCOL_ADDRESS =
  '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;

const HATS_ABI = [
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
  {
    name: 'isEligible',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'isActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Button to claim management HAT when user is eligible but doesn't have it yet
 *
 * Scenario: User signed the agreement (or met other eligibility requirements)
 * but hasn't minted the management HAT to themselves yet.
 */
export const ClaimManagementHATButton: React.FC<
  ClaimManagementHATButtonProps
> = ({
  podId,
  podName,
  managementHatId,
  podLeads,
  eligibilityModuleAddress,
}) => {
  const [alreadyHasHat, setAlreadyHasHat] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isLeader, setIsLeader] = useState(false);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [isHatActive, setIsHatActive] = useState<boolean | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // Check if user already has the HAT and if they're a leader
  useEffect(() => {
    const checkHATStatus = async () => {
      if (!evmAddress || !publicClient || !managementHatId) {
        setCheckingStatus(false);
        return;
      }

      try {
        setCheckingStatus(true);
        setEligibilityError(null);

        // Check if user is in pod_leads array (case-insensitive)
        const userIsLeader = podLeads.some(
          (lead) => lead.toLowerCase() === evmAddress.toLowerCase(),
        );
        setIsLeader(userIsLeader);

        // Check HAT balance
        const balance = await publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [evmAddress, BigInt(managementHatId)],
        });

        const hasHat = (balance as bigint) > 0n;
        setAlreadyHasHat(hasHat);

        // Check if HAT is active
        const hatActive = await publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HATS_ABI,
          functionName: 'isActive',
          args: [BigInt(managementHatId)],
        });
        setIsHatActive(hatActive as boolean);

        // Check if user is eligible for the HAT
        const eligible = await publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HATS_ABI,
          functionName: 'isEligible',
          args: [evmAddress, BigInt(managementHatId)],
        });
        setIsEligible(eligible as boolean);

        console.log('🔍 HAT Status Check:', {
          address: evmAddress,
          managementHatId,
          balance: balance.toString(),
          hasHat,
          isLeader: userIsLeader,
          isActive: hatActive,
          isEligible: eligible,
        });

        // Set error messages if checks fail
        if (!hatActive) {
          setEligibilityError(
            'HAT is currently inactive. Contact a pod administrator.',
          );
        } else if (!eligible) {
          setEligibilityError(
            'You are not eligible for this HAT yet. Make sure you have met all requirements (e.g., signed agreements).',
          );
        }
      } catch (error) {
        console.error('Error checking HAT status:', error);
        setAlreadyHasHat(null);
        setEligibilityError('Failed to check HAT status. Please try again.');
      } finally {
        setCheckingStatus(false);
      }
    };

    checkHATStatus();
  }, [evmAddress, publicClient, managementHatId, podLeads]);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleClaimHATTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for HAT claim:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to claim your management HAT.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for HAT claim...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: Hats Protocol - mintHat');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: HATS_ABI,
        functionName: 'mintHat',
        args: [BigInt(managementHatId), evmAddress],
      });

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: HATS_PROTOCOL_ADDRESS,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      if (result?.receipt) {
        console.log('✅ Management HAT claimed successfully!');

        toast({
          title: 'Success! 👑',
          description: `You now have management access to ${podName}. Refreshing...`,
          duration: 3000,
        });

        setAlreadyHasHat(true);

        // Reload page after short delay to refresh permissions
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'HAT claim completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ HAT claim failed:', error);
      toast({
        title: 'Claim Failed',
        description: error.message || 'Failed to claim management HAT. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  // Don't show anything while checking
  if (checkingStatus) {
    return (
      <Card style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div
              className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
              style={{ borderColor: '#2F5D50' }}
            ></div>
            <span className="text-sm" style={{ color: '#1F453A' }}>
              Checking management access...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't show if user is not a leader
  if (!isLeader) {
    console.log(
      '🚫 User is not in pod_leads, hiding management HAT claim button',
    );
    return null;
  }

  // Don't show if user already has the HAT
  if (alreadyHasHat) {
    return (
      <Card style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5" style={{ color: '#3F7A5A' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#1F453A' }}>
                Management Access Active
              </p>
              <p className="text-xs" style={{ color: '#2F5D50' }}>
                You have the management HAT for this pod
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error if HAT is inactive or user is not eligible
  if (eligibilityError) {
    return (
      <Card style={{ backgroundColor: '#F5E6E6', border: '1px solid #D9B3B3' }}>
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex items-start space-x-3">
              <Crown className="h-5 w-5 mt-0.5" style={{ color: '#8B3A3A' }} />
              <div className="flex-1">
                <h4
                  className="text-sm font-semibold mb-1"
                  style={{ color: '#5C1F1F' }}
                >
                  Cannot Claim Management HAT
                </h4>
                <p className="text-sm" style={{ color: '#8B3A3A' }}>
                  {eligibilityError}
                </p>
                {!isEligible && (
                  <div
                    className="mt-3 p-3 rounded-md"
                    style={{ backgroundColor: '#E8CBCB' }}
                  >
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: '#5C1F1F' }}
                    >
                      Eligibility Check Failed
                    </p>
                    <p className="text-xs" style={{ color: '#8B3A3A' }}>
                      The Hats Protocol contract reports you are not eligible
                      for this HAT. This usually means:
                    </p>
                    <ul
                      className="text-xs list-disc list-inside mt-2 space-y-1"
                      style={{ color: '#8B3A3A' }}
                    >
                      <li>You haven't signed all required agreements</li>
                      <li>Your signature hasn't been recorded on-chain yet</li>
                      <li>You don't meet other eligibility criteria</li>
                    </ul>
                  </div>
                )}
                {!isHatActive && (
                  <div
                    className="mt-3 p-3 rounded-md"
                    style={{ backgroundColor: '#E8CBCB' }}
                  >
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: '#5C1F1F' }}
                    >
                      HAT Inactive
                    </p>
                    <p className="text-xs" style={{ color: '#8B3A3A' }}>
                      This HAT has been toggled off. A pod administrator needs
                      to reactivate it before it can be claimed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show claim button if user is a leader but doesn't have HAT and is eligible
  return (
    <Card style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8' }}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Crown className="h-5 w-5 mt-0.5" style={{ color: '#C6933F' }} />
            <div className="flex-1">
              <h4
                className="text-sm font-semibold mb-1"
                style={{ color: '#7A5F3F' }}
              >
                Claim Your Management Access
              </h4>
              <p className="text-sm mb-3" style={{ color: '#9B7F5F' }}>
                You're a designated leader of this pod. Click below to claim
                your management HAT and gain full control.
              </p>
              {isEligible && (
                <p
                  className="text-xs mb-2 font-medium"
                  style={{ color: '#3F7A5A' }}
                >
                  ✅ Eligibility verified: You meet all requirements to claim
                  this HAT
                </p>
              )}
              {isHatActive && (
                <p
                  className="text-xs mb-2 font-medium"
                  style={{ color: '#3F7A5A' }}
                >
                  ✅ HAT is active and ready to claim
                </p>
              )}
              <p className="text-xs" style={{ color: '#C6933F' }}>
                💡 This transaction is sponsored (no gas fees required)
              </p>
            </div>
          </div>

          {/* CDP Smart Account Transaction Button */}
          {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
            <Button
              onClick={handleClaimHATTransaction}
              disabled={isTransactionPending}
              className="w-full text-white bg-[#C6933F] hover:bg-[#9B7F5F] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTransactionPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                  Claiming HAT...
                </>
              ) : (
                'Claim Management HAT (Gasless)'
              )}
            </Button>
          ) : (
            <div
              className="p-3 border rounded-lg bg-gray-50"
              style={{
                backgroundColor: '#F5E6E6',
                borderColor: '#D9B3B3',
              }}
            >
              <p className="text-sm font-medium" style={{ color: '#5C1F1F' }}>
                Wallet Not Connected
              </p>
              <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                Please connect your Smart Wallet to claim your management HAT.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
