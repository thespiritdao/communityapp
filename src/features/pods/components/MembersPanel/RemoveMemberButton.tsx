'use client';

import { useState } from 'react';
import { Transaction, TransactionButton, TransactionStatus, TransactionStatusLabel } from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import { encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

// Minimal Hats Protocol ABI for transferHat function
const HATS_TRANSFER_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' }
    ],
    name: 'transferHat',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
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
 * Uses OnchainKit for sponsored transactions
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
  onSuccess
}) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
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

  const transferHatCallData = encodeFunctionData({
    abi: HATS_TRANSFER_ABI,
    functionName: 'transferHat',
    args: [BigInt(hatId), memberAddress as `0x${string}`, ZERO_ADDRESS as `0x${string}`]
  });

  const handleSuccess = async (response: { transactionReceipts: any[] }) => {
    try {
      setIsProcessing(true);

      const txHash = response.transactionReceipts?.[0]?.transactionHash;

      console.log('✅ Member removed on-chain:', {
        member: memberAddress,
        hatId,
        txHash
      });

      // Update pod_members table - mark as removed
      await supabase
        .from('pod_members')
        .update({
          is_active: false,
          removed_at: new Date().toISOString()
        })
        .eq('id', memberId);

      // Remove from pod_leads array if leader
      if (membershipType === 'leader') {
        const { data: pod } = await supabase
          .from('pods')
          .select('pod_leads')
          .eq('id', podId)
          .single();

        if (pod?.pod_leads) {
          const updatedLeads = (pod.pod_leads as string[]).filter(
            lead => lead.toLowerCase() !== memberAddress.toLowerCase()
          );

          await supabase
            .from('pods')
            .update({ pod_leads: updatedLeads })
            .eq('id', podId);

          console.log('✅ Removed from pod_leads array');
        }
      }

      // Send notification to removed member
      await supabase
        .from('general_notifications')
        .insert({
          recipient_address: memberAddress.toLowerCase(),
          sender_address: address?.toLowerCase() || '',
          notification_type: 'pod_member_removed',
          title: `Removed from ${podName}`,
          message: `You have been removed from ${podName}. Your ${membershipType} role has been revoked.`,
          context_type: 'governance',
          context_id: podId,
          context_url: `/pods/${podId}`
        });

      toast({
        title: "Member Removed Successfully",
        description: `${memberName} has been removed from ${podName}. Transaction: ${txHash?.slice(0, 10)}...`,
        duration: 5000
      });

      setShowConfirmation(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating database after removal:', error);
      toast({
        title: "Member Removed, Database Update Failed",
        description: "Member was removed on-chain but database update failed. Please refresh.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleError = (error: Error) => {
    console.error('❌ Member removal transaction error:', error);

    let errorMessage = error.message || "Failed to remove member. Please try again.";

    if (error.message?.includes('execution reverted')) {
      errorMessage = "Transaction would revert. You may not have permission to remove this member, or the HAT cannot be transferred.";
    } else if (error.message?.includes('failed to estimate gas')) {
      errorMessage = "Failed to estimate gas. You may not be an admin of this HAT or the member is not currently wearing it.";
    } else if (error.message?.includes('user rejected')) {
      errorMessage = "Transaction cancelled by user.";
    }

    toast({
      title: "Removal Failed",
      description: errorMessage,
      variant: "destructive"
    });

    setShowConfirmation(false);
  };

  const handleStatusChange = (status: LifecycleStatus) => {
    console.log('Removal transaction status:', status);
  };

  // Confirmation modal
  if (!showConfirmation) {
    return (
      <button
        onClick={() => setShowConfirmation(true)}
        disabled={isProcessing || !address}
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
        Remove Member
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Confirmation Warning */}
      <div className="p-4 border-l-4 rounded" style={{ backgroundColor: '#F5E6E6', borderColor: '#8B3A3A' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#8B3A3A' }} />
          <div className="flex-1">
            <h4 className="text-sm font-semibold mb-2" style={{ color: '#8B3A3A' }}>
              Remove {memberName} from {podName}?
            </h4>
            <p className="text-xs mb-3" style={{ color: '#8B3A3A' }}>
              This action will:
            </p>
            <ul className="text-xs space-y-1 ml-4 mb-3" style={{ color: '#8B3A3A' }}>
              <li>• Revoke their <strong>{membershipType}</strong> role (HAT) on-chain</li>
              <li>• Remove all associated permissions immediately</li>
              <li>• Mark them as inactive in the database</li>
              {membershipType === 'leader' && (
                <li>• Remove them from the pod leadership list</li>
              )}
              <li>• Send them a notification about the removal</li>
            </ul>
            <p className="text-xs font-semibold" style={{ color: '#8B3A3A' }}>
              ⚠️ This action cannot be undone. They will need to reapply to rejoin.
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Buttons */}
      <Transaction
        chainId={base.id}
        isSponsored={true}
        calls={[
          {
            to: HATS_PROTOCOL_ADDRESS,
            data: transferHatCallData,
            value: BigInt(0)
          }
        ]}
        onSuccess={handleSuccess}
        onError={handleError}
        onStatus={handleStatusChange}
        capabilities={{
          paymasterService: {
            url: process.env.NEXT_PUBLIC_PAYMASTER || ''
          }
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <TransactionButton
              text={`Confirm: Remove ${membershipType === 'leader' ? 'Leader' : 'Member'}`}
              disabled={isProcessing || !address}
              className="flex-1 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#8B3A3A' }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => !isProcessing && !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#5C1F1F')}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => !isProcessing && !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#8B3A3A')}
            />
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={isProcessing}
              className="px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          <TransactionStatus>
            <div className="flex flex-col gap-2 p-4 border rounded-lg bg-gray-50">
              <TransactionStatusLabel />
            </div>
          </TransactionStatus>
        </div>
      </Transaction>

      <p className="text-xs text-gray-500 text-center">
        Member address: {memberAddress.slice(0, 8)}...{memberAddress.slice(-6)}
      </p>
    </div>
  );
};
