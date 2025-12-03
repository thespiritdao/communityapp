'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { X, Users, CheckCircle, XCircle, Settings } from 'lucide-react';
import {
  PodMultiManagerGovernance,
  type GovernanceProposal,
} from '../services/podMultiManagerGovernance';
import type { Pod } from '../../events/types/event';

interface GovernanceProposalModalProps {
  pod: Pod;
  proposalType:
    | 'status_change'
    | 'edit_description'
    | 'update_image'
    | 'archive_pod'
    | 'delete_pod';
  isOpen: boolean;
  onClose: () => void;
  onProposalCreated?: () => void;
}

export const GovernanceProposalModal: React.FC<
  GovernanceProposalModalProps
> = ({ pod, proposalType, isOpen, onClose, onProposalCreated }) => {
  const { address } = useAccount();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProposals, setActiveProposals] = useState<GovernanceProposal[]>(
    [],
  );
  const [managers, setManagers] = useState<string[]>([]);
  const [canCreateProposal, setCanCreateProposal] = useState(false);

  useEffect(() => {
    if (isOpen && address) {
      loadData();
    }
  }, [isOpen, address, pod.id]);

  const loadData = async () => {
    if (!address) return;

    // Load managers and check permissions
    const podManagers = await PodMultiManagerGovernance.getPodManagers(pod.id);
    setManagers(podManagers);

    const canManage = await PodMultiManagerGovernance.canManagePod(
      pod.id,
      address,
    );
    setCanCreateProposal(canManage);

    // Load active proposals
    const proposals = await PodMultiManagerGovernance.getActiveProposals(
      pod.id,
    );
    setActiveProposals(proposals);
  };

  const getProposalTitle = () => {
    switch (proposalType) {
      case 'status_change':
        return 'Change Pod Status';
      case 'edit_description':
        return 'Edit Pod Description';
      case 'update_image':
        return 'Update Pod Image';
      case 'archive_pod':
        return 'Archive Pod';
      case 'delete_pod':
        return 'Delete Pod';
      default:
        return 'Governance Proposal';
    }
  };

  const getProposalDescription = () => {
    switch (proposalType) {
      case 'status_change':
        return 'Propose to change the pod status. This requires approval from at least 67% of pod managers.';
      case 'edit_description':
        return 'Propose to update the pod description. This requires approval from at least 67% of pod managers.';
      case 'update_image':
        return 'Propose to update the pod image. This requires approval from at least 67% of pod managers.';
      case 'archive_pod':
        return 'Propose to archive this pod. This is a significant action that requires approval from at least 67% of pod managers.';
      case 'delete_pod':
        return 'Propose to permanently delete this pod. This is an irreversible action that requires approval from at least 67% of pod managers.';
      default:
        return '';
    }
  };

  const renderProposalForm = () => {
    switch (proposalType) {
      case 'status_change':
        return (
          <div className="space-y-4">
            <div>
              <Label>Current Status</Label>
              <Badge className="ml-2">{pod.status || 'inactive'}</Badge>
            </div>
            <div>
              <Label htmlFor="newStatus">New Status</Label>
              <select
                id="newStatus"
                className="w-full p-2 border rounded-md"
                value={formData.newStatus || ''}
                onChange={(e) =>
                  setFormData({ ...formData, newStatus: e.target.value })
                }
              >
                <option value="">Select new status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        );

      case 'edit_description':
        return (
          <div className="space-y-4">
            <div>
              <Label>Current Description</Label>
              <p className="text-sm text-gray-600 p-2 border rounded-md bg-gray-50">
                {pod.description || 'No description'}
              </p>
            </div>
            <div>
              <Label htmlFor="newDescription">New Description</Label>
              <Textarea
                id="newDescription"
                value={formData.newDescription || ''}
                onChange={(e) =>
                  setFormData({ ...formData, newDescription: e.target.value })
                }
                placeholder="Enter new pod description..."
                rows={4}
              />
            </div>
          </div>
        );

      case 'update_image':
        return (
          <div className="space-y-4">
            <div>
              <Label>Current Image</Label>
              <div className="flex items-center gap-3 p-2 border rounded-md">
                <img
                  src={(pod as any).image_url || '/images/symbolobinfin.png'}
                  alt={pod.name}
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <span className="text-sm text-gray-600">Current pod image</span>
              </div>
            </div>
            <div>
              <Label htmlFor="newImageUrl">New Image URL</Label>
              <Input
                id="newImageUrl"
                type="url"
                value={formData.newImageUrl || ''}
                onChange={(e) =>
                  setFormData({ ...formData, newImageUrl: e.target.value })
                }
                placeholder="https://example.com/new-image.jpg"
              />
            </div>
          </div>
        );

      case 'archive_pod':
      case 'delete_pod':
        return (
          <div className="space-y-4">
            <div
              className="p-4 border rounded-lg"
              style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
            >
              <h4 className="font-medium mb-2" style={{ color: '#5C1F1F' }}>
                ⚠️ Warning
              </h4>
              <p className="text-sm" style={{ color: '#8B3A3A' }}>
                {proposalType === 'delete_pod'
                  ? 'This action will permanently delete the pod and cannot be undone.'
                  : 'This action will archive the pod, making it inactive but preserving its data.'}
              </p>
            </div>
            <div>
              <Label htmlFor="reason">
                Reason for{' '}
                {proposalType === 'delete_pod' ? 'deletion' : 'archiving'}
              </Label>
              <Textarea
                id="reason"
                value={formData.reason || ''}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                placeholder="Please provide a reason for this action..."
                rows={3}
                required={true}
              />
            </div>
          </div>
        );

      default:
        return <div>Unknown proposal type</div>;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !canCreateProposal) return;

    setIsSubmitting(true);
    try {
      const result = await PodMultiManagerGovernance.createProposal(
        pod.id,
        proposalType,
        formData,
        address,
      );

      if (result.success) {
        toast({
          title: 'Proposal Created',
          description:
            'Your governance proposal has been submitted for manager approval.',
        });
        onClose();
        onProposalCreated?.();
      } else {
        toast({
          title: 'Failed to Create Proposal',
          description: result.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast({
        title: 'Error',
        description: 'Failed to create proposal. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (proposalId: string, vote: 'approve' | 'reject') => {
    if (!address) return;

    try {
      const result = await PodMultiManagerGovernance.voteOnProposal(
        proposalId,
        address,
        vote,
      );

      if (result.success) {
        toast({
          title: 'Vote Recorded',
          description: `Your ${vote} vote has been recorded.`,
        });
        loadData(); // Refresh data
      } else {
        toast({
          title: 'Failed to Vote',
          description: result.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: 'Error',
        description: 'Failed to record vote. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!isOpen) return null;

  const relevantProposals = activeProposals.filter(
    (p) => p.proposal_type === proposalType,
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-semibold">{getProposalTitle()}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {getProposalDescription()}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Active Proposals */}
          {relevantProposals.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium mb-3">Active Proposals</h3>
              <div className="space-y-3">
                {relevantProposals.map((proposal) => (
                  <Card key={proposal.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline">
                          {proposal.current_approvals.length}/
                          {proposal.required_approvals} approvals
                        </Badge>
                        <div className="flex gap-2">
                          {!proposal.current_approvals.includes(address!) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleVote(proposal.id, 'approve')
                                }
                                style={{
                                  color: '#3F7A5A',
                                  borderColor: '#B8D9CA',
                                }}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleVote(proposal.id, 'reject')
                                }
                                style={{
                                  color: '#8B3A3A',
                                  borderColor: '#D9B3B3',
                                }}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Proposed by {proposal.proposed_by.slice(0, 6)}...
                        {proposal.proposed_by.slice(-4)} • Expires{' '}
                        {new Date(proposal.expires_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Manager Info */}
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium">
                Pod Managers ({managers.length})
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Proposals require approval from at least 67% of active managers to
              execute.
            </p>
          </div>

          {/* Create New Proposal Form */}
          {canCreateProposal ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="font-medium mb-4">Create New Proposal</h3>
                {renderProposalForm()}
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Proposal'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">
                Only pod managers can create governance proposals.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GovernanceProposalModal;
