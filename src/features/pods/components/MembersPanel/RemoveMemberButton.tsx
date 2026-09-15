'use client';

import { useState } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserWallet, useSigningWallet } from '@/hooks/useUserWallet';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/utils/supabaseClient';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

// Minimal Hats Protocol ABI for transferHat function
const HATS_TRANSFER_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
    ],
    name: 'transferHat',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface RemoveMemberButtonProps {
  memberId: string;
  memberAddress: string;
  memberName: string;
  hatId: string;
  podId: string;
  podName: string;
  membershipType: 'leader' | 'member';
  onSuccess?: () => void;
}

/**
 * ✅ ISSUE #7: On-Chain Member Removal Flow
 *
 * Implements HAT revocation by transferring HAT to zero address
 * Uses CDP Smart Accounts for gasless transactions
 * Updates database after successful on-chain removal
 */
export const RemoveMemberButton: React.FC<RemoveMemberButtonProps> = ({
  memberId,
  memberAddress,
  memberName,
  hatId,
  podId,
  podName,
  membershipType,
  onSuccess,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  // Device signing wallet — gates the on-chain HAT-transfer transaction
  // (paired with the smart account below).
  const { address: evmAddress } = useSigningWallet();
  // Identity wallet (canonical) — actor attribution on the removal notification.
  const userWallet = useUserWallet();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Validate HAT ID format
  const validateHatId = (hatId: string): boolean => {
    if (!hatId || hatId === 'pending_creation' || hatId === 'null') {
      return false;
    }

    // Accept hex format or decimal format
    if (/^0x[0-9a-fA-F]+$/.test(hatId)) {
      return true;
    }

    try {
      BigInt(hatId);
      return true;
    } catch {
      return false;
    }
  };

  const isValidHatId = validateHatId(hatId);

  if (!isValidHatId) {
    return (
      <div className="p-3 bg-gray-100 border border-gray-300 rounded text-xs text-gray-600">
        Cannot remove: Invalid HAT ID
      </div>
    );
  }

  // ✅ Transfer HAT to zero address (burns it effectively)
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleRemoveMemberTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for member removal:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to remove members.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN
    setIsProcessing(true);

    try {
      console.log('🚀 Building Smart Account User Operation for member removal...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: Hats Protocol - transferHat');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: HATS_TRANSFER_ABI,
        functionName: 'transferHat',
        args: [
          BigInt(hatId),
          memberAddress as `0x${string}`,
          ZERO_ADDRESS as `0x${string}`,
        ],
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
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        const txHash = resultWithReceipt.receipt.transactionHash;

        console.log('✅ Member removed on-chain:', {
          member: memberAddress,
          hatId,
          txHash,
        });

        // Record the removal server-side. The route confirms the hat is gone
        // on-chain before marking the row inactive, and drops the wallet from
        // pod_leads itself (audit Phase 1: the browser no longer writes
        // pod_members).
        const recorded = await fetch(`/api/pods/${podId}/members`, {
          method: 'PATCH',
          headers: await ensureAuthHeaders(),
          body: JSON.stringify({ wallet: memberAddress, hatId }),
        });
        if (!recorded.ok) {
          const err = await recorded.json().catch(() => ({}));
          throw new Error(err.error || 'Hat removed on-chain, but the membership record could not be updated');
        }

        // Send notification to removed member
        await supabase.from('general_notifications').insert({
          recipient_address: memberAddress.toLowerCase(),
          sender_address: (userWallet ?? evmAddress).toLowerCase(),
          notification_type: 'pod_member_removed',
          title: `Removed from ${podName}`,
          message: `You have been removed from ${podName}. Your ${membershipType} role has been revoked.`,
          context_type: 'governance',
          context_id: podId,
          context_url: `/pods/${podId}`,
        });

        toast({
          title: 'Member Removed Successfully',
          description: `${memberName} has been removed from ${podName}. Transaction: ${txHash?.slice(0, 10)}...`,
          duration: 5000,
        });

        setShowConfirmation(false);
        onSuccess?.();
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Member removal completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Member removal failed:', error);

      let errorMessage = error.message || 'Failed to remove member. Please try again.';

      if (error.message?.includes('execution reverted')) {
        errorMessage =
          'Transaction would revert. You may not have permission to remove this member, or the HAT cannot be transferred.';
      } else if (error.message?.includes('failed to estimate gas')) {
        errorMessage =
          'Failed to estimate gas. You may not be an admin of this HAT or the member is not currently wearing it.';
      } else if (error.message?.includes('user rejected')) {
        errorMessage = 'Transaction cancelled by user.';
      }

      toast({
        title: 'Removal Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      setShowConfirmation(false);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
      setIsProcessing(false);
    }
  };

  // Confirmation modal
  if (!showConfirmation) {
    return (
      <button
        onClick={() => setShowConfirmation(true)}
        disabled={isProcessing || !evmAddress}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ color: '#8B3A3A', borderColor: '#D9B3B3' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#5C1F1F';
          e.currentTarget.style.backgroundColor = '#F5E6E6';
          e.currentTarget.style.borderColor = '#C9A3A3';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#8B3A3A';
          e.currentTarget.style.backgroundColor = '';
          e.currentTarget.style.borderColor = '#D9B3B3';
        }}
      >
        <Trash2 className="w-4 h-4" />
        Remove
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Confirmation Warning */}
      <div
        className="p-4 border-l-4 rounded"
        style={{ backgroundColor: '#F5E6E6', borderColor: '#8B3A3A' }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: '#8B3A3A' }}
          />
          <div className="flex-1">
            <h4
              className="text-sm font-semibold mb-2"
              style={{ color: '#8B3A3A' }}
            >
              Remove {memberName} from {podName}?
            </h4>
            <p className="text-xs mb-3" style={{ color: '#8B3A3A' }}>
              This action will:
            </p>
            <ul
              className="text-xs space-y-1 ml-4 mb-3"
              style={{ color: '#8B3A3A' }}
            >
              <li>
                • Revoke their <strong>{membershipType}</strong> role (HAT)
                on-chain
              </li>
              <li>• Remove all associated permissions immediately</li>
              <li>• Mark them as inactive in the database</li>
              {membershipType === 'leader' && (
                <li>• Remove them from the pod leadership list</li>
              )}
              <li>• Send them a notification about the removal</li>
            </ul>
            <p className="text-xs font-semibold" style={{ color: '#8B3A3A' }}>
              ⚠️ This action cannot be undone. They will need to reapply to
              rejoin.
            </p>
          </div>
        </div>
      </div>

      {/* CDP Smart Account Transaction Buttons */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Button
              onClick={handleRemoveMemberTransaction}
              disabled={isTransactionPending || isProcessing}
              className="flex-1 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#8B3A3A] hover:bg-[#5C1F1F]"
            >
              {isTransactionPending || isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                  {isTransactionPending ? 'Removing...' : 'Processing...'}
                </>
              ) : (
                `Confirm: Remove ${membershipType === 'leader' ? 'Leader' : 'Member'} (Gasless)`
              )}
            </Button>
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={isTransactionPending || isProcessing}
              className="px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="p-4 border rounded-lg"
          style={{
            backgroundColor: '#F5E6E6',
            borderColor: '#D9B3B3',
          }}
        >
          <p className="text-sm font-medium" style={{ color: '#5C1F1F' }}>
            Wallet Not Connected
          </p>
          <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
            Please connect your Smart Wallet to remove members.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Member address: {memberAddress.slice(0, 8)}...{memberAddress.slice(-6)}
      </p>
    </div>
  );
};
