'use client';

import { useState } from 'react';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import {
  encodeFunctionData,
  createPublicClient,
  http,
  createWalletClient,
  custom,
} from 'viem';
import { base } from 'viem/chains';
import { useAccount, useWalletClient } from 'wagmi';
import { useReadContract } from 'wagmi';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import {
  AlertCircle,
  XCircle,
  Loader2,
  ShieldAlert,
  Crown,
  User,
} from 'lucide-react';
import { HatCreationService } from '@/features/pods/services/HatCreationService';
import {
  EligibilityService,
  type EligibilityEvaluation,
} from '@/features/pods/services/EligibilityService';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity';
import type { UserProfile } from '@/features/identity/types';

// Minimal Hats Protocol ABI for mintHat function
const HATS_MINT_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'mintHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface ApproveApplicationButtonProps {
  applicationId: string;
  applicantAddress: string;
  applicantProfile: UserProfile | null; // Applicant's profile data for display
  podId: string;
  podName: string;
  hatIdToMint: string; // The HAT ID to mint (membership or management)
  managementHatId: string; // Management HAT ID (for auto-creating membership HAT)
  roleLabel: string; // "member" or "leader" for display
  onSuccess?: () => void;
}

export const ApproveApplicationButton: React.FC<
  ApproveApplicationButtonProps
