'use client';

import { useState } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserWallet, useSigningWallet } from '@/hooks/useUserWallet';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/utils/supabaseClient';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

// On-chain removal (audit Phase 2, step 3): the pod's eligibility module
// records a revocation by a hat admin, then Hats re-checks the wearer and
// burns the hat. Hats refuses transferHat to the zero address, and
// setHatWearerStatus is callable only by the module itself, so this is the
// one admin-driven path Hats Protocol allows.
const POD_ELIGIBILITY_MODULE = (process.env.NEXT_PUBLIC_POD_ELIGIBILITY_MODULE || '') as `0x${string}` | '';

const POD_ELIGIBILITY_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'revoke',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const HATS_CHECK_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'checkHatWearerStatus',
    outputs: [{ name: 'updated', type: 'bool' }],
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
      if (!POD_ELIGIBILITY_MODULE) {
        throw new Error('POD_ELIGIBILITY_MODULE_UNSET');
      }

      console.log('🚀 Member removal: revoke on the eligibility module, then Hats re-check');
      console.log('💼 Smart Account:', smartAccount);

      const revokeData = encodeFunctionData({
        abi: POD_ELIGIBILITY_ABI,
        functionName: 'revoke',
        args: [BigInt(hatId), memberAddress as `0x${string}`],
      });
      const checkData = encodeFunctionData({
        abi: HATS_CHECK_ABI,
        functionName: 'checkHatWearerStatus',
        args: [BigInt(hatId), memberAddress as `0x${string}`],
      });

      // One user operation, two calls: the revocation is recorded, then Hats
      // reads the module, sees the wearer ineligible, and burns the hat.
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [
          { to: POD_ELIGIBILITY_MODULE, value: 0n, data: revokeData },
          { to: HATS_PROTOCOL_ADDRESS, value: 0n, data: checkData },
        ],
        useCdpPaymaster: true,
      });

      console.log('✅ User operation sent', result);

      // sendUserOperation resolves when the operation is *sent*, not mined,
      // so a receipt is usually absent here. The server route is the
      // authority anyway: it refuses (409) while the hat is still worn and
      // records the removal once the chain shows it gone. Poll it for up to
      // ~45s instead of depending on a receipt.
      const txHash: string | undefined =
        (result as any)?.receipt?.transactionHash || (result as any)?.userOpHash || undefined;

      let recorded: Response | null = null;
      let lastError = 'Hat removed on-chain, but the membership record could not be updated';
      for (let attempt = 0; attempt < 15; attempt++) {
        const res = await fetch(`/api/pods/${podId}/members`, {
          method: 'PATCH',
          headers: await ensureAuthHeaders(),
          body: JSON.stringify({ wallet: memberAddress, hatId }),
        });
        if (res.ok) {
          recorded = res;
          break;
        }
        const err = await res.json().catch(() => ({}));
        lastError = err.error || lastError;
        if (res.status !== 409) break; // a real refusal, not "not mined yet"
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!recorded) throw new Error(lastError);

      console.log('✅ Member removal recorded:', { member: memberAddress, hatId, txHash });

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
        title: 'Member Removed',
        description: `${memberName} has been removed from ${podName}.`,
        duration: 5000,
      });

      setShowConfirmation(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('❌ Member removal failed:', error);

      let errorMessage = error.message || 'Failed to remove member. Please try again.';

      if (error.message === 'POD_ELIGIBILITY_MODULE_UNSET') {
        errorMessage =
          "On-chain removal is not available yet: the pod eligibility module with revocation control has not been deployed. The member can leave by renouncing their hat.";
      } else if (
        error.message?.includes('execution reverted') ||
        error.message?.includes('failed to estimate gas')
      ) {
        // Either this hat is not yet attached to the pod eligibility module,
        // or the caller is not an admin of the hat.
        errorMessage =
          "The removal was refused on-chain. Either this pod's hat is not yet attached to the eligibility module with revocation control, or your wallet is not an admin of this hat.";
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
    <div className="remove-confirm w-full space-y-4">
      {/* Confirmation Warning */}
      <div
        className="p-4 border-l-4 rounded min-w-0 overflow-hidden"
        style={{ backgroundColor: '#F5E6E6', borderColor: '#8B3A3A' }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: '#8B3A3A' }}
          />
          <div className="flex-1 min-w-0 break-words">
            {/* The person first, then the question — long names and pod names
                wrap inside the card instead of pushing past it. */}
            <div className="text-base font-semibold mb-1 break-words" style={{ color: '#5C1F1F' }}>
              {memberName}
            </div>
            <h4
              className="text-sm font-semibold mb-2 break-words"
              style={{ color: '#8B3A3A' }}
            >
              Remove from {podName}?
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
        <div className="flex flex-col gap-3 min-w-0">
          {/* Stack on narrow screens so neither button escapes the card. */}
          <div className="flex flex-col sm:flex-row gap-3 min-w-0">
            <Button
              onClick={handleRemoveMemberTransaction}
              disabled={isTransactionPending || isProcessing}
              className="w-full sm:flex-1 min-w-0 whitespace-normal text-white px-4 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#8B3A3A] hover:bg-[#5C1F1F]"
            >
              {isTransactionPending || isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                  {isTransactionPending ? 'Removing...' : 'Processing...'}
                </>
              ) : (
                `Confirm: Remove ${membershipType === 'leader' ? 'Leader' : 'Member'}`
              )}
            </Button>
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={isTransactionPending || isProcessing}
              className="w-full sm:w-auto px-4 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium disabled:opacity-50"
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

    </div>
  );
};
