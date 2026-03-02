'use client';

import { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import {
  encodeFunctionData,
  decodeEventLog,
  createPublicClient,
  http,
  createWalletClient,
  custom,
} from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { useReadContract } from 'wagmi';
import { Button } from '@/components/ui/button';
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
import { notifyExecPodOfNewMember, notifyPodLeadersOfNewMember } from '@/features/pods/services/PodMembershipNotificationService';

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

// ABI for HatCreated event - NO parameters are indexed (Hats Protocol spec)
const HAT_CREATED_EVENT_ABI = {
  type: 'event',
  name: 'HatCreated',
  inputs: [
    { name: 'id', type: 'uint256', indexed: false },
    { name: 'details', type: 'string', indexed: false },
    { name: 'maxSupply', type: 'uint32', indexed: false },
    { name: 'eligibility', type: 'address', indexed: false },
    { name: 'toggle', type: 'address', indexed: false },
    { name: 'mutable_', type: 'bool', indexed: false },
    { name: 'imageURI', type: 'string', indexed: false },
  ],
} as const;

// ABI for createHat function
const CREATE_HAT_ABI = [
  {
    name: 'createHat',
    type: 'function',
    inputs: [
      { name: '_admin', type: 'uint256' },
      { name: '_details', type: 'string' },
      { name: '_maxSupply', type: 'uint32' },
      { name: '_eligibility', type: 'address' },
      { name: '_toggle', type: 'address' },
      { name: '_mutable', type: 'bool' },
      { name: '_imageURI', type: 'string' },
    ],
    outputs: [{ name: 'newHatId', type: 'uint256' }],
    stateMutability: 'nonpayable',
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
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
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
        evmAddress && managementHatId
          ? [evmAddress as `0x${string}`, BigInt(managementHatId)]
          : undefined,
      query: {
        enabled: !!evmAddress && !!managementHatId && roleLabel.toLowerCase() === 'member',
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
      // Note: Role names vary by pod (e.g., 'Pod Leader', 'Beta Tester ', 'Executive Pod Leader')
      // For Beta Tester pod, the role is 'Beta Tester ' (which acts as both leader and member)
      const { data: roles, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('id, eligibility_criteria, role_name')
        .eq('pod_id', podId)
        .eq('is_active', true);

      if (roleError || !roles || roles.length === 0) {
        console.warn(
          '⚠️ No roles found for pod - allowing by default',
          roleError,
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

      // Find the appropriate role based on roleLabel
      // For leader: look for roles containing 'Leader' or use first role if only one exists
      // For member: look for roles containing 'Member' or use first role if only one exists
      let role;
      if (roleLabel.toLowerCase() === 'leader') {
        role = roles.find((r) => r.role_name.toLowerCase().includes('leader'));
      } else {
        role = roles.find((r) => r.role_name.toLowerCase().includes('member'));
      }

      // If no specific role found, use the first (and possibly only) role
      // This handles cases like Beta Tester pod where there's only one role
      if (!role && roles.length > 0) {
        role = roles[0];
        console.log(
          `ℹ️ No ${roleLabel} role found, using default role: ${role.role_name}`,
        );
      }

      if (!role) {
        console.error('❌ No role found for eligibility check');
        toast({
          title: 'Error',
          description: 'Role configuration not found',
          variant: 'destructive',
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

      if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
        throw new Error('Please connect your Smart Wallet to continue');
      }

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const smartAccount = currentUser.evmSmartAccounts[0];
      const smartAccountAddress = (typeof smartAccount === 'string'
        ? smartAccount
        : (smartAccount as any).address) as `0x${string}`;

      let adminHatBigInt: bigint;
      try {
        adminHatBigInt = BigInt(managementHatId);
      } catch {
        throw new Error('Invalid management HAT ID format');
      }

      // Step 1: Pre-read getNextId so we know the hat ID before sending the tx
      const GET_NEXT_ID_ABI = [{
        name: 'getNextId',
        type: 'function',
        inputs: [{ name: '_admin', type: 'uint256' }],
        outputs: [{ name: 'nextId', type: 'uint256' }],
        stateMutability: 'view',
      }] as const;

      const predictedHatId = await publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: GET_NEXT_ID_ABI,
        functionName: 'getNextId',
        args: [adminHatBigInt],
      });
      const newHatId = predictedHatId.toString();
      console.log('🔮 Predicted new membership HAT ID:', newHatId);

      toast({
        title: 'Creating Membership Role',
        description: 'Submitting transaction to create a new membership role...',
      });

      // Step 2: Send createHat transaction
      const createHatData = encodeFunctionData({
        abi: CREATE_HAT_ABI,
        functionName: 'createHat',
        args: [
          adminHatBigInt,
          `${podName} Member`,
          1000,
          '0x0000000000000000000000000000000000000001' as `0x${string}`,
          smartAccountAddress,
          true,
          '',
        ],
      });

      const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: HATS_PROTOCOL_ADDRESS, value: 0n, data: createHatData }],
        ...(paymasterUrl ? { paymasterUrl } : { useCdpPaymaster: true }),
      });

      console.log('✅ createHat userOp submitted:', (result as any)?.userOperationHash);

      // Step 3: Update DB with the predicted hat ID (confirmed by tx success)
      await supabase
        .from('pods')
        .update({ membership_hat_id: newHatId })
        .eq('id', podId);

      console.log('✅ Database updated with new membership_hat_id:', newHatId);

      setAutoCreatedHatId(newHatId);

      toast({
        title: 'Membership Role Created!',
        description: 'You can now proceed with approving this application.',
      });
    } catch (error: any) {
      console.error('❌ Failed to auto-create membership role:', error);
      toast({
        title: 'Failed to Create Membership Role',
        description: error?.message || 'Please try again or contact an administrator.',
        variant: 'destructive',
      });
    } finally {
      setIsAutoCreatingHat(false);
    }
  };

  // Show auto-create option for member role if HAT is missing
  if (!isValidHatId && roleLabel.toLowerCase() === 'member' && !autoCreatedHatId) {
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
          disabled={isAutoCreatingHat || !evmAddress || !currentUser?.evmSmartAccounts?.[0]}
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
  if (roleLabel.toLowerCase() === 'member' && !isLoadingPermission && !hasManagementHat) {
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

  if (roleLabel.toLowerCase() === 'leader') {
    const handleLeaderApproval = async () => {
      try {
        console.log('🔵 === LEADER APPROVAL STARTED ===');
        console.log('🔵 Application ID:', applicationId);
        console.log('🔵 Applicant Address:', applicantAddress);
        console.log('🔵 Pod ID:', podId);
        console.log('🔵 Approver Address:', evmAddress);

        setIsProcessing(true);

        // ✅ ISSUE #5 FIX: Check eligibility before approving leader application
        console.log('🔍 Checking leader eligibility before approval...');

        // Fetch all roles for the pod
        const { data: allRoles, error: roleError } = await supabase
          .from('pod_role_permissions')
          .select('id, eligibility_criteria, role_name')
          .eq('pod_id', podId)
          .eq('is_active', true);

        // Find leader role (handles different naming conventions)
        const leaderRole = allRoles?.find((r) =>
          r.role_name.toLowerCase().includes('leader'),
        ) || allRoles?.[0]; // Fallback to first role if no leader-specific role

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
            sender_address: evmAddress?.toLowerCase() || '',
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
          disabled={isProcessing || !evmAddress}
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
            disabled={isCheckingEligibility || !evmAddress}
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

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleMintMemberHATTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for member HAT minting:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to mint member roles.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    // 🚨 CRITICAL FIX #1: Prevent self-approval
    if (applicantAddress.toLowerCase() === evmAddress.toLowerCase()) {
      console.error('❌ SELF-APPROVAL BLOCKED: Applicant and approver are the same address');
      console.error('Applicant:', applicantAddress);
      console.error('Approver (evmAddress):', evmAddress);
      toast({
        title: 'Self-Approval Not Allowed',
        description: 'You cannot approve your own membership application. Another pod leader must approve it.',
        variant: 'destructive',
      });
      return;
    }

    setIsTransactionPending(true); // EXACT FAUCET PATTERN
    setIsProcessing(true);

    try {
      console.log('🚀 Building Smart Account User Operation for member HAT minting...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('📍 Smart Account Address:', smartAccount.address);
      console.log('👤 Current User Address (evmAddress):', evmAddress);
      console.log('🎩 Management HAT ID:', managementHatId);
      console.log('🎯 HAT to mint:', effectiveHatId);
      console.log('👥 Applicant Address:', applicantAddress);
      console.log('✅ Has Management HAT (UI check):', hasManagementHat);
      console.log('🎯 Contract: Hats Protocol - mintHat');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Pre-flight checks for Hats Protocol mintHat requirements
      if (publicClient) {
        // smartAccount from CDP is already an address string, not an object
        const smartAccountAddress = (typeof smartAccount === 'string' ? smartAccount : smartAccount.address) as `0x${string}`;

        console.log('\n📋 STARTING PRE-FLIGHT CHECKS...\n');

        // ✅ CHECK #1: Verify smart account has management HAT on-chain
        console.log('CHECK #1: Does smart account wear management HAT?');
        const onChainBalance = await publicClient.readContract({
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
          args: [smartAccountAddress, BigInt(managementHatId)],
        });
        console.log('🔍 Smart Account Management HAT balance:', Number(onChainBalance));

        if (Number(onChainBalance) === 0) {
          console.error('❌ FAILED CHECK #1: Smart account does NOT have management HAT');
          toast({
            title: 'Permission Error',
            description: 'Your account does not have the management role required to approve applications.',
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #1: Smart account wears management HAT\n');

        // ✅ CHECK #2: Verify target HAT exists on-chain
        console.log('CHECK #2: Does target HAT exist on-chain?');
        let hatDetails: any;
        try {
          hatDetails = await publicClient.readContract({
            address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
            abi: [
              {
                name: 'viewHat',
                type: 'function',
                inputs: [{ name: '_hatId', type: 'uint256' }],
                outputs: [
                  { name: 'details', type: 'string' },
                  { name: 'maxSupply', type: 'uint32' },
                  { name: 'supply', type: 'uint32' },
                  { name: 'eligibility', type: 'address' },
                  { name: 'toggle', type: 'address' },
                  { name: 'imageURI', type: 'string' },
                  { name: 'lastHatId', type: 'uint16' },
                  { name: 'mutable_', type: 'bool' },
                  { name: 'active', type: 'bool' },
                ],
                stateMutability: 'view',
              },
            ],
            functionName: 'viewHat',
            args: [BigInt(effectiveHatId)],
          });
          console.log('🔍 HAT details from blockchain:', {
            maxSupply: hatDetails[1],
            currentSupply: hatDetails[2],
            active: hatDetails[8],
          });
        } catch (viewHatError) {
          console.error('❌ FAILED CHECK #2: HAT does not exist on-chain!', viewHatError);
          toast({
            title: 'Role Not Found',
            description: 'This role does not exist on the blockchain. Please contact a pod administrator to create it first.',
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #2: Target HAT exists on-chain\n');

        // ✅ CHECK #3: Verify HAT is active
        console.log('CHECK #3: Is target HAT active?');
        const isActive = hatDetails[8]; // active is at index 8
        if (!isActive) {
          console.error('❌ FAILED CHECK #3: Target HAT is inactive');
          toast({
            title: 'Role Inactive',
            description: 'This role is currently inactive and cannot be minted. Please contact a pod administrator.',
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #3: Target HAT is active\n');

        // ✅ CHECK #4: Verify max supply not reached
        console.log('CHECK #4: Is there capacity for new wearers?');
        const maxSupply = Number(hatDetails[1]);
        const currentSupply = Number(hatDetails[2]);
        console.log(`🔍 Supply: ${currentSupply} / ${maxSupply}`);
        if (currentSupply >= maxSupply) {
          console.error('❌ FAILED CHECK #4: HAT has reached max supply');
          toast({
            title: 'Role at Capacity',
            description: `This role has reached its maximum capacity (${maxSupply}). Please contact a pod administrator to increase the limit.`,
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #4: Capacity available for new wearer\n');

        // ✅ CHECK #5: Verify applicant doesn't already wear the HAT
        console.log('CHECK #5: Does applicant already wear this HAT?');
        const applicantBalance = await publicClient.readContract({
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
          args: [applicantAddress as `0x${string}`, BigInt(effectiveHatId)],
        });
        console.log('🔍 Applicant HAT balance:', Number(applicantBalance));

        if (Number(applicantBalance) > 0) {
          console.error('❌ FAILED CHECK #5: Applicant already wears this HAT');
          toast({
            title: 'Already Has Role',
            description: 'This applicant already has this role. No need to mint again.',
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #5: Applicant does not wear this HAT\n');

        // ✅ CHECK #6: CRITICAL - Verify smart account is admin of target HAT
        console.log('CHECK #6: Is smart account an admin of the target HAT?');
        const isAdmin = await publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
          abi: [
            {
              name: 'isAdminOfHat',
              type: 'function',
              inputs: [
                { name: '_user', type: 'address' },
                { name: '_hatId', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'isAdminOfHat',
          args: [smartAccountAddress, BigInt(effectiveHatId)],
        });
        console.log('🔍 Is admin of target HAT:', isAdmin);

        if (!isAdmin) {
          console.error('❌ FAILED CHECK #6: Smart account is NOT admin of target HAT!');
          console.error('This is the CRITICAL issue - according to Hats Protocol:');
          console.error('"Only a hat\'s admin(s) can mint its token to a wearer"');
          console.error('\nDebugging info:');
          console.error('  Smart Account:', smartAccountAddress);
          console.error('  Management HAT:', managementHatId, '(user wears this ✅)');
          console.error('  Target HAT:', effectiveHatId, '(trying to mint this)');
          console.error('\nPossible causes:');
          console.error('  1. Target HAT has wrong admin set (not the management HAT)');
          console.error('  2. HAT hierarchy is incorrect');
          console.error('  3. HAT was created with a different admin');
          toast({
            title: 'Admin Permission Missing',
            description: 'Your account is not an admin of this role. The role may have been created with incorrect admin settings. Please contact a pod administrator.',
            variant: 'destructive',
          });
          setIsTransactionPending(false);
          setIsProcessing(false);
          return;
        }
        console.log('✅ PASSED CHECK #6: Smart account IS admin of target HAT\n');

        console.log('🎉 ALL PRE-FLIGHT CHECKS PASSED! Proceeding with mint transaction...\n');
      }

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: HATS_MINT_ABI,
        functionName: 'mintHat',
        args: [BigInt(effectiveHatId), applicantAddress as `0x${string}`],
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
          hat_id: effectiveHatId,
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
          sender_address: evmAddress.toLowerCase(),
          notification_type: 'pod_application_status',
          title: `Welcome to ${pod?.name || 'the pod'}!`,
          message: `Your application has been approved and your ${roleLabel} role has been minted.`,
          context_type: 'governance',
          context_id: podId,
          context_url: `/pods/${podId}`,
        });

        // Notify exec pod members of new member
        await notifyExecPodOfNewMember({
          newMemberAddress: applicantAddress,
          newMemberName: applicantProfile?.first_name && applicantProfile?.last_name
            ? `${applicantProfile.first_name} ${applicantProfile.last_name}`
            : applicantProfile?.first_name || undefined,
          podId,
          podName: pod?.name || 'Unknown Pod',
          roleLabel,
        });

        // Notify pod leaders of new member
        await notifyPodLeadersOfNewMember({
          newMemberAddress: applicantAddress,
          newMemberName: applicantProfile?.first_name && applicantProfile?.last_name
            ? `${applicantProfile.first_name} ${applicantProfile.last_name}`
            : applicantProfile?.first_name || undefined,
          podId,
          podName: pod?.name || 'Unknown Pod',
          roleLabel,
        });

        toast({
          title: 'Application Approved!',
          description: `${roleLabel} role minted successfully. Transaction: ${txHash?.slice(0, 10)}...`,
          duration: 5000,
        });

        onSuccess?.();
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Member HAT minting completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Member HAT minting failed:', error);
      console.error('Error details:', {
        message: error.message,
        effectiveHatId,
        applicantAddress,
        currentUser: evmAddress,
      });

      // Parse common errors
      let errorMessage = error.message || 'Failed to mint role. Please try again.';

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
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
      setIsProcessing(false);
    }
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

      {/* CDP Smart Account Transaction Button */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleMintMemberHATTransaction}
          disabled={isTransactionPending || isProcessing}
          className="w-full text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#3F7A5A] hover:bg-[#2F5D50]"
        >
          {isTransactionPending || isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              {isTransactionPending ? 'Minting Role...' : 'Processing...'}
            </>
          ) : (
            `Approve`
          )}
        </Button>
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
            Please connect your Smart Wallet to mint member roles.
          </p>
        </div>
      )}

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