> = ({
  applicationId,
  applicantAddress,
  applicantProfile,
  podId,
  podName,
  hatIdToMint,
  managementHatId,
  roleLabel,
  onSuccess,
}) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoCreatingHat, setIsAutoCreatingHat] = useState(false);
  const [autoCreatedHatId, setAutoCreatedHatId] = useState<string | null>(null);

  // Profile modal for clicking on applicant name
  const {
    selectedUser,
    users,
    isOpen: isProfileModalOpen,
    openProfileModal,
    closeProfileModal,
  } = useProfileModal();

  // ✅ ISSUE #5 FIX: Eligibility checking state
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [eligibilityResult, setEligibilityResult] =
    useState<EligibilityEvaluation | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  // Check if current user is wearing the management HAT (required to mint member HATs)
  const { data: currentUserHatBalance, isLoading: isLoadingPermission } =
    useReadContract({
      address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [
            { name: 'account', type: 'address' },
            { name: 'hatId', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'balanceOf',
      args:
        address && managementHatId
          ? [address as `0x${string}`, BigInt(managementHatId)]
          : undefined,
      query: {
        enabled: !!address && !!managementHatId && roleLabel === 'member',
      },
    });

  const hasManagementHat = currentUserHatBalance
    ? Number(currentUserHatBalance) > 0
    : false;

  // ========================================
  // PRE-FLIGHT VALIDATION
  // ========================================

  // 1. Validate HAT ID format (accept both hex and decimal)
  const validateHatId = (hatId: string): boolean => {
    if (!hatId || hatId === 'pending_creation' || hatId === 'null') {
      return false;
    }

    // Accept hex format: 0x...
    if (/^0x[0-9a-fA-F]+$/.test(hatId)) {
      return true;
    }

    // Accept decimal format: large number string
    // Try to convert to BigInt - if it works, it's valid
    try {
      BigInt(hatId);
      return true;
    } catch {
      return false;
    }
  };

  const isValidHatId = validateHatId(hatIdToMint);

  // Use auto-created HAT ID if available
  const effectiveHatId = autoCreatedHatId || hatIdToMint;
  const isEffectiveHatIdValid = validateHatId(effectiveHatId);

  // Convert HAT ID to readable format for display
  const formatHatIdForDisplay = (hatId: string): string => {
    try {
      // If it's already hex, return it
      if (hatId.startsWith('0x')) {
        return hatId;
      }
      // If it's decimal, convert to hex
      const hexValue = '0x' + BigInt(hatId).toString(16);
      return hexValue;
    } catch {
      return hatId;
    }
  };

  // ========================================
  // ✅ ISSUE #5 FIX: ELIGIBILITY CHECK
  // ========================================

  const checkApplicantEligibility = async () => {
    try {
      setIsCheckingEligibility(true);
      setEligibilityError(null);

      console.log('🔍 === ELIGIBILITY CHECK STARTED ===');
      console.log('🔍 Applicant:', applicantAddress);
      console.log('🔍 Pod ID:', podId);
      console.log('🔍 Role:', roleLabel);

      // Get the role ID from pod_role_permissions based on role type
      const { data: role, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('id, eligibility_criteria, role_name')
        .eq('pod_id', podId)
        .eq('role_name', roleLabel === 'leader' ? 'pod_leader' : 'pod_member')
        .eq('is_active', true)
        .single();

      if (roleError || !role) {
        console.warn(
          '⚠️ No role found for eligibility check - allowing by default',
        );
        setEligibilityResult({
          eligible: true,
          criteriaResults: {},
          overallResult: {
            passed: 0,
            total: 0,
            message: 'No role configuration found - access granted by default',
          },
          evaluatedAt: new Date().toISOString(),
          userAddress: applicantAddress,
          roleId: '',
        });
        return;
      }

      console.log('🔍 Role found:', role.role_name);
      console.log(
        '🔍 Criteria count:',
        Array.isArray(role.eligibility_criteria)
          ? role.eligibility_criteria.length
          : 0,
      );

      // Check user eligibility against role criteria
      const evaluation = await EligibilityService.checkUserEligibility(
        applicantAddress,
        podId,
        role.id,
      );

      console.log('✅ Eligibility check complete:', {
        eligible: evaluation.eligible,
        passed: evaluation.overallResult.passed,
        total: evaluation.overallResult.total,
        message: evaluation.overallResult.message,
      });

      setEligibilityResult(evaluation);

      if (!evaluation.eligible) {
        console.error('❌ Applicant does not meet eligibility requirements');
        setEligibilityError(evaluation.overallResult.message);

        toast({
          title: 'Eligibility Requirements Not Met',
          description: evaluation.overallResult.message,
          variant: 'destructive',
          duration: 7000,
        });
      } else {
        console.log('✅ Applicant meets all eligibility requirements');
        toast({
          title: 'Eligibility Verified',
          description:
            'Applicant meets all requirements. You can proceed with minting.',
          duration: 3000,
        });
      }
    } catch (error: any) {
      console.error('❌ Eligibility check failed:', error);
      const errorMsg =
        error?.message ||
        'Failed to verify eligibility. Cannot proceed with minting.';
      setEligibilityError(errorMsg);

      toast({
        title: 'Eligibility Check Failed',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  // ========================================
  // AUTO-CREATE MEMBERSHIP HAT
  // ========================================

  const handleAutoCreateMembershipHat = async () => {
    try {
      setIsAutoCreatingHat(true);

      toast({
        title: 'Creating Membership Role',
        description:
          'Please sign the transaction to create a new membership role for this pod...',
      });

      // Check if wallet client is available
      if (!walletClient || !address) {
        throw new Error('Please connect your wallet to continue');
      }

      // Convert management HAT ID to hex format if it's in decimal format
      let formattedManagementHatId = managementHatId;

      // Check if it's already a valid hex string (0x + 64 chars)
      const isHexFormat =
        managementHatId.startsWith('0x') && managementHatId.length === 66;

      if (!isHexFormat) {
        // Convert from decimal string to hex
        try {
          const hatIdBigInt = BigInt(managementHatId);
          formattedManagementHatId =
            '0x' + hatIdBigInt.toString(16).padStart(64, '0');
          console.log('🔄 Converted management HAT ID from decimal to hex:', {
            decimal: managementHatId,
            hex: formattedManagementHatId,
          });
        } catch (conversionError) {
          console.error(
            'Failed to convert management HAT ID:',
            conversionError,
          );
          throw new Error('Invalid management HAT ID format');
        }
      }

      // Create membership HAT on-demand
      const result = await HatCreationService.createMembershipHatOnDemand(
        podId,
        podName,
        formattedManagementHatId,
        walletClient,
      );

      if (!result.success || !result.hatId) {
        throw new Error(result.error || 'Failed to create membership HAT');
      }

      console.log('✅ Membership HAT created:', result.hatId);

      // Update pod database with new membership_hat_id
      if (result.needsDbUpdate) {
        await supabase
          .from('pods')
          .update({
            membership_hat_id: result.hatId,
          })
          .eq('id', podId);

        console.log('✅ Database updated with new membership_hat_id');
      }

      // Set the auto-created HAT ID for use in approval
      setAutoCreatedHatId(result.hatId);

      toast({
        title: 'Membership Role Created!',
        description: 'You can now proceed with approving this application.',
      });
    } catch (error: any) {
      console.error('❌ Failed to auto-create membership role:', error);
      toast({
        title: 'Failed to Create Membership Role',
        description:
          error?.message || 'Please try again or contact an administrator.',
        variant: 'destructive',
      });
    } finally {
      setIsAutoCreatingHat(false);
    }
  };

  // Show auto-create option for member role if HAT is missing
  if (!isValidHatId && roleLabel === 'member' && !autoCreatedHatId) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}
      >
        <div
          className="flex items-center gap-2 mb-2"
          style={{ color: '#1F453A' }}
        >
          <AlertCircle className="w-5 h-5" />
          <span className="font-semibold">No Active Member Role</span>
        </div>
        <p className="text-sm mb-3" style={{ color: '#2F5D50' }}>
          This pod doesn't have an active member (non-leader) role yet. Create
          one to proceed with this approval.
        </p>
        <button
          onClick={handleAutoCreateMembershipHat}
          disabled={isAutoCreatingHat || !address}
          className="w-full text-white px-4 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: '#2F5D50' }}
          onMouseEnter={(e) =>
            !isAutoCreatingHat &&
            !e.currentTarget.disabled &&
            (e.currentTarget.style.backgroundColor = '#1F453A')
          }
          onMouseLeave={(e) =>
            !isAutoCreatingHat &&
            !e.currentTarget.disabled &&
            (e.currentTarget.style.backgroundColor = '#2F5D50')
          }
        >
          {isAutoCreatingHat ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Membership Role...
            </>
          ) : (
            'Create Membership Role'
          )}
        </button>
      </div>
    );
  }

  // Show error for invalid leader HAT or other cases
  if (!isEffectiveHatIdValid) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: '#F5E6E6', border: '1px solid #D9B3B3' }}
      >
        <div
          className="flex items-center gap-2 mb-2"
          style={{ color: '#8B3A3A' }}
        >
          <XCircle className="w-5 h-5" />
          <span className="font-semibold">Invalid Role Configuration</span>
        </div>
        <p className="text-sm mb-2" style={{ color: '#8B3A3A' }}>
          The {roleLabel} role for this pod is not properly configured.
        </p>
        <div
          className="text-xs p-2 rounded font-mono break-all max-w-full overflow-x-auto"
          style={{ color: '#8B3A3A', backgroundColor: '#F5E6E6' }}
        >
          <div className="font-semibold mb-1">Current value:</div>
          <div className="break-words">{hatIdToMint || 'null'}</div>
        </div>
        <p className="text-sm mt-2" style={{ color: '#8B3A3A' }}>
          Please contact a pod administrator to create the {roleLabel} role
          before approving applications.
        </p>
      </div>
    );
  }

  // 2. Validate applicant address format
  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(applicantAddress);

  if (!isValidAddress) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: '#F5E6E6', border: '1px solid #D9B3B3' }}
      >
        <div
          className="flex items-center gap-2 mb-2"
          style={{ color: '#8B3A3A' }}
        >
          <AlertCircle className="w-5 h-5" />
          <span className="font-semibold">Invalid Applicant Address</span>
        </div>
        <p className="text-sm mb-2" style={{ color: '#8B3A3A' }}>
          The applicant's wallet address is invalid or improperly formatted.
        </p>
        <p
          className="text-xs p-2 rounded font-mono"
          style={{ color: '#8B3A3A', backgroundColor: '#F5E6E6' }}
        >
          Address: {applicantAddress}
        </p>
        <p className="text-sm mt-2" style={{ color: '#8B3A3A' }}>
          This is likely sample data. Use a real wallet address to test.
        </p>
      </div>
    );
  }

  // 3. Check permission to mint (for member HATs)
  if (roleLabel === 'member' && !isLoadingPermission && !hasManagementHat) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8' }}
      >
        <div
          className="flex items-center gap-2 mb-2"
          style={{ color: '#C6933F' }}
        >
          <ShieldAlert className="w-5 h-5" />
          <span className="font-semibold">Permission Required</span>
        </div>
        <p className="text-sm mb-2" style={{ color: '#C6933F' }}>
          You need to be wearing the <strong>Management Role</strong> of this
          pod to approve member applications.
        </p>
        <p
          className="text-xs p-2 rounded"
          style={{ color: '#C6933F', backgroundColor: '#FAF4EC' }}
        >
          <strong>Why:</strong> In Hats Protocol, only wearers of the admin role
          (management role) can mint child roles (membership roles).
        </p>
        <p className="text-sm mt-2" style={{ color: '#C6933F' }}>
          Contact a pod administrator to mint you the Management Role first, or
          have them approve this application instead.
        </p>
      </div>
    );
  }

  // ========================================
  // LEADER HAT APPROVAL (No Direct Minting)
  // ========================================
  // Leader HATs cannot be minted by other users because:
  // - Management HAT admin is Proxy Admin HAT (worn only by proxy contract)
  // - Users don't have permission to mint Management HATs to others
  // Solution: Approve application, then applicant claims/mints HAT themselves

  if (roleLabel === 'leader') {
    const handleLeaderApproval = async () => {
      try {
        console.log('🔵 === LEADER APPROVAL STARTED ===');
        console.log('🔵 Application ID:', applicationId);
        console.log('🔵 Applicant Address:', applicantAddress);
        console.log('🔵 Pod ID:', podId);
        console.log('🔵 Approver Address:', address);

        setIsProcessing(true);

        // ✅ ISSUE #5 FIX: Check eligibility before approving leader application
        console.log('🔍 Checking leader eligibility before approval...');
        const { data: leaderRole, error: roleError } = await supabase
          .from('pod_role_permissions')
          .select('id, eligibility_criteria, role_name')
          .eq('pod_id', podId)
          .eq('role_name', 'pod_leader')
          .eq('is_active', true)
          .single();

        if (roleError) {
          console.warn('⚠️ No leader role found - skipping eligibility check');
        } else if (leaderRole) {
          const evaluation = await EligibilityService.checkUserEligibility(
            applicantAddress,
            podId,
            leaderRole.id,
          );

          console.log('🔍 Leader eligibility result:', evaluation);

          if (!evaluation.eligible) {
            throw new Error(
              `Applicant does not meet leader eligibility requirements: ${evaluation.overallResult.message}`,
            );
          }

          console.log(
            '✅ Leader eligibility verified - proceeding with approval',
          );
        }

        // 🔍 DEBUG: Check authentication before attempting UPDATE
        console.log('🔍 === AUTHENTICATION DEBUG ===');
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        console.log('🔍 Current auth user:', authUser);
        console.log('🔍 Auth user ID:', authUser?.id);

        // Check if user_profiles has this user_id
        const { data: userProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('user_id, wallet_address')
          .eq('user_id', authUser?.id)
          .single();

        console.log('🔍 User profile lookup:', userProfile);
        console.log('🔍 Profile error:', profileError);

        // Check pod_leads
        const { data: podCheck } = await supabase
          .from('pods')
          .select('pod_leads')
          .eq('id', podId)
          .single();

        console.log('🔍 Pod leads:', podCheck?.pod_leads);
        console.log(
          '🔍 User wallet from profile:',
          userProfile?.wallet_address,
        );
        console.log(
          '🔍 Is wallet in pod_leads?',
          podCheck?.pod_leads?.includes(userProfile?.wallet_address),
        );
        console.log('🔍 === END AUTH DEBUG ===');

        // Update application status to approved
        console.log('🔵 Step 1: Updating application status...');
        const { data: updatedApp, error: updateError } = await supabase
          .from('pod_membership_applications')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
          })
          .eq('id', applicationId)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Failed to update application:', updateError);
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log(
          '✅ Step 1 Complete: Application status updated',
          updatedApp,
        );

        // Get pod name for notification
        console.log('🔵 Step 2: Fetching pod name...');
        const { data: pod, error: podError } = await supabase
          .from('pods')
          .select('name')
          .eq('id', podId)
          .single();

        if (podError) {
          console.error('❌ Failed to fetch pod:', podError);
          throw new Error(`Failed to fetch pod: ${podError.message}`);
        }

        console.log('✅ Step 2 Complete: Pod name:', pod?.name);

        // Add applicant to pod_leads array so ClaimManagementHATButton will show
        console.log('🔵 Step 3: Adding applicant to pod_leads array...');
        const { data: currentPod, error: podFetchError } = await supabase
          .from('pods')
          .select('pod_leads')
          .eq('id', podId)
          .single();

        if (podFetchError) {
          console.error('❌ Failed to fetch pod_leads:', podFetchError);
          throw new Error(
            `Failed to fetch pod_leads: ${podFetchError.message}`,
          );
        }

        const currentLeads = currentPod?.pod_leads || [];
        const applicantLower = applicantAddress.toLowerCase();

        // Add if not already in array
        if (!currentLeads.includes(applicantLower)) {
          const updatedLeads = [...currentLeads, applicantLower];

          const { error: updateLeadsError } = await supabase
            .from('pods')
            .update({ pod_leads: updatedLeads })
            .eq('id', podId);

          if (updateLeadsError) {
            console.error('❌ Failed to update pod_leads:', updateLeadsError);
            throw new Error(
              `Failed to update pod_leads: ${updateLeadsError.message}`,
            );
          }

          console.log(
            '✅ Step 3 Complete: Added to pod_leads. New leaders:',
            updatedLeads,
          );
        } else {
          console.log('✅ Step 3 Complete: Already in pod_leads, skipping');
        }

        // Send notification to applicant with instructions to claim HAT
        console.log('🔵 Step 4: Sending notification to applicant...');
        const { data: notification, error: notifError } = await supabase
          .from('general_notifications')
          .insert({
            recipient_address: applicantAddress.toLowerCase(),
            sender_address: address?.toLowerCase() || '',
            notification_type: 'pod_application_status',
            title: `Leadership Application Approved!`,
            message: `Your application to ${pod?.name || 'the pod'} has been approved. Visit the pod page to claim your management role.`,
            context_type: 'governance',
            context_id: podId,
            context_url: `/pods/${podId}`,
          })
          .select()
          .single();

        if (notifError) {
          console.error('❌ Failed to create notification:', notifError);
          throw new Error(`Notification failed: ${notifError.message}`);
        }

        console.log('✅ Step 4 Complete: Notification created', notification);

        console.log('🎉 === LEADER APPROVAL COMPLETE ===');
        console.log('📋 Summary:');
        console.log('  - Application marked as approved');
        console.log('  - Applicant added to pod_leads array');
        console.log('  - Notification sent to:', applicantAddress);
        console.log('  - Applicant can now visit pod page and claim role');

        toast({
          title: 'Leader Application Approved!',
          description: `Applicant has been notified and can now claim their management role.`,
          duration: 5000,
        });

        onSuccess?.();
      } catch (error: any) {
        console.error('❌ === LEADER APPROVAL FAILED ===');
        console.error('❌ Error details:', error);
        console.error('❌ Error message:', error?.message);
        console.error('❌ Error code:', error?.code);
        toast({
          title: 'Approval Failed',
          description:
            error?.message ||
            'Failed to approve application. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsProcessing(false);
        console.log('🔵 Processing complete, button re-enabled');
      }
    };

    return (
      <div className="space-y-4">
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: '#EDEAF0', border: '1px solid #D1CAD9' }}
        >
          <div className="flex items-start gap-3">
            <Crown className="w-5 h-5 mt-0.5" style={{ color: '#6A5F7A' }} />
            <div className="flex-1">
              <p
                className="text-sm font-medium mb-2"
                style={{ color: '#4A3F5A' }}
              >
                Leader Application - Approval Only
              </p>
              <p className="text-sm mb-2" style={{ color: '#6A5F7A' }}>
                Leader roles cannot be directly minted to others due to
                permission constraints (only the proxy contract holds admin
                rights).
              </p>
              <p className="text-sm" style={{ color: '#6A5F7A' }}>
                <strong>Approval Process:</strong>
              </p>
              <ol
                className="text-sm ml-4 mt-1 space-y-1"
                style={{ color: '#6A5F7A' }}
              >
                <li>1. Click "Approve Application" below</li>
                <li>2. Applicant will be notified</li>
                <li>3. Applicant claims their management role themselves</li>
              </ol>
            </div>
          </div>
        </div>

        <button
          onClick={handleLeaderApproval}
          disabled={isProcessing || !address}
          className="w-full text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: '#6A5F7A' }}
          onMouseEnter={(e) =>
            !isProcessing &&
            !e.currentTarget.disabled &&
            (e.currentTarget.style.backgroundColor = '#5A4F6A')
          }
          onMouseLeave={(e) =>
            !isProcessing &&
            !e.currentTarget.disabled &&
            (e.currentTarget.style.backgroundColor = '#6A5F7A')
          }
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Approving...
            </>
          ) : (
            <>
              <Crown className="w-4 h-4" />
              Approve Leader Application
            </>
          )}
        </button>

        {/* Applicant Name Card - Clickable to open identity modal */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2">Applicant:</p>
          <div
            className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
            onClick={() => openProfileModal(applicantAddress)}
          >
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
              {applicantProfile?.profile_picture ? (
                <img
                  src={applicantProfile.profile_picture}
                  alt={applicantProfile?.first_name || 'Profile'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {applicantProfile?.first_name || applicantProfile?.last_name ? (
                <div className="flex items-center space-x-1">
                  {applicantProfile.first_name && (
                    <span className="font-medium text-gray-700">
                      {applicantProfile.first_name}
                    </span>
                  )}
                  {applicantProfile.last_name && (
                    <span className="text-gray-700">
                      {applicantProfile.last_name}
                    </span>
                  )}
                </div>
              ) : (
                <span className="font-medium text-gray-500 italic">
                  No Name
                </span>
              )}
              <p className="text-xs text-gray-400 truncate">
                {applicantAddress.slice(0, 8)}...{applicantAddress.slice(-6)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // MEMBER HAT MINTING (Direct Mint)
  // ========================================
  // Member HATs can be minted directly because:
  // - Membership HAT admin is Management HAT
  // - Current user wears Management HAT (verified above)

  // ✅ ISSUE #5 FIX: Show eligibility check UI if not yet checked
  if (!eligibilityResult) {
    return (
      <div className="space-y-4">
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}
        >
          <div
            className="flex items-center gap-2 mb-2"
            style={{ color: '#1F453A' }}
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">
              Eligibility Verification Required
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: '#2F5D50' }}>
            Before minting the {roleLabel} role, you must verify that the
            applicant meets all eligibility requirements (tokens, agreements,
            credentials, etc.).
          </p>
          <button
            onClick={checkApplicantEligibility}
            disabled={isCheckingEligibility || !address}
            className="w-full text-white px-4 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: '#2F5D50' }}
            onMouseEnter={(e) =>
              !isCheckingEligibility &&
              !e.currentTarget.disabled &&
              (e.currentTarget.style.backgroundColor = '#1F453A')
            }
            onMouseLeave={(e) =>
              !isCheckingEligibility &&
              !e.currentTarget.disabled &&
              (e.currentTarget.style.backgroundColor = '#2F5D50')
            }
          >
            {isCheckingEligibility ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking Eligibility...
              </>
            ) : (
              'Check Applicant Eligibility'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ✅ ISSUE #5 FIX: Block minting if eligibility check failed
  if (eligibilityError || !eligibilityResult.eligible) {
    return (
      <div className="space-y-4">
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: '#F5E6E6', border: '1px solid #D9B3B3' }}
        >
          <div
            className="flex items-center gap-2 mb-2"
            style={{ color: '#8B3A3A' }}
          >
            <XCircle className="w-5 h-5" />
            <span className="font-semibold">
              Eligibility Requirements Not Met
            </span>
          </div>
          <p className="text-sm mb-2" style={{ color: '#8B3A3A' }}>
            The applicant does not meet the eligibility requirements for the{' '}
            {roleLabel} role.
          </p>
          <div
            className="text-sm p-3 rounded mb-3"
            style={{ color: '#8B3A3A', backgroundColor: '#F5E6E6' }}
          >
            <strong>Reason:</strong>{' '}
            {eligibilityError || eligibilityResult.overallResult.message}
          </div>
          <div className="text-xs mb-3" style={{ color: '#8B3A3A' }}>
            <strong>Criteria Status:</strong>
            <ul className="mt-2 space-y-1 ml-4">
              {Object.entries(eligibilityResult.criteriaResults).map(
                ([key, result]) => (
                  <li key={key}>
                    {result.passed ? '✅' : '❌'} {key}:{' '}
                    {result.details ||
                      (result.passed ? 'Passed' : result.error || 'Failed')}
                  </li>
                ),
              )}
            </ul>
          </div>
          <p className="text-sm" style={{ color: '#8B3A3A' }}>
            <strong>Action:</strong> The applicant must fulfill all eligibility
            requirements before their role can be minted. Reject this
            application or ask the applicant to meet the requirements and
            reapply.
          </p>
        </div>

        {/* Allow re-checking eligibility */}
        <button
          onClick={checkApplicantEligibility}
          disabled={isCheckingEligibility}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isCheckingEligibility ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Re-checking...
            </>
          ) : (
            'Re-check Eligibility'
          )}
        </button>
      </div>
    );
  }

  // ✅ If we reach here, eligibility check passed! Show success message and proceed with minting
  console.log('✅ Eligibility verified - proceeding to mint HAT');

  // Encode the mintHat function call (safe now after validation)
  // Use effectiveHatId which may be auto-created or original hatIdToMint
  const mintHatCallData = encodeFunctionData({
    abi: HATS_MINT_ABI,
    functionName: 'mintHat',
    args: [BigInt(effectiveHatId), applicantAddress as `0x${string}`],
  });

  const handleSuccess = async (response: { transactionReceipts: any[] }) => {
    try {
      setIsProcessing(true);

      const txHash = response.transactionReceipts?.[0]?.transactionHash;

      // Update application status
      await supabase
        .from('pod_membership_applications')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      // Add to pod_members
      await supabase.from('pod_members').insert({
        pod_id: podId,
        wallet: applicantAddress.toLowerCase(),
        membership_type: roleLabel,
        role: roleLabel,
        hat_id: effectiveHatId, // Use effective HAT ID (may be auto-created)
        is_active: true,
        joined_at: new Date().toISOString(),
      });

      // Get pod name for notification
      const { data: pod } = await supabase
        .from('pods')
        .select('name')
        .eq('id', podId)
        .single();

      // Send success notification to applicant
      await supabase.from('general_notifications').insert({
        recipient_address: applicantAddress.toLowerCase(),
        sender_address: address?.toLowerCase() || '',
        notification_type: 'pod_application_status',
        title: `Welcome to ${pod?.name || 'the pod'}!`,
        message: `Your application has been approved and your ${roleLabel} role has been minted.`,
        context_type: 'governance',
        context_id: podId,
        context_url: `/pods/${podId}`,
      });

      toast({
        title: 'Application Approved!',
        description: `${roleLabel} role minted successfully. Transaction: ${txHash?.slice(0, 10)}...`,
        duration: 5000,
      });

      onSuccess?.();
    } catch (error) {
      console.error('Error updating database after role mint:', error);
      toast({
        title: 'Role Minted, Database Update Failed',
        description:
          'Role was minted on-chain but database update failed. Please refresh.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleError = (error: Error) => {
    console.error('❌ HAT minting transaction error:', error);
    console.error('Error details:', {
      message: error.message,
      effectiveHatId,
      applicantAddress,
      currentUser: address,
    });

    // Parse common errors
    let errorMessage =
      error.message || 'Failed to mint role. Please try again.';

    if (error.message?.includes('execution reverted')) {
      errorMessage =
        "Transaction would revert. This usually means you don't have permission to mint this role, or the applicant is not eligible.";
    } else if (error.message?.includes('failed to estimate gas')) {
      errorMessage =
        'Failed to estimate gas. The role minting call would fail. Check if you have permission to mint this role.';
    } else if (error.message?.includes('user rejected')) {
      errorMessage = 'Transaction cancelled by user.';
    }

    toast({
      title: 'Transaction Failed',
      description: errorMessage,
      variant: 'destructive',
    });
  };

  const handleStatusChange = (status: LifecycleStatus) => {
    console.log('Transaction status:', status);
  };

  return (
    <div className="space-y-4">
      {/* ✅ ISSUE #5 FIX: Show eligibility verification success banner */}
      <div
        className="p-3 rounded-lg"
        style={{ backgroundColor: '#D1E6DC', border: '1px solid #B8D9CA' }}
      >
        <div className="flex items-center gap-2" style={{ color: '#3F7A5A' }}>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium">
            ✅ Eligibility Verified ({eligibilityResult.overallResult.passed}/
            {eligibilityResult.overallResult.total} criteria met)
          </span>
        </div>
        <p className="text-xs mt-1 ml-7" style={{ color: '#3F7A5A' }}>
          Applicant meets all requirements. Ready to mint {roleLabel} role.
        </p>
      </div>

      <Transaction
        chainId={base.id}
        isSponsored={true}
        calls={[
          {
            to: HATS_PROTOCOL_ADDRESS,
            data: mintHatCallData,
            value: BigInt(0),
          },
        ]}
        onSuccess={handleSuccess}
        onError={handleError}
        onStatus={handleStatusChange}
        capabilities={{
          paymasterService: {
            url: process.env.NEXT_PUBLIC_PAYMASTER || '',
          },
        }}
      >
        <div className="flex flex-col gap-4">
          <TransactionButton
            text={`Approve & Mint ${roleLabel} Role`}
            disabled={isProcessing || !address}
            className="text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#3F7A5A' }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) =>
              !isProcessing &&
              !e.currentTarget.disabled &&
              (e.currentTarget.style.backgroundColor = '#2F5D50')
            }
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) =>
              !isProcessing &&
              !e.currentTarget.disabled &&
              (e.currentTarget.style.backgroundColor = '#3F7A5A')
            }
          />

          <TransactionStatus>
            <div className="flex flex-col gap-2 p-4 border rounded-lg bg-gray-50">
              <TransactionStatusLabel />
              <TransactionStatusAction />
            </div>
          </TransactionStatus>
        </div>
      </Transaction>

      {/* Profile Modal - Opens when clicking on applicant name */}
      {isProfileModalOpen && selectedUser && (
        <ProfileModal
          user={selectedUser}
          users={users}
          onClose={closeProfileModal}
        />
      )}
    </div>
  );
};
