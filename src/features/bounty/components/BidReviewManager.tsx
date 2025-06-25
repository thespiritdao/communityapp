"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '../../../contracts/BountyManager.json';
import { format, parseISO, isValid } from 'date-fns';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Calendar, 
  DollarSign, 
  User,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useBountySupabase } from '../hooks/useBountySupabase';
import { type FrontendBid, type FrontendBounty, type FrontendNotification } from '../types/bounty';
import UserTagging from '../../../components/UserTagging';
import { isAddress } from 'viem';
import { Transaction, TransactionButton } from '@coinbase/onchainkit/transaction';

const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

interface BidReviewManagerProps {
  onBidStatusChange?: () => void;
  onNotificationSent?: (notification: FrontendNotification) => void;
}

export const BidReviewManager: React.FC<BidReviewManagerProps> = ({ 
  onBidStatusChange,
  onNotificationSent
}) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedBid, setSelectedBid] = useState<FrontendBid | null>(null);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const { bids, bounties, loadAllBids, updateBidStatus, createBidReview } = useBountySupabase();

  useEffect(() => {
    loadAllBids();
  }, [loadAllBids]);

  const getBountyTitle = (bountyId: string) => {
    const bounty = bounties.find(b => b.id === bountyId);
    return bounty?.title || bountyId;
  };

  const extractAddress = (mention: string | undefined): `0x${string}` | null => {
    if (!mention) return null;
    const match = mention.match(/@\[.*?\]\((0x[a-fA-F0-9]{40})\)/);
    const address = match ? match[1] : mention;
    return isAddress(address) ? address as `0x${string}` : null;
  };

  const handleReviewBid = (bid: FrontendBid) => {
    setSelectedBid(bid);
    setReviewDialogOpen(true);
  };

  const handleRejectBid = async () => {
    if (!selectedBid || !rejectionReason) return;
    try {
      console.log('🔍 Starting bid rejection for bid ID:', selectedBid.id);
      
      // Update bid status
      await updateBidStatus(selectedBid.id, 'rejected');
      console.log('✅ Bid status updated successfully');
      onBidStatusChange?.();
      
      // Create bid review record
      console.log('🔍 Creating bid review for bid ID:', selectedBid.id);
      await createBidReview({
        bidId: selectedBid.id,
        reviewerAddress: address!,
        reviewType: 'final',
        status: 'rejected',
        comments: rejectionReason
      });
      console.log('✅ Bid review created successfully');

      // Send notification
      onNotificationSent?.({
        id: '',
        recipientAddress: selectedBid.bidderAddress,
        bountyId: selectedBid.bountyId,
        bidId: selectedBid.id,
        notificationType: 'bid_rejected',
        title: 'Bid Update',
        message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" was not selected. Reason: ${rejectionReason}`,
        isRead: false,
        createdAt: new Date()
      });

      setRejectionDialogOpen(false);
      setSelectedBid(null);
      setRejectionReason('');
      await loadAllBids();
    } catch (error) {
      console.error('❌ Error rejecting bid:', error);
    }
  };

  const handleApproveBid = async () => {
    if (!selectedBid || selectedReviewers.length < 2) return;

    const techReviewerAddress = extractAddress(selectedReviewers[0]);
    const finalApproverAddress = extractAddress(selectedReviewers[1]);

    if (!techReviewerAddress || !finalApproverAddress) {
      console.error('Invalid reviewer or approver address');
      console.log('Selected reviewers:', selectedReviewers);
      // TODO: Show an error to the user
      return;
    }

    // Update status in Supabase
    await updateBidStatus(selectedBid.id, 'approved', techReviewerAddress, finalApproverAddress);
    onBidStatusChange?.();

    // Send notifications
    onNotificationSent?.({
      id: '',
      recipientAddress: selectedBid.bidderAddress,
      bountyId: selectedBid.bountyId,
      bidId: selectedBid.id,
      notificationType: 'bid_approved',
      title: 'Bid Approved!',
      message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" has been approved.`,
      isRead: false,
      createdAt: new Date()
    });

    onNotificationSent?.({
      id: '',
      recipientAddress: techReviewerAddress,
      bountyId: selectedBid.bountyId,
      bidId: selectedBid.id,
      notificationType: 'review_requested',
      title: 'Review Assignment',
      message: `You have been assigned as Technical Reviewer for "${getBountyTitle(selectedBid.bountyId)}".`,
      isRead: false,
      createdAt: new Date()
    });
    
    onNotificationSent?.({
      id: '',
      recipientAddress: finalApproverAddress,
      bountyId: selectedBid.bountyId,
      bidId: selectedBid.id,
      notificationType: 'review_requested',
      title: 'Review Assignment',
      message: `You have been assigned as Final Approver for "${getBountyTitle(selectedBid.bountyId)}".`,
      isRead: false,
      createdAt: new Date()
    });

    setReviewDialogOpen(false);
    setSelectedBid(null);
    setSelectedReviewers([]);
    await loadAllBids();
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

  const getPaymentOptionLabel = (option: string) => {
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

  const filteredBids = bids.filter(bid => bid.status === activeTab);

  // Debug logging to see what's happening with bid statuses
  useEffect(() => {
    console.log('🔍 BidReviewManager Debug:');
    console.log('All bids:', bids);
    console.log('Active tab:', activeTab);
    console.log('Filtered bids:', filteredBids);
    console.log('Bid statuses:', bids.map(bid => ({ id: bid.id, status: bid.status, bountyId: bid.bountyId })));
  }, [bids, activeTab, filteredBids]);

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBids.map((bid) => (
          <Card key={bid.id} className="w-full">
            <CardHeader>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{getBountyTitle(bid.bountyId)}</CardTitle>
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
                  <p>{bid.proposedAmount} tokens</p>
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
                    style={{ backgroundColor: '#e8fcff', color: '#000' }}
                  >
                    View Details
                  </Button>
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
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review & Approve Bid</DialogTitle>
            <DialogDescription>
              Review the bid details and assign reviewers before approval.
            </DialogDescription>
          </DialogHeader>
          
          {selectedBid ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
              {/* Bid Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">{getBountyTitle(selectedBid.bountyId)}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>Bidder: {selectedBid.first_name || selectedBid.last_name
                    ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                    : selectedBid.bidderAddress}</p>
                  <p>Amount: {selectedBid.proposedAmount} tokens</p>
                  <p>Payment: {getPaymentOptionLabel(selectedBid.paymentOption)}</p>
                  <p>Submitted: {format(selectedBid.submittedAt, 'MMM dd, yyyy')}</p>
                </div>
              </div>

              {/* Experience */}
              <div>
                <h4 className="font-medium mb-2">Relevant Experience</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.experience}</p>
                </div>
              </div>

              {/* Plan of Action */}
              <div>
                <h4 className="font-medium mb-2">Plan of Action</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.planOfAction}</p>
                </div>
              </div>

              {/* Deliverables */}
              <div>
                <h4 className="font-medium mb-2">Deliverables</h4>
                <div className="space-y-2">
                  {Array.isArray(selectedBid.deliverables) && selectedBid.deliverables.length > 0 ? (
                    selectedBid.deliverables.map((deliverable, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-grow">
                            <p className="text-gray-700">{deliverable.description}</p>
                            <div className="text-sm text-gray-600">
                              <p>Due: {(() => {
                                let dateObj = typeof deliverable.due_date === 'string'
                                  ? parseISO(deliverable.due_date)
                                  : deliverable.due_date;
                                return isValid(dateObj) ? format(dateObj, 'MMM dd, yyyy') : 'Invalid date';
                              })()}</p>
                              <p>Amount: {deliverable.payment_amount} tokens</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500 italic">No deliverables specified</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-medium mb-2">Timeline</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.timeline}</p>
                </div>
              </div>

              {/* Reviewer Assignment */}
              <div className="space-y-4">
                <div>
                  <Label>Technical Reviewer</Label>
                  <UserTagging
                    value={selectedReviewers[0] || ''}
                    onChange={(value) => setSelectedReviewers([value, selectedReviewers[1]])}
                    placeholder="Type @ to mention a reviewer..."
                  />
                </div>
                <div>
                  <Label>Final Approver</Label>
                  <UserTagging
                    value={selectedReviewers[1] || ''}
                    onChange={(value) => setSelectedReviewers([selectedReviewers[0], value])}
                    placeholder="Type @ to mention an approver..."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setReviewDialogOpen(false)} variant="outline">
                  Cancel
                </Button>
                {selectedBid && selectedReviewers.length >= 2 && (() => {
                  const techReviewerAddress = extractAddress(selectedReviewers[0]);
                  const finalApproverAddress = extractAddress(selectedReviewers[1]);
                  
                  // Only show Transaction if both addresses are valid
                  if (techReviewerAddress && finalApproverAddress) {
                    return (
                      <Transaction
                        isSponsored={true}
                        address={address?.toLowerCase() as `0x${string}`}
                        chainId={BASE_CHAIN_ID}
                        calls={[{
                          address: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
                          abi: BountyManagerABI,
                          functionName: 'assignBounty',
                          args: [
                            parseInt(selectedBid.bountyId),
                            selectedBid.bidderAddress.toLowerCase() as `0x${string}`,
                            techReviewerAddress.toLowerCase() as `0x${string}`,
                            finalApproverAddress.toLowerCase() as `0x${string}`,
                          ],
                        }]}
                        onSuccess={async (receipt) => {
                          console.log('✅ Bounty assigned successfully:', receipt);
                          await handleApproveBid();
                        }}
                        onError={(error) => {
                          console.error('❌ Failed to assign bounty:', error);
                          console.log('🔍 Debug Info:');
                          console.log('Bounty ID:', selectedBid.bountyId);
                          console.log('Bidder address:', selectedBid.bidderAddress);
                          console.log('Tech reviewer:', selectedReviewers[0]);
                          console.log('Final approver:', selectedReviewers[1]);
                        }}
                        onTransactionStarted={() => {
                          console.log('🚀 Assigning bounty...');
                          console.log('🔍 Debug Info:');
                          console.log('Bounty ID:', selectedBid.bountyId);
                          console.log('Bidder address:', selectedBid.bidderAddress);
                          console.log('Tech reviewer:', selectedReviewers[0]);
                          console.log('Final approver:', selectedReviewers[1]);
                        }}
                      >
                        <TransactionButton
                          text="Approve & Assign"
                          className="flex-1"
                          style={{ backgroundColor: '#e8fcff', color: '#000' }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve & Assign
                        </TransactionButton>
                      </Transaction>
                    );
                  }
                  
                  // Show disabled button if addresses are invalid
                  return (
                    <Button
                      disabled
                      style={{ backgroundColor: '#e8fcff', color: '#000' }}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve & Assign
                    </Button>
                  );
                })()}
                {selectedReviewers.length < 2 && (
                  <Button
                    disabled
                    style={{ backgroundColor: '#e8fcff', color: '#000' }}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve & Assign
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              Loading bid details...
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                <h3 className="font-semibold mb-2">{getBountyTitle(selectedBid.bountyId)}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>Bidder: {selectedBid.first_name || selectedBid.last_name
                    ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                    : selectedBid.bidderAddress}</p>
                  <p>Amount: {selectedBid.proposedAmount} tokens</p>
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