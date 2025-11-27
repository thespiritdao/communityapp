/**
 * BidReviewManager Component (REFACTORED)
 *
 * Simplified bid review manager that uses the new modular components:
 * - BidApprovalFlow for the entire approval workflow
 * - No more monolithic transaction code
 * - Clean separation of concerns
 *
 * This replaces the 1,294-line monolith with a clean, maintainable component.
 *
 * FEATURES:
 * - Bid listing with filtering (pending/approved/rejected)
 * - Bid rejection with reason
 * - Bid approval using BidApprovalFlow
 * - All transaction logic delegated to specialized components
 *
 * @module BidReviewManagerRefactored
 */

'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAccount } from 'wagmi';
import { format } from 'date-fns';
import { useBountySupabase } from '../hooks/useBountySupabase';
import type { FrontendBid, FrontendNotification } from '../types/bounty';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { usePodValidation } from '../hooks/usePodValidation';
import BidApprovalFlow from './BidApprovalFlow';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BidReviewManagerProps {
  onBidStatusChange?: () => void;
  onNotificationSent?: (notification: FrontendNotification) => void;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getTokenSymbol = (tokenType: 'SYSTEM' | 'SELF'): string => {
  return tokenType === 'SYSTEM' ? '$SYSTEM' : '$SELF';
};

const getPaymentOptionLabel = (option: string): string => {
  switch (option) {
    case 'completion':
      return 'Pay on Completion';
    case 'milestones':
      return 'Pay per Milestone';
    case 'split':
      return 'Split Payment';
    default:
      return option;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const BidReviewManager: React.FC<BidReviewManagerProps> = ({
  onBidStatusChange,
  onNotificationSent,
}) => {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<
    'pending' | 'approved' | 'rejected'
  >('pending');
  const [approvalFlowOpen, setApprovalFlowOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedBid, setSelectedBid] = useState<FrontendBid | null>(null);

  const {
    bids,
    bounties,
    loadAllBids,
    loadBounties,
    updateBidStatus,
    createBidReview,
  } = useBountySupabase();
  const { validateMultiplePods } = usePodValidation();

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadAllBids();
    loadBounties();
  }, [loadAllBids, loadBounties]);

  // Validate pod IDs for pending bounties
  useEffect(() => {
    if (activeTab === 'pending' && bounties.length > 0) {
      const podIds = bounties.map((bounty) => bounty.podId).filter(Boolean);
      if (podIds.length > 0) {
        console.log('🔄 Pre-validating pod IDs for pending bounties:', podIds);
        validateMultiplePods(podIds);
      }
    }
  }, [activeTab, bounties, validateMultiplePods]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getBountyTitle = (bountyId: string): string => {
    const bounty = bounties.find((b) => b.id === bountyId);
    return bounty?.title || bountyId;
  };

  const getBountyData = (bountyId: string) => {
    return bounties.find((b) => b.id === bountyId);
  };

  const getTokenSymbolForBid = (bidBountyId: string): string => {
    const bounty = bounties.find((b) => b.id === bidBountyId);
    return bounty ? getTokenSymbol(bounty.value.token) : 'tokens';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleReviewBid = (bid: FrontendBid) => {
    setSelectedBid(bid);
    setApprovalFlowOpen(true);
  };

  const handleRejectBid = async () => {
    if (!selectedBid || !rejectionReason || !address) return;

    try {
      console.log('🔍 Starting bid rejection for bid ID:', selectedBid.id);
      console.log(
        'ℹ️ Note: No funds are in escrow yet - escrow only happens when a bid is APPROVED',
      );

      // Update bid status
      await updateBidStatus(selectedBid.id, 'rejected');
      console.log('✅ Bid status updated successfully');
      onBidStatusChange?.();

      // Create bid review record
      console.log('🔍 Creating bid review for bid ID:', selectedBid.id);
      await createBidReview({
        bidId: selectedBid.id,
        reviewerAddress: address,
        reviewType: 'final',
        status: 'rejected',
        comments: rejectionReason,
      });
      console.log('✅ Bid review created successfully');

      // Send notification
      await unifiedNotificationService.createNotification({
        recipient_address: selectedBid.bidderAddress,
        sender_address: address,
        notification_type: 'bounty_work_reviewed',
        title: 'Bid Update',
        message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" was not selected. Reason: ${rejectionReason}`,
        context_type: 'bounty',
        context_id: selectedBid.bountyId,
        context_url: `/bounty/${selectedBid.bountyId}`,
        priority: 'medium',
      });

      console.log('✅ Bid rejection complete - bidder has been notified');

      alert(
        `✅ Bid rejected successfully!\n\n` +
          `The bidder has been notified with your reason.\n\n` +
          `Note: No funds were in escrow yet - funds only go into escrow when a bid is approved.`,
      );

      setRejectionDialogOpen(false);
      setSelectedBid(null);
      setRejectionReason('');
      await loadAllBids();
    } catch (error) {
      console.error('❌ Error rejecting bid:', error);
      alert(
        `Failed to reject bid: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  const handleApprovalComplete = async () => {
    console.log('✅ Bid approval flow completed successfully');
    setApprovalFlowOpen(false);
    setSelectedBid(null);
    onBidStatusChange?.();
    await loadAllBids();
  };

  const handleApprovalError = (error: Error) => {
    console.error('❌ Bid approval flow failed:', error);
    alert(`Failed to approve bid: ${error.message}`);
  };

  const handleCloseApprovalFlow = () => {
    setApprovalFlowOpen(false);
    setSelectedBid(null);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const filteredBids = bids.filter((bid) => bid.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header with Tab Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <h2 className="text-2xl font-bold">Review Bids</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab('pending')}
            variant={activeTab === 'pending' ? 'default' : 'outline'}
            size="sm"
          >
            Pending
          </Button>
          <Button
            onClick={() => setActiveTab('approved')}
            variant={activeTab === 'approved' ? 'default' : 'outline'}
            size="sm"
          >
            Approved
          </Button>
          <Button
            onClick={() => setActiveTab('rejected')}
            variant={activeTab === 'rejected' ? 'default' : 'outline'}
            size="sm"
          >
            Rejected
          </Button>
        </div>
      </div>

      {/* Bid Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBids.map((bid) => (
          <Card key={bid.id} className="w-full">
            <CardHeader>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">
                    {getBountyTitle(bid.bountyId)}
                  </CardTitle>
                  <p className="text-sm text-gray-600 truncate">
                    {bid.first_name || bid.last_name
                      ? `${bid.first_name || ''} ${bid.last_name || ''}`.trim()
                      : bid.bidderAddress}
                  </p>
                </div>
                {getStatusBadge(bid.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Amount</p>
                  <p>
                    {bid.proposedAmount} {getTokenSymbolForBid(bid.bountyId)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Payment</p>
                  <p>{getPaymentOptionLabel(bid.paymentOption)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Submitted</p>
                  <p>{format(bid.submittedAt, 'MMM dd, yyyy')}</p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => handleReviewBid(bid)}
                    className="flex-1"
                    style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                  >
                    {bid.status === 'pending'
                      ? 'Review & Approve'
                      : 'View Details'}
                  </Button>
                  {bid.status === 'pending' && (
                    <Button
                      onClick={() => {
                        setSelectedBid(bid);
                        setRejectionDialogOpen(true);
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approval Flow */}
      {selectedBid &&
        approvalFlowOpen &&
        (() => {
          const bounty = getBountyData(selectedBid.bountyId);
          if (!bounty) {
            return (
              <Dialog open={true} onOpenChange={handleCloseApprovalFlow}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Error</DialogTitle>
                    <DialogDescription>
                      Unable to load bounty information
                    </DialogDescription>
                  </DialogHeader>
                  <p>Bounty not found. Please refresh and try again.</p>
                </DialogContent>
              </Dialog>
            );
          }

          return (
            <BidApprovalFlow
              bid={selectedBid}
              bounty={{
                id: bounty.id,
                title: bounty.title,
                podId: bounty.podId,
                onchain_id: bounty.onchain_id, // Pass existing on-chain ID if it exists
                value: bounty.value,
              }}
              tokenSymbol={getTokenSymbol(bounty.value.token)}
              open={approvalFlowOpen}
              onClose={handleCloseApprovalFlow}
              onApprovalComplete={handleApprovalComplete}
              onApprovalError={handleApprovalError}
            />
          );
        })()}

      {/* Rejection Dialog */}
      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-xl">
          <DialogHeader>
            <DialogTitle>Reject Bid</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this bid.
            </DialogDescription>
          </DialogHeader>

          {selectedBid && (
            <div className="space-y-6">
              {/* Bid Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">
                  {getBountyTitle(selectedBid.bountyId)}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>
                    Bidder:{' '}
                    {selectedBid.first_name || selectedBid.last_name
                      ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                      : selectedBid.bidderAddress}
                  </p>
                  <p>
                    Amount: {selectedBid.proposedAmount}{' '}
                    {getTokenSymbolForBid(selectedBid.bountyId)}
                  </p>
                </div>
              </div>

              {/* Rejection Reason */}
              <div>
                <Label htmlFor="rejection-reason">Reason for Rejection</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please explain why this bid is being rejected..."
                  rows={4}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => setRejectionDialogOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectBid}
                  disabled={!rejectionReason.trim()}
                  className="flex-1"
                  style={{ backgroundColor: '#ffe8e8', color: '#000' }}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BidReviewManager;
