'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CheckCircle, Clock, Users, User, Shield, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ExecutivePodNotificationService } from '../services/ExecutivePodNotificationService';
import { PodGovernanceService } from '../services/podGovernanceService';

interface PendingPodApproval {
  id: string;
  notification_id: string;
  pod_id: string;
  pod_name: string;
  description: string;
  created_by_address: string;
  pod_leads: string[];
  created_at: string;
  pod_image_url: string;
  parent_pod_name: string;
  notification_created: string;
  notification_read: boolean;
}

export const ExecutivePodApprovalPanel: React.FC = () => {
  const { evmAddress: address } = useEvmAddress();
  const { toast } = useToast();

  const [pendingApprovals, setPendingApprovals] = useState<
    PendingPodApproval[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<PendingPodApproval | null>(
    null,
  );
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isExecutive, setIsExecutive] = useState(false);

  // Check if user is an executive token holder
  useEffect(() => {
    const checkExecutiveStatus = async () => {
      if (!address) {
        setIsExecutive(false);
        return;
      }

      try {
        const executiveHolders =
          await ExecutivePodNotificationService.getExecutivePodHolders();
        setIsExecutive(executiveHolders.includes(address.toLowerCase()));
      } catch (error) {
        console.error('Error checking executive status:', error);
        setIsExecutive(false);
      }
    };

    checkExecutiveStatus();
  }, [address]);

  // Load pending pod approvals
  useEffect(() => {
    const loadPendingApprovals = async () => {
      if (!address || !isExecutive) {
        setPendingApprovals([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const approvals =
          await ExecutivePodNotificationService.getPendingPodApprovals(address);
        setPendingApprovals(approvals);
      } catch (error) {
        console.error('Error loading pending approvals:', error);
        toast({
          title: 'Error Loading Approvals',
          description: 'Failed to load pending pod approvals',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadPendingApprovals();
  }, [address, isExecutive, toast]);

  // Approve pod
  const handleApprove = async (podId: string, notificationId: string) => {
    if (!address) return;

    try {
      setActionLoading(podId);

      await PodGovernanceService.approvePodProposal(podId, address);
      await ExecutivePodNotificationService.markPodApprovalAsRead(
        notificationId,
        address,
      );

      // Remove from pending list
      setPendingApprovals((prev) => prev.filter((p) => p.pod_id !== podId));

      toast({
        title: 'Pod Approved',
        description: 'The pod has been approved and activated successfully',
      });
    } catch (error) {
      console.error('Error approving pod:', error);
      toast({
        title: 'Approval Failed',
        description:
          error instanceof Error ? error.message : 'Failed to approve pod',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Reject pod
  const handleReject = async () => {
    if (!address || !selectedPod) return;

    try {
      setActionLoading(selectedPod.pod_id);

      await PodGovernanceService.rejectPodProposal(
        selectedPod.pod_id,
        address,
        rejectionReason || 'Rejected by executive governance',
      );
      await ExecutivePodNotificationService.markPodApprovalAsRead(
        selectedPod.notification_id,
        address,
      );

      // Remove from pending list
      setPendingApprovals((prev) =>
        prev.filter((p) => p.pod_id !== selectedPod.pod_id),
      );

      toast({
        title: 'Pod Rejected',
        description: 'The pod proposal has been rejected',
      });

      // Reset dialog state
      setShowRejectDialog(false);
      setSelectedPod(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Error rejecting pod:', error);
      toast({
        title: 'Rejection Failed',
        description:
          error instanceof Error ? error.message : 'Failed to reject pod',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Mark notification as read without action
  const markAsRead = async (notificationId: string) => {
    if (!address) return;

    try {
      await ExecutivePodNotificationService.markPodApprovalAsRead(
        notificationId,
        address,
      );
      setPendingApprovals((prev) =>
        prev.map((p) =>
          p.notification_id === notificationId
            ? { ...p, notification_read: true }
            : p,
        ),
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  if (!address) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              Please connect your wallet to access executive governance features
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isExecutive) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              You need executive pod tokens to access pod approval features
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div
            className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
            style={{ borderColor: '#2F5D50', borderTopColor: 'transparent' }}
          ></div>
          <p className="ml-3">Loading pending approvals...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Executive Pod Approvals</h2>
          <p className="text-gray-600">
            Review and approve new pod creation requests
          </p>
        </div>
        <Badge variant={pendingApprovals.length > 0 ? 'default' : 'secondary'}>
          {pendingApprovals.length} Pending
        </Badge>
      </div>

      {pendingApprovals.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <CheckCircle
                className="h-12 w-12 mx-auto mb-4"
                style={{ color: '#3F7A5A' }}
              />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                All Caught Up!
              </h3>
              <p className="text-gray-600">
                No pending pod approval requests at this time.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {pendingApprovals.map((approval) => (
            <Card
              key={approval.pod_id}
              className="border-l-4 border-l-blue-500"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {approval.pod_image_url && (
                      <img
                        src={approval.pod_image_url}
                        alt={approval.pod_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <CardTitle className="text-xl">
                        {approval.pod_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        Requested{' '}
                        {new Date(approval.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="mb-2">
                      {approval.parent_pod_name || 'Root Pod'}
                    </Badge>
                    {!approval.notification_read && (
                      <div>
                        <Badge
                          variant="default"
                          style={{ backgroundColor: '#2F5D50' }}
                        >
                          New
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">{approval.description}</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <User className="h-4 w-4" />
                      Created By
                    </h4>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {approval.created_by_address}
                    </code>
                  </div>
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4" />
                      Pod Leads ({approval.pod_leads.length})
                    </h4>
                    <div className="space-y-1">
                      {approval.pod_leads.map((lead, index) => (
                        <code
                          key={index}
                          className="text-xs bg-gray-100 px-2 py-1 rounded block"
                        >
                          {lead}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => markAsRead(approval.notification_id)}
                    disabled={approval.notification_read}
                    size="sm"
                  >
                    {approval.notification_read ? 'Read' : 'Mark as Read'}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setSelectedPod(approval);
                        setShowRejectDialog(true);
                      }}
                      disabled={actionLoading === approval.pod_id}
                      size="sm"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      onClick={() =>
                        handleApprove(approval.pod_id, approval.notification_id)
                      }
                      disabled={actionLoading === approval.pod_id}
                      size="sm"
                    >
                      {actionLoading === approval.pod_id ? (
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-1" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-1" />
                      )}
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Pod Proposal</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject "{selectedPod?.pod_name}"? Please
              provide a reason for the rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Rejection Reason (Optional)
              </label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this pod proposal is being rejected..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading === selectedPod?.pod_id}
              >
                {actionLoading === selectedPod?.pod_id ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-1" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
