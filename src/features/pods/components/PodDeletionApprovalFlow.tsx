'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress, useSendUserOperation, useCurrentUser, useSignEvmMessage } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { PodDeletionService } from '../services/PodDeletionService';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { supabase } from '@/utils/supabaseClient';
import { PodDeletionDebugger } from './PodDeletionDebugger';
import { MemberCard } from './MembersPanel/MemberCard';
import { EventService } from '../../events/lib/supabase';
import { encodeFunctionData } from 'viem';
import { publicClient } from '@/config/wagmi.client';
import type { Pod } from '../types';
import type { UserProfile } from '../../identity/types';

interface PodDeletionApprovalFlowProps {
  pod: Pod;
  onProposalCreated?: (proposalId: string) => void;
  onDeletionComplete?: () => void;
  className?: string;
}

interface DeletionProposal {
  id: string;
  pod_id: string;
  pod_name: string;
  proposed_by: string;
  required_approvals: number;
  current_approvals: string[];
  status:
    | 'pending'
    | 'approved'
    | 'executed'
    | 'rejected'
    | 'expired'
    | 'failed';
  created_at: string;
  expires_at: string;
  rejection_reason?: string;
}

export const PodDeletionApprovalFlow: React.FC<
  PodDeletionApprovalFlowProps
> = ({ pod, onProposalCreated, onDeletionComplete, className = '' }) => {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();
  const { sendUserOperation, status: txStatus, error: txError } = useSendUserOperation();
  const pubClient = usePublicClient();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [activeProposal, setActiveProposal] = useState<DeletionProposal | null>(
    null,
  );
  const [canPropose, setCanPropose] = useState(false);
  const [hasApproved, setHasApproved] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [showApprovalSignature, setShowApprovalSignature] = useState(false);
  const [transactionCalls, setTransactionCalls] = useState<any[]>([]);
  const [showTransaction, setShowTransaction] = useState(false);
  const [deletionExecuted, setDeletionExecuted] = useState(false);

  // Force refresh function for debugging
  const forceRefresh = async () => {
    console.log('🔄 Force refreshing component...');
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('pod_deletion_proposals')
        .select('*')
        .eq('pod_id', pod.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() to avoid 406 when no proposals found

      if (data && !error) {
        console.log('🔄 Refreshed proposal data:', data);
        setActiveProposal(data);
        setHasApproved(
          address
            ? data.current_approvals.some(
                (a: string) => a.toLowerCase() === address.toLowerCase(),
              )
            : false,
        );
      } else {
        console.log('🔄 No proposal found during refresh');
        setActiveProposal(null);
        setHasApproved(false);
      }
    } catch (error) {
      console.error('🔄 Error during force refresh:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user can propose deletion
  useEffect(() => {
    console.log('🔍 PodDeletionApprovalFlow: Checking proposal permissions:', {
      address,
      pod_leads: pod.pod_leads,
      pod_name: pod.name,
    });

    if (!address || !pod.pod_leads) {
      console.log('❌ Cannot propose: Missing address or pod_leads');
      setCanPropose(false);
      return;
    }

    const isLeader = pod.pod_leads.some(
      (lead) => lead.toLowerCase() === address.toLowerCase(),
    );

    console.log('✅ Proposal permission check result:', {
      isLeader,
      userAddress: address,
      podLeads: pod.pod_leads,
    });

    setCanPropose(isLeader);
  }, [address, pod.pod_leads]);

  // Fetch user profiles for pod leaders and proposal participants
  useEffect(() => {
    const fetchUserProfiles = async () => {
      const addressesToFetch = new Set<string>();

      // Add pod leaders
      if (pod.pod_leads) {
        pod.pod_leads.forEach((lead) =>
          addressesToFetch.add(lead.toLowerCase()),
        );
      }

      // Add proposal participants
      if (activeProposal) {
        addressesToFetch.add(activeProposal.proposed_by.toLowerCase());
        activeProposal.current_approvals.forEach((approver) =>
          addressesToFetch.add(approver.toLowerCase()),
        );
      }

      const profileMap = new Map<string, UserProfile>();

      try {
        await Promise.all(
          Array.from(addressesToFetch).map(async (walletAddress) => {
            try {
              const profile =
                await EventService.getUserProfileByWallet(walletAddress);
              if (profile) {
                profileMap.set(walletAddress.toLowerCase(), profile);
              }
            } catch (error) {
              console.warn(
                `Failed to fetch profile for ${walletAddress}:`,
                error,
              );
            }
          }),
        );
        setUserProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching user profiles:', error);
      }
    };

    fetchUserProfiles();
  }, [pod.pod_leads, activeProposal]);

  // Fetch active deletion proposal
  useEffect(() => {
    const fetchActiveProposal = async () => {
      console.log('🔍 Fetching active deletion proposal for pod:', pod.id);

      // FIXED: Check for BOTH pending AND approved proposals
      const { data, error } = await supabase
        .from('pod_deletion_proposals')
        .select('*')
        .eq('pod_id', pod.id)
        .in('status', ['pending', 'approved']) // CRITICAL FIX: Include approved proposals
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() to avoid 406 when no proposals found

      console.log('🔍 Proposal query result:', { data, error });

      if (data && !error) {
        console.log('✅ Found active proposal:', {
          id: data.id,
          status: data.status,
          approvals: data.current_approvals?.length,
          required: data.required_approvals,
        });

        setActiveProposal(data);
        setHasApproved(
          address
            ? data.current_approvals.some(
                (a: string) => a.toLowerCase() === address.toLowerCase(),
              )
            : false,
        );
      } else {
        console.log('🔍 No active proposal found');
        setActiveProposal(null);
        setHasApproved(false);
      }
    };

    fetchActiveProposal();

    // Set up real-time subscription
    const subscription = supabase
      .channel(`pod-deletion-${pod.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pod_deletion_proposals',
          filter: `pod_id=eq.${pod.id}`,
        },
        () => {
          fetchActiveProposal();
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [pod.id, address]);

  // Create deletion proposal
  const createDeletionProposal = async () => {
    console.log(
      '🚀 PodDeletionApprovalFlow: Starting deletion proposal creation:',
      {
        address,
        canPropose,
        pod_id: pod.id,
        pod_name: pod.name,
      },
    );

    if (!address || !canPropose) {
      console.log(
        '❌ Cannot create proposal: Missing address or canPropose=false',
      );
      return;
    }

    setIsLoading(true);
    try {
      // Calculate required approvals (2/3 majority)
      // FOR TESTING: Allow single approval if MIN_POD_LEADERS=1
      const minRequired =
        Number.parseInt(process.env.NEXT_PUBLIC_MIN_POD_LEADERS || '3') === 1
          ? 1
          : 2;
      const requiredApprovals = Math.max(
        minRequired,
        Math.ceil((pod.pod_leads?.length || 0) * 0.66),
      );

      // Create proposal via API route (bypasses RLS auth issue)
      console.log('📝 Creating proposal via API with data:', {
        pod_id: pod.id,
        pod_name: pod.name,
        proposed_by: address.toLowerCase(),
        required_approvals: requiredApprovals,
        current_approvals: [address.toLowerCase()],
        status: 'pending',
        management_hat_id: pod.management_hat_id,
        membership_hat_id: pod.membership_hat_id,
      });

      const response = await fetch('/api/pod-deletion/create-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pod_id: pod.id,
          pod_name: pod.name,
          proposed_by: address.toLowerCase(),
          required_approvals: requiredApprovals,
          current_approvals: [], // NO auto-approval - signature required first
          status: 'pending', // Always starts pending - approval requires signature
          management_hat_id: pod.management_hat_id,
          membership_hat_id: pod.membership_hat_id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ API error creating proposal:', errorData);
        throw new Error(errorData.error || 'Failed to create proposal');
      }

      const { proposal } = await response.json();
      console.log('✅ Proposal created successfully via API:', proposal);

      // 🔧 FIX: Wrap notifications in try-catch to prevent proposal creation failure
      // Notifications are helpful but not critical - proposal should succeed even if notifications fail
      try {
        // Send notifications to other pod leaders
        const otherLeaders =
          pod.pod_leads?.filter(
            (lead) => lead.toLowerCase() !== address.toLowerCase(),
          ) || [];

        for (const leader of otherLeaders) {
          await unifiedNotificationService.createNotification({
            recipient_address: leader,
            sender_address: address,
            notification_type: 'proposal_created',
            title: `Pod Deletion Requested: ${pod.name}`,
            message: `A deletion proposal for pod "${pod.name}" requires your approval. ${requiredApprovals} approvals needed.`,
            context_type: 'governance',
            context_id: proposal.id,
            context_url: `/pods/${pod.id}/manage`,
            proposal_id: proposal.id,
            priority: 'high',
          });
        }

        // Also notify Executive Pod if this is not the Executive Pod itself
        if (pod.name !== 'Executive Pod') {
          const { data: executivePod } = await supabase
            .from('pods')
            .select('pod_leads')
            .eq('name', 'Executive Pod')
            .maybeSingle();

          if (executivePod?.pod_leads) {
            for (const execLead of executivePod.pod_leads) {
              await unifiedNotificationService.createNotification({
                recipient_address: execLead,
                sender_address: address,
                notification_type: 'proposal_created',
                title: `Pod Deletion Alert: ${pod.name}`,
                message: `Pod "${pod.name}" has been proposed for deletion and is awaiting approval from pod leaders.`,
                context_type: 'governance',
                context_id: proposal.id,
                context_url: `/pods/${pod.id}`,
                priority: 'medium',
              });
            }
          }
        }

        console.log('✅ Deletion proposal notifications sent successfully');
      } catch (notificationError) {
        // Log but don't fail the proposal creation if notifications fail
        console.error(
          '⚠️ Failed to send deletion proposal notifications (non-critical):',
          notificationError,
        );
        console.log(
          '✅ Proposal created successfully despite notification failure',
        );
      }

      setActiveProposal(proposal);
      onProposalCreated?.(proposal.id);

      toast({
        title: 'Deletion Proposal Created',
        description: `Proposal created. Click "Approve Deletion" to sign your approval. ${requiredApprovals} approval(s) needed.`,
      });
    } catch (error) {
      console.error('Failed to create deletion proposal:', error);
      toast({
        title: 'Failed to Create Proposal',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Approve deletion proposal with signature
  const approveProposal = async () => {
    if (!address || !activeProposal || hasApproved) return;

    // Check for EVM account
    const evmAccount = currentUser?.evmAccounts?.[0]?.address;
    if (!evmAccount) {
      toast({
        title: 'Account Not Ready',
        description: 'Your EVM account is not available. Please ensure your wallet is connected.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // STEP 1: Request signature for approval
      const message = `Approve deletion of pod: ${pod.name}\nProposal ID: ${activeProposal.id}\nTimestamp: ${new Date().toISOString()}`;

      console.log('🔏 Requesting signature for approval:', message);

      // Request signature from CDP
      const signResult = await signEvmMessage({
        evmAccount: evmAccount as `0x${string}`,
        message,
      });
      const signature = signResult.signature;

      console.log('✅ Signature obtained:', signature.substring(0, 20) + '...');

      // STEP 2: Safely add approval with race condition protection
      console.log('🔄 Adding approval to database with race protection...');

      // Use PostgreSQL array functions to safely append without race conditions
      const { data: updatedProposal, error: updateError } = await supabase
        .rpc('add_pod_deletion_approval', {
          proposal_id: activeProposal.id,
          approver_address: address.toLowerCase(),
        })
        .select()
        .single();

      // Handle RPC errors
      if (updateError) {
        // Check if error is "already approved" - this is not a real error, just sync the state
        const isAlreadyApproved =
          updateError.message?.includes('already approved') ||
          updateError.message?.includes('Address has already approved');

        if (isAlreadyApproved) {
          console.log(
            'ℹ️ User has already approved - syncing state with database',
          );

          // Fetch the latest proposal to sync state
          const { data: latestProposal } = await supabase
            .from('pod_deletion_proposals')
            .select('*')
            .eq('id', activeProposal.id)
            .maybeSingle();

          if (latestProposal) {
            // Update local state to reflect database state
            setActiveProposal(latestProposal);
            setHasApproved(true);

            // Check if proposal is fully approved
            const isFullyApproved = latestProposal.status === 'approved';

            if (isFullyApproved) {
              toast({
                title: 'Already Approved!',
                description:
                  "You've already approved this deletion. A pod leader must execute deletion from the pod card. Redirecting to pods page...",
                duration: 5000,
              });
            } else {
              toast({
                title: 'Already Approved',
                description: `You've already approved this deletion. Waiting for ${latestProposal.required_approvals - latestProposal.current_approvals.length} more approval(s). Redirecting to pods page...`,
                duration: 5000,
              });
            }

            // Redirect to /pods/ after 5 seconds
            setTimeout(() => {
              router.push('/pods');
            }, 5000);

            // Return early - state is now synced
            return;
          }
        }

        // Check if RPC function doesn't exist, use fallback
        if (updateError.message?.includes('function')) {
          console.log(
            '📋 RPC function not found, using manual update with duplicate check',
          );

          // Re-fetch latest data to avoid race conditions
          const { data: latestProposal } = await supabase
            .from('pod_deletion_proposals')
            .select('current_approvals, required_approvals')
            .eq('id', activeProposal.id)
            .maybeSingle();

          if (
            latestProposal?.current_approvals?.includes(address.toLowerCase())
          ) {
            // Same as "already approved" case above
            console.log(
              'ℹ️ User has already approved (detected in fallback) - syncing state',
            );

            const { data: fullProposal } = await supabase
              .from('pod_deletion_proposals')
              .select('*')
              .eq('id', activeProposal.id)
              .maybeSingle();

            if (fullProposal) {
              setActiveProposal(fullProposal);
              setHasApproved(true);

              const isFullyApproved = fullProposal.status === 'approved';

              toast({
                title: isFullyApproved
                  ? 'Already Approved!'
                  : 'Already Approved',
                description: isFullyApproved
                  ? "You've already approved this deletion. A pod leader must execute deletion from the pod card. Redirecting to pods page..."
                  : `You've already approved this deletion. Waiting for ${fullProposal.required_approvals - fullProposal.current_approvals.length} more approval(s). Redirecting to pods page...`,
                duration: 5000,
              });

              // Redirect to /pods/ after 5 seconds
              setTimeout(() => {
                router.push('/pods');
              }, 5000);

              return;
            }
          }

          const updatedApprovals = [
            ...(latestProposal?.current_approvals || []),
            address.toLowerCase(),
          ];
          const isFullyApproved =
            updatedApprovals.length >=
            (latestProposal?.required_approvals ||
              activeProposal.required_approvals);

          const { error: manualUpdateError } = await supabase
            .from('pod_deletion_proposals')
            .update({
              current_approvals: updatedApprovals,
              status: isFullyApproved ? 'approved' : 'pending',
              updated_at: new Date().toISOString(),
            })
            .eq('id', activeProposal.id);

          if (manualUpdateError) throw manualUpdateError;
        } else {
          // Unknown error - throw it
          throw updateError;
        }
      }

      // Fetch the updated proposal to get current state
      const { data: finalProposal } = await supabase
        .from('pod_deletion_proposals')
        .select('*')
        .eq('id', activeProposal.id)
        .maybeSingle();

      if (!finalProposal) {
        throw new Error('Failed to fetch updated proposal');
      }

      const updatedApprovals = finalProposal.current_approvals || [];
      const isFullyApproved =
        updatedApprovals.length >= finalProposal.required_approvals;

      // Send notification to proposer
      await unifiedNotificationService.createNotification({
        recipient_address: activeProposal.proposed_by,
        sender_address: address,
        notification_type: 'proposal_voted',
        title: `Deletion Approval: ${pod.name}`,
        message: `Your deletion proposal received an approval from ${address}. ${updatedApprovals.length}/${activeProposal.required_approvals} approvals.`,
        context_type: 'governance',
        context_id: activeProposal.id,
        context_url: `/pods/${pod.id}/manage`,
        priority: isFullyApproved ? 'urgent' : 'high',
      });

      if (isFullyApproved) {
        // Fetch the updated proposal from database to ensure consistency
        const { data: updatedProposal } = await supabase
          .from('pod_deletion_proposals')
          .select('*')
          .eq('id', activeProposal.id)
          .maybeSingle();

        if (updatedProposal) {
          // Update local state to show approved status immediately
          setActiveProposal(updatedProposal);
          setHasApproved(true);

          console.log('✅ Proposal approved and refreshed:', {
            status: updatedProposal.status,
            approvals: updatedProposal.current_approvals.length,
            required: updatedProposal.required_approvals,
          });
        }

        toast({
          title: 'Quorum Reached!',
          description:
            'When quorum is reached, a pod leader must execute the deletion by clicking the Delete button on the pod card. Redirecting to pods page...',
          duration: 5000,
        });

        // Close the modal
        onDeletionComplete?.();

        // Redirect to /pods/ after 5 seconds
        setTimeout(() => {
          router.push('/pods');
        }, 5000);

        console.log('✅ Proposal approved, redirecting to /pods in 5 seconds');
      } else {
        toast({
          title: 'Approval Recorded',
          description: `Your approval has been recorded. ${activeProposal.required_approvals - updatedApprovals.length} more approval(s) needed. Redirecting to pods page...`,
          duration: 5000,
        });
        setHasApproved(true);

        // Close the modal
        onDeletionComplete?.();

        // Redirect to /pods/ after 5 seconds
        setTimeout(() => {
          router.push('/pods');
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to approve proposal:', error);
      toast({
        title: 'Approval Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare deletion transactions for OnchainKit
  const prepareDeletionTransactions = async () => {
    if (!activeProposal || !address || !pubClient) {
      console.error('❌ Missing required data for preparing transactions');
      return;
    }

    console.log(`🚀 Preparing deletion transactions for OnchainKit...`);
    setIsLoading(true);

    try {
      // Get HAT deactivation transactions from PodDeletionService
      const txConfig =
        await PodDeletionService.prepareHatDeactivationTransactions(
          pod,
          address,
          pubClient || publicClient,
        );

      if (txConfig && txConfig.calls && txConfig.calls.length > 0) {
        console.log(
          `✅ Prepared ${txConfig.calls.length} transaction calls for OnchainKit:`,
          {
            calls: txConfig.calls.map((call) => ({
              contract: call.address,
              function: call.functionName,
              args: call.args,
            })),
          },
        );
        setTransactionCalls(txConfig.calls);
        setShowTransaction(true);
      } else {
        // No HAT deactivation needed, proceed directly to database deletion
        console.log(
          '📋 No HAT deactivation needed (HATs already deactivated or invalid)',
        );
        console.log('📋 Proceeding directly with database cleanup...');

        toast({
          title: 'HATs Already Deactivated',
          description:
            'HATs are already deactivated. Proceeding with database cleanup.',
        });

        await executeDatabaseDeletion();
      }
    } catch (error) {
      console.error('❌ Failed to prepare deletion transactions:', error);

      // Check if this is a known issue that can be bypassed
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const canBypass =
        errorMessage.includes('already deactivated') ||
        errorMessage.includes('already inactive') ||
        errorMessage.includes('invalid hat');

      if (canBypass) {
        console.log(
          '⚠️ HAT deactivation failed but can be bypassed - proceeding with database cleanup',
        );
        toast({
          title: 'Bypassing HAT Deactivation',
          description:
            'HATs appear to be already deactivated. Proceeding with database cleanup.',
        });
        await executeDatabaseDeletion();
      } else {
        toast({
          title: 'Failed to Prepare Deletion',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Execute database deletion after HAT deactivation
  const executeDatabaseDeletion = async () => {
    console.log(`🗑️ Executing database deletion for pod: ${pod.id}`);

    if (!activeProposal || !address || deletionExecuted) {
      if (deletionExecuted) {
        console.log('⚠️ Deletion already executed, skipping duplicate request');
      }
      return;
    }

    try {
      setDeletionExecuted(true);
      setIsLoading(true);

      // Only delete from database (HATs already deactivated via OnchainKit)
      const result = await PodDeletionService.deletePodDatabase(
        pod.id,
        address,
      );
      console.log(`🚀 Database deletion result:`, result);

      if (result.success) {
        // Update proposal status
        await supabase
          .from('pod_deletion_proposals')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
            executed_by: address.toLowerCase(),
            hat_deactivation_tx:
              (result as any).hatDeactivationResults?.managementHat?.transactionHash,
          })
          .eq('id', activeProposal.id);

        // Notify all pod members (if pod_members table exists)
        try {
          const { data: members, error: membersError } = await supabase
            .from('pod_members')
            .select('wallet_address')
            .eq('pod_id', pod.id);

          if (!membersError && members && members.length > 0) {
            console.log(
              `📧 Notifying ${members.length} pod members about deletion...`,
            );
            for (const member of members) {
              await unifiedNotificationService.createNotification({
                recipient_address: member.wallet_address,
                sender_address: 'system',
                notification_type: 'proposal_executed',
                title: `Pod Deleted: ${pod.name}`,
                message: `The pod "${pod.name}" has been permanently deleted following approval from pod leaders.`,
                context_type: 'governance',
                context_id: activeProposal.id,
                priority: 'urgent',
              });
            }
          } else {
            console.log(
              '📋 No pod members to notify or pod_members table not available',
            );
          }
        } catch (notificationError) {
          // Non-critical error - pod is already deleted
          console.log(
            '⚠️ Could not send member notifications (non-critical):',
            notificationError,
          );
        }

        toast({
          title: 'Pod Deleted',
          description: 'Pod has been successfully deleted.',
        });

        // Refresh the pods list to remove deleted pod
        if (typeof window !== 'undefined') {
          window.location.href = '/pods';
        }

        onDeletionComplete?.();
      } else {
        // Update proposal with error
        await supabase
          .from('pod_deletion_proposals')
          .update({
            status: 'failed',
            execution_error: result.error,
          })
          .eq('id', activeProposal.id);

        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to execute deletion:', error);
      toast({
        title: 'Deletion Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      // Reset states on failure so user can retry if needed
      setDeletionExecuted(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!activeProposal) return null;

    const expires = new Date(activeProposal.expires_at);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {activeProposal && (
            <Badge
              variant={
                activeProposal.status === 'pending' ? 'default' : 'secondary'
              }
            >
              {activeProposal.status}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeProposal ? (
          // Active proposal exists
          <div className="space-y-4">
            {/* Proposal Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Proposed by:</span>
                <div className="flex-shrink-0">
                  <MemberCard
                    address={activeProposal.proposed_by}
                    profile={
                      userProfiles.get(
                        activeProposal.proposed_by.toLowerCase(),
                      ) || null
                    }
                    onClickName={(addr) => {
                      // Use the same profile modal pattern as rest of app
                      console.log('Opening profile modal for:', addr);
                    }}
                    className="flex items-center space-x-2 px-2 py-1 bg-muted rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time remaining:</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {getTimeRemaining()}
                </span>
              </div>
            </div>

            {/* Approval Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Approvals</span>
                <span>
                  {activeProposal.current_approvals.length} /{' '}
                  {activeProposal.required_approvals}
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${(activeProposal.current_approvals.length / activeProposal.required_approvals) * 100}%`,
                    backgroundColor: '#3F7A5A',
                  }}
                />
              </div>

              {/* Show who approved */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">
                  Approved by:
                </span>
                <div className="space-y-1">
                  {activeProposal.current_approvals.map((approver) => (
                    <MemberCard
                      key={approver}
                      address={approver}
                      profile={userProfiles.get(approver.toLowerCase()) || null}
                      onClickName={(addr) => {
                        console.log('Opening profile modal for:', addr);
                      }}
                      className="flex items-center space-x-2 px-2 py-1 border rounded-lg bg-[#D1E6DC] border-[#B8D9CA]"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {canPropose &&
              !hasApproved &&
              activeProposal.status === 'pending' && (
                <>
                  <Button
                    onClick={approveProposal}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isLoading ? 'Processing...' : 'Approve Deletion'}
                  </Button>
                </>
              )}

            {hasApproved && (
              <div
                className="p-3 border rounded"
                style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: '#2F5D50' }}
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">
                    You have approved this deletion
                  </span>
                </div>
              </div>
            )}

            {activeProposal.status === 'approved' &&
              (canPropose || hasApproved) &&
              !showTransaction && (
                <Button
                  onClick={prepareDeletionTransactions}
                  disabled={isLoading || !currentUser?.evmSmartAccounts?.[0] || deletionExecuted}
                  variant="destructive"
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isLoading
                    ? 'Preparing...'
                    : deletionExecuted
                      ? 'Deletion in Progress...'
                      : 'Execute Deletion'}
                </Button>
              )}

            {/* CDP Transaction for sponsored HAT deactivation */}
            {showTransaction && transactionCalls.length > 0 && (
              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      setIsLoading(true);

                      // Prepare calls for CDP
                      const calls = transactionCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing HAT deactivation with CDP:', calls);

                      const result = await sendUserOperation({ calls });

                      console.log(
                        '✅ HAT deactivation successful, proceeding with database cleanup',
                        result,
                      );

                      setShowTransaction(false);
                      await executeDatabaseDeletion();
                    } catch (error) {
                      console.error('❌ HAT deactivation failed:', error);
                      toast({
                        title: 'HAT Deactivation Failed',
                        description:
                          error instanceof Error ? error.message : 'Failed to deactivate HATs. Please contact support.',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={txStatus === 'pending' || isLoading}
                  variant="destructive"
                  className="w-full bg-[#8B3A3A] hover:bg-[#5C1F1F]"
                >
                  {txStatus === 'pending' || isLoading ? '⏳ Deactivating HATs...' : 'Deactivate HATs & Delete Pod'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="text-sm text-blue-600 text-center">
                    🔄 Transaction in progress... (Sponsored)
                  </div>
                )}

                {txError && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // No active proposal
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Pod deletion requires approval from{' '}
              {Math.ceil((pod.pod_leads?.length || 0) * 0.66)} of{' '}
              {pod.pod_leads?.length || 0} pod leaders.
            </div>

            {canPropose && (
              <Button
                onClick={createDeletionProposal}
                disabled={isLoading}
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isLoading ? 'Creating Proposal...' : 'Propose Pod Deletion'}
              </Button>
            )}

            {!canPropose && address && (
              <div
                className="p-3 border rounded"
                style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: '#A67E35' }}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">
                    Only pod leaders can propose deletion
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Warning Message */}
        <div
          className="p-3 border rounded"
          style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
        >
          <div className="flex items-start gap-2" style={{ color: '#8B3A3A' }}>
            <p className="font-medium">
              Warning: Pod deletion is permanent. All roles will be deactivated
              and pod data will be removed.
            </p>
          </div>
        </div>

        {/* Debug Component - hidden but available if needed */}
        {process.env.NODE_ENV === 'development' && false && (
          <PodDeletionDebugger pod={pod} />
        )}
      </CardContent>
    </Card>
  );
};

export default PodDeletionApprovalFlow;
