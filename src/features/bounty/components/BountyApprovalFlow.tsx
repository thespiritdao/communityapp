'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  AlertTriangle, 
  CheckCircle, 
  Users,
  Clock,
  UserCheck,
  DollarSign,
} from 'lucide-react';
import { BountyApprovalService, type BountyApprovalWorkflow } from '../services/BountyApprovalService';
import { supabase } from '@/utils/supabaseClient';
import { MemberCard } from '@/features/pods/components/MembersPanel/MemberCard';
import { EventService } from '@/features/events/lib/supabase';
import type { UserProfile } from '@/features/identity/types';

interface BountyApprovalFlowProps {
  bountyId: string | number;
  bountyTitle: string;
  bountyValue: string; // "$1000"
  onApprovalComplete?: (workflowId: string) => void;
}

export const BountyApprovalFlow: React.FC<BountyApprovalFlowProps> = ({
  bountyId,
  bountyTitle,
  bountyValue,
  onApprovalComplete
}) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [activeWorkflows, setActiveWorkflows] = useState<BountyApprovalWorkflow[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [canApprove, setCanApprove] = useState<Map<string, boolean>>(new Map());

  // Fetch active workflows for this bounty
  useEffect(() => {
    const fetchWorkflows = async () => {
      // Validate bountyId to prevent NaN issues
      if (!bountyId || bountyId === 0 || bountyId === '' || (typeof bountyId === 'number' && isNaN(bountyId))) {
        console.warn('⚠️ Invalid bountyId provided to BountyApprovalFlow:', bountyId);
        setActiveWorkflows([]);
        return;
      }
      
      console.log('🔍 Fetching approval workflows for bounty:', bountyId);
      
      const workflows = await BountyApprovalService.getActiveWorkflows(bountyId);
      setActiveWorkflows(workflows);
      
      console.log('✅ Found workflows:', workflows.length);
      
      // Check approval permissions for each workflow
      if (address) {
        const permissions = new Map<string, boolean>();
        for (const workflow of workflows) {
          const canUserApprove = await BountyApprovalService.canUserApprove(workflow.id, address);
          permissions.set(workflow.id, canUserApprove);
        }
        setCanApprove(permissions);
      }
    };

    fetchWorkflows();
    
    // Set up real-time subscription for workflow updates (only if valid bountyId)
    let subscription: any;
    if (bountyId && bountyId !== 0 && bountyId !== '' && !(typeof bountyId === 'number' && isNaN(bountyId))) {
      subscription = supabase
        .channel(`bounty-approvals-${bountyId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'bounty_approval_workflows',
          filter: `bounty_id=eq.${bountyId}`
        }, (payload) => {
          console.log('🔄 Bounty workflow updated:', payload);
          fetchWorkflows(); // Refresh workflows
        })
        .subscribe();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [bountyId, address]);

  // Load user profiles for approvers
  useEffect(() => {
    const loadUserProfiles = async () => {
      const allAddresses = new Set<string>();
      
      activeWorkflows.forEach(workflow => {
        allAddresses.add(workflow.proposed_by);
        workflow.current_approvals.forEach(addr => allAddresses.add(addr));
      });

      const profiles = new Map<string, UserProfile>();
      
      for (const address of allAddresses) {
        try {
          const profile = await EventService.getUserProfileByWallet(address);
          if (profile) {
            profiles.set(address, profile);
          }
        } catch (error) {
          console.error(`Failed to load profile for ${address}:`, error);
        }
      }
      
      setUserProfiles(profiles);
    };

    if (activeWorkflows.length > 0) {
      loadUserProfiles();
    }
  }, [activeWorkflows]);

  // Approve a workflow with signature
  const approveWorkflow = async (workflow: BountyApprovalWorkflow) => {
    if (!address || !walletClient) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to approve this workflow.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`🔏 Approving bounty workflow: ${workflow.id}`);
      
      const result = await BountyApprovalService.approveWorkflow(
        workflow.id,
        address,
        walletClient
      );

      if (result.success) {
        if (result.approved) {
          toast({
            title: "Workflow Fully Approved!",
            description: `The ${workflow.approval_type} workflow for bounty "${bountyTitle}" is now approved and ready for execution.`,
          });
          onApprovalComplete?.(workflow.id);
        } else {
          toast({
            title: "Approval Recorded",
            description: `Your approval has been recorded. ${workflow.current_approvals.length + 1}/${workflow.required_approvals} approvals received.`,
          });
        }
      } else {
        throw new Error(result.error || 'Failed to approve workflow');
      }
    } catch (error) {
      console.error('Failed to approve workflow:', error);
      toast({
        title: "Approval Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (activeWorkflows.length === 0) {
    return (
      <Card className="border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-blue-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm">No approval workflows required for this bounty.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map((workflow) => (
        <Card key={workflow.id} className="border-orange-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-orange-500" />
                {workflow.approval_type.charAt(0).toUpperCase() + workflow.approval_type.slice(1)} Approval Required
              </CardTitle>
              <Badge variant={workflow.status === 'approved' ? 'default' : 'secondary'}>
                {workflow.status}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Workflow Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-orange-600" />
                <div>
                  <div className="text-xs text-gray-600">Value</div>
                  <div className="font-medium">{workflow.threshold_value}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-600" />
                <div>
                  <div className="text-xs text-gray-600">Approvals</div>
                  <div className="font-medium">
                    {workflow.current_approvals.length}/{workflow.required_approvals}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <div>
                  <div className="text-xs text-gray-600">Expires</div>
                  <div className="font-medium text-xs">
                    {new Date(workflow.expires_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Proposed by */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Proposed by:</div>
              <MemberCard
                address={workflow.proposed_by}
                profile={userProfiles.get(workflow.proposed_by)}
                showRole={false}
                size="sm"
              />
            </div>

            {/* Current Approvals */}
            {workflow.current_approvals.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Current Approvals ({workflow.current_approvals.length})
                </div>
                <div className="space-y-2">
                  {workflow.current_approvals.map((approverAddress) => (
                    <MemberCard
                      key={approverAddress}
                      address={approverAddress}
                      profile={userProfiles.get(approverAddress)}
                      showRole={false}
                      size="sm"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {workflow.status === 'pending' && canApprove.get(workflow.id) && (
              <Button
                onClick={() => approveWorkflow(workflow)}
                disabled={isLoading}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isLoading ? 'Processing...' : 'Approve with Signature'}
              </Button>
            )}

            {workflow.status === 'approved' && (
              <div className="p-3 rounded" style={{ backgroundColor: '#D1E6DC', border: '1px solid #B8D9CA' }}>
                <div className="flex items-center gap-2" style={{ color: '#1F453A' }}>
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Workflow fully approved - ready for execution
                  </span>
                </div>
              </div>
            )}

            {!canApprove.get(workflow.id) && workflow.status === 'pending' && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                <div className="flex items-center gap-2 text-gray-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">
                    You are not authorized to approve this workflow or have already approved.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Warning Message */}
      <div className="p-3 bg-orange-50 border border-orange-200 rounded">
        <div className="flex items-start gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Multi-Signature Required</p>
            <p className="text-xs mt-1">
              High-value bounty operations require consensus from multiple managers for security.
              All approvals are cryptographically signed for audit trail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BountyApprovalFlow;