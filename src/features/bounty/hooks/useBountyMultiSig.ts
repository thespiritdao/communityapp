import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { BountyApprovalService } from '../services/BountyApprovalService';
import { useBountySupabase } from './useBountySupabase';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import type { FrontendBounty } from '../types/bounty';

/**
 * Enhanced bounty hook with multi-signature approval integration
 * 
 * Features:
 * - Value-based threshold checking
 * - Automatic approval workflow creation for high-value bounties
 * - Seamless integration with existing bounty creation
 */

export const useBountyMultiSig = () => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const {
    bounties,
    bids,
    loading,
    error,
    loadBounties,
    loadAllBids,
    createBounty: createBountySupabase,
    submitBid,
    updateBidStatus,
    createBidReview,
    createNotification,
    clearError
  } = useBountySupabase();

  const [approvalWorkflowId, setApprovalWorkflowId] = useState<string | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  /**
   * Enhanced bounty creation with multi-signature support
   */
  const createBountyWithApproval = useCallback(async (
    bountyData: Omit<FrontendBounty, 'id' | 'createdAt' | 'onchain_id' | 'status'>
  ): Promise<{ bounty?: FrontendBounty; workflowId?: string; requiresApproval: boolean }> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    try {
      // Extract value for threshold checking
      const valueUSD = bountyData.value.amount; // Assuming this is in USD
      
      // Check if multi-signature approval is required
      const { required, signatures } = BountyApprovalService.requiresApproval(
        'creation',
        valueUSD
      );

      console.log(`🎯 Bounty creation analysis:`, {
        value: `$${valueUSD}`,
        requiresApproval: required,
        requiredSignatures: signatures
      });

      if (required) {
        // High-value bounty - requires approval workflow
        console.log('🔐 Creating approval workflow for high-value bounty');
        
        let draftBounty: FrontendBounty | null = null;
        
        try {
          // First create the bounty in draft status
          draftBounty = await createBountySupabase({
            ...bountyData,
            status: 'draft' // Mark as draft until approved
          });

          // Create approval workflow - if this fails, we need to rollback
          const workflow = await BountyApprovalService.createApprovalWorkflow(
            draftBounty.id, // Pass as-is, service will handle UUID conversion
            'creation',
            valueUSD,
            {
              bountyData,
              title: bountyData.title,
              description: bountyData.description,
              value: bountyData.value
            },
            address
          );

          setApprovalWorkflowId(workflow.id);
          setRequiresApproval(true);

          toast({
            title: "Approval Required",
            description: `This bounty ($${valueUSD}) requires ${signatures} approvals from bounty managers. An approval workflow has been created.`,
          });

          return {
            bounty: draftBounty,
            workflowId: workflow.id,
            requiresApproval: true
          };
        } catch (workflowError) {
          // If workflow creation failed but bounty was created, delete the orphaned bounty
          if (draftBounty?.id) {
            console.error('🔄 Workflow creation failed, rolling back bounty creation...');
            try {
              // Use supabase directly to delete the orphaned bounty
              const { error: deleteError } = await supabase
                .from('bounties')
                .delete()
                .eq('id', draftBounty.id);
              
              if (deleteError) {
                console.error('❌ Failed to rollback bounty creation:', deleteError);
              } else {
                console.log('✅ Successfully rolled back orphaned bounty');
              }
            } catch (rollbackError) {
              console.error('❌ Rollback failed:', rollbackError);
            }
          }
          
          // Re-throw the original workflow error
          throw workflowError;
        }
      } else {
        // Low-value bounty - create directly
        console.log('✅ Creating bounty directly (below threshold)');
        const bounty = await createBountySupabase(bountyData);
        
        toast({
          title: "Bounty Created",
          description: "Your bounty has been created and is now live.",
        });

        return {
          bounty,
          requiresApproval: false
        };
      }
    } catch (error) {
      console.error('Failed to create bounty with approval:', error);
      throw error;
    }
  }, [address, createBountySupabase, toast]);

  /**
   * Approve bounty creation workflow
   */
  const approveBountyCreation = useCallback(async (workflowId: string) => {
    if (!address || !walletClient) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await BountyApprovalService.approveWorkflow(
        workflowId,
        address,
        walletClient
      );

      if (result.success && result.approved) {
        // Workflow is fully approved
        toast({
          title: "Bounty Approved",
          description: "The bounty creation has been fully approved and is now active.",
        });
        
        // Refresh bounties to show updated status
        await loadBounties();
      }

      return result;
    } catch (error) {
      console.error('Failed to approve bounty creation:', error);
      throw error;
    }
  }, [address, walletClient, toast, loadBounties]);

  /**
   * Execute approved bounty creation on-chain
   */
  const executeApprovedBounty = useCallback(async (workflowId: string) => {
    if (!address || !walletClient || !publicClient) {
      throw new Error('Wallet or public client not available');
    }

    try {
      const result = await BountyApprovalService.executeApprovedWorkflow(
        workflowId,
        address,
        publicClient,
        walletClient
      );

      if (result.success) {
        toast({
          title: "Bounty Executed",
          description: "The approved bounty has been deployed on-chain.",
        });
        
        // Refresh bounties to show final status
        await loadBounties();
      }

      return result;
    } catch (error) {
      console.error('Failed to execute approved bounty:', error);
      throw error;
    }
  }, [address, walletClient, publicClient, toast, loadBounties]);

  /**
   * Check if a value requires multi-signature approval
   */
  const checkApprovalRequirement = useCallback((valueUSD: string) => {
    return BountyApprovalService.requiresApproval('creation', valueUSD);
  }, []);

  /**
   * Get active approval workflows for a bounty
   */
  const getApprovalWorkflows = useCallback(async (bountyId: number) => {
    return BountyApprovalService.getActiveWorkflows(bountyId);
  }, []);

  /**
   * Check if user can approve a workflow
   */
  const canUserApprove = useCallback(async (workflowId: string) => {
    if (!address) return false;
    return BountyApprovalService.canUserApprove(workflowId, address);
  }, [address]);

  return {
    // Original bounty functionality
    bounties,
    bids,
    loading,
    error,
    loadBounties,
    loadAllBids,
    submitBid,
    updateBidStatus,
    createBidReview,
    createNotification,
    clearError,

    // Enhanced multi-signature functionality
    createBountyWithApproval,
    approveBountyCreation,
    executeApprovedBounty,
    checkApprovalRequirement,
    getApprovalWorkflows,
    canUserApprove,

    // Multi-sig state
    approvalWorkflowId,
    requiresApproval,
    clearApprovalState: () => {
      setApprovalWorkflowId(null);
      setRequiresApproval(false);
    }
  };
};