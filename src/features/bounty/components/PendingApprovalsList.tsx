import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, DollarSign, AlertCircle } from 'lucide-react';
import {
  BountyApprovalService,
  type BountyApprovalWorkflow,
} from '../services/BountyApprovalService';
import { BountyApprovalFlow } from './BountyApprovalFlow';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import type { FrontendBounty } from '../types/bounty';
import { MemberCard } from '@/features/pods/components/MembersPanel/MemberCard';
import { EventService } from '@/features/events/lib/supabase';
import type { UserProfile } from '@/features/identity/types';

interface PendingApprovalsListProps {
  bounties: FrontendBounty[];
  onApprovalComplete?: (workflowId: string) => void;
}

interface BountyWithWorkflow {
  bounty: FrontendBounty;
  workflow: BountyApprovalWorkflow;
}

export const PendingApprovalsList: React.FC<PendingApprovalsListProps> = ({
  bounties,
  onApprovalComplete,
}) => {
  const { address } = useAccount();
  const { toast } = useToast();

  const [pendingApprovals, setPendingApprovals] = useState<
    BountyWithWorkflow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(
    new Map(),
  );

  // Memoize draft bounties to prevent unnecessary re-renders
  const draftBounties = useMemo(() => {
    return bounties.filter((b) => b.status === 'draft');
  }, [bounties]);

  // Track previous draft bounty IDs to prevent duplicate loads
  const prevDraftIds = React.useRef<string>('');

  // Load all pending approval workflows
  useEffect(() => {
    const loadPendingApprovals = async () => {
      if (!address) {
        setPendingApprovals([]);
        setLoading(false);
        return;
      }

      // Check if draft bounties have actually changed
      const currentDraftIds = draftBounties
        .map((b) => b.id)
        .sort()
        .join(',');
      if (
        prevDraftIds.current === currentDraftIds &&
        pendingApprovals.length > 0
      ) {
        console.log('⚡ Draft bounties unchanged, skipping reload');
        setLoading(false); // Ensure loading is reset
        return;
      }
      prevDraftIds.current = currentDraftIds;

      // Prevent concurrent loads
      if (isLoadingWorkflows) {
        console.log('⏳ Already loading workflows, skipping...');
        return;
      }

      try {
        setIsLoadingWorkflows(true);
        setLoading(true);

        console.log(`📋 Found ${draftBounties.length} draft bounties`);

        if (draftBounties.length === 0) {
          setPendingApprovals([]);
          setLoading(false);
          setIsLoadingWorkflows(false);
          return;
        }

        // Get workflows for each draft bounty
        const bountiesWithWorkflows: BountyWithWorkflow[] = [];

        for (const bounty of draftBounties) {
          if (bounty.id && bounty.id.trim() !== '') {
            try {
              console.log(`🔍 Loading workflow for bounty ID: ${bounty.id}`);
              const workflows = await BountyApprovalService.getActiveWorkflows(
                bounty.id,
              );
              if (workflows.length > 0) {
                bountiesWithWorkflows.push({
                  bounty,
                  workflow: workflows[0], // Take the first active workflow
                });
                console.log(`✅ Found workflow for bounty ${bounty.id}`);
              } else {
                console.log(`⚠️ No workflows found for bounty ${bounty.id}`);
              }
            } catch (error) {
              console.error(
                `❌ Error loading workflow for bounty ${bounty.id}:`,
                error,
              );
            }
          } else {
            console.warn(`⚠️ Skipping bounty with invalid ID:`, bounty);
          }
        }

        console.log(
          `📊 Final result: ${bountiesWithWorkflows.length} bounties with workflows`,
        );
        setPendingApprovals(bountiesWithWorkflows);
      } catch (error) {
        console.error('Error loading pending approvals:', error);
        setPendingApprovals([]); // Set empty array on error
        toast({
          title: 'Error Loading Approvals',
          description: 'Failed to load pending approval workflows',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setIsLoadingWorkflows(false);
      }
    };

    // Add a small delay to prevent rapid re-renders
    const timeoutId = setTimeout(() => {
      loadPendingApprovals();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [draftBounties, address]); // Remove toast from dependencies to prevent loops

  // Load user profiles for all approvers and proposers
  useEffect(() => {
    const loadUserProfiles = async () => {
      const allAddresses = new Set<string>();

      pendingApprovals.forEach(({ workflow }) => {
        allAddresses.add(workflow.proposed_by);
        workflow.current_approvals.forEach((addr) => allAddresses.add(addr));
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

    if (pendingApprovals.length > 0) {
      loadUserProfiles();
    }
  }, [pendingApprovals]);

  const handleApprovalComplete = (workflowId: string) => {
    // Refresh the list
    setPendingApprovals((prev) =>
      prev.filter((item) => item.workflow.id !== workflowId),
    );
    setSelectedWorkflow(null);

    toast({
      title: 'Approval Complete',
      description: 'Bounty has been approved and is now active',
    });

    onApprovalComplete?.(workflowId);
  };

  const getStatusClassName = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-[#FAF4EC] text-[#8F6B2F]';
      case 'approved':
        return 'bg-[#D1E6DC] text-[#1F453A]';
      case 'executed':
        return 'bg-[#E8F1EE] text-[#1F453A]';
      case 'expired':
        return 'bg-[#F5E6E6] text-[#5C1F1F]';
      default:
        return 'bg-[#F3F4F6] text-[#374151]';
    }
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h remaining`;
    return `${diffHours}h remaining`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div
          className="animate-spin rounded-full h-8 w-8"
          style={{
            borderBottomWidth: '2px',
            borderBottomStyle: 'solid',
            borderBottomColor: '#C6933F',
          }}
        ></div>
        <span className="ml-2 text-gray-600">Loading pending approvals...</span>
      </div>
    );
  }

  if (pendingApprovals.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No pending approval workflows</p>
        <p className="text-sm text-gray-500 mt-1">
          High-value bounties requiring approval will appear here
        </p>
      </div>
    );
  }

  // If a specific workflow is selected, show the approval flow
  if (selectedWorkflow) {
    const selected = pendingApprovals.find(
      (item) => item.workflow.id === selectedWorkflow,
    );
    if (selected) {
      return (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setSelectedWorkflow(null)}
            className="mb-4"
          >
            ← Back to Pending Approvals
          </Button>

          <BountyApprovalFlow
            bountyId={selected.bounty.id}
            bountyTitle={selected.bounty.title}
            bountyValue={`$${selected.bounty.value.amount}`}
            onApprovalComplete={handleApprovalComplete}
          />
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5" style={{ color: '#C6933F' }} />
        <h3 className="text-lg font-semibold">Approvals Pending</h3>
        <Badge variant="secondary">{pendingApprovals.length}</Badge>
      </div>

      {pendingApprovals.map(({ bounty, workflow }) => (
        <Card
          key={workflow.id}
          style={{
            backgroundColor: '#FAF4EC',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#E8D7B8',
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg" style={{ color: '#8F6B2F' }}>
                  {bounty.title}
                </CardTitle>
                <p className="text-sm mt-1" style={{ color: '#A67E35' }}>
                  {bounty.description}
                </p>
              </div>
              <Badge className={getStatusClassName(workflow.status)}>
                {workflow.status}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" style={{ color: '#C6933F' }} />
                <span className="text-sm">
                  <strong>{workflow.threshold_value}</strong> (
                  {bounty.value.token})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: '#C6933F' }} />
                <span className="text-sm">
                  <strong>
                    {workflow.current_approvals.length}/
                    {workflow.required_approvals}
                  </strong>{' '}
                  approvals
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: '#C6933F' }} />
                <span className="text-sm">
                  {formatTimeRemaining(workflow.expires_at)}
                </span>
              </div>
            </div>

            {workflow.current_approvals.length > 0 && (
              <div className="mb-4">
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: '#8F6B2F' }}
                >
                  Approved by ({workflow.current_approvals.length}):
                </p>
                <div className="space-y-2">
                  {workflow.current_approvals.map((approverAddress, index) => (
                    <MemberCard
                      key={approverAddress}
                      address={approverAddress}
                      profile={userProfiles.get(approverAddress) || null}
                      showRole={false}
                      size="sm"
                      className="bg-white/50 p-2 rounded-md"
                      style={{
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: '#E8D7B8',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => setSelectedWorkflow(workflow.id)}
                style={{ backgroundColor: '#C6933F', color: '#FFFFFF' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#A67E35';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#C6933F';
                }}
              >
                Review & Approve
              </Button>

              {workflow.status === 'approved' && (
                <Button variant="outline">Execute Creation</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
