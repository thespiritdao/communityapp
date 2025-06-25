"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/components/ui/tabs';
import { BountyAcceptance } from './BountyAcceptance';
import { BountyCompletion } from './BountyCompletion';
import { bidApi, convertBidFromDb, type Bid as DbBid } from '../lib/supabase';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from 'src/components/ui/dialog';
import { format } from 'date-fns';

interface FrontendBid {
  id: string;
  bountyId: string;
  bidderAddress: string;
  experience: string;
  planOfAction: string;
  deliverables: Array<{
    description: string;
    due_date: string;
    payment_amount: string;
  }>;
  timeline: string;
  proposedAmount: string;
  answers: Record<string, string>;
  additionalNotes: string;
  submittedAt: Date;
  first_name?: string;
  last_name?: string;
}

interface BountyDetails {
  id: string;
  title: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  status: 'open' | 'in-progress' | 'completed';
}

interface BidViewerProps {
  bounty: BountyDetails;
  onBidAccepted?: (bidId: string, bidderAddress: string) => void;
  onBountyCompleted?: () => void;
}

// Helper to merge user names into bids (copied from useBountySupabase)
async function mergeUserNamesIntoBids(bids: any[]) {
  const uniqueAddresses = Array.from(new Set(bids.map(b => b.bidder_address)));
  if (uniqueAddresses.length === 0) return bids;
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('wallet_address, first_name, last_name')
    .in('wallet_address', uniqueAddresses);
  if (error) {
    console.error('Error fetching user profiles:', error);
    return bids;
  }
  const profileMap = Object.fromEntries(
    (profiles || []).map(p => [p.wallet_address, { first_name: p.first_name, last_name: p.last_name }])
  );
  return bids.map(bid => ({
    ...bid,
    first_name: profileMap[bid.bidder_address]?.first_name || '',
    last_name: profileMap[bid.bidder_address]?.last_name || '',
  }));
}

export const BidViewer: React.FC<BidViewerProps> = ({ 
  bounty, 
  onBidAccepted, 
  onBountyCompleted 
}) => {
  const [bids, setBids] = useState<FrontendBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBid, setSelectedBid] = useState<FrontendBid | null>(null);
  const [showAcceptance, setShowAcceptance] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    loadBids();
  }, [bounty.id]);

  const loadBids = async () => {
    try {
      setLoading(true);
      const dbBids = await bidApi.getBidsForBounty(bounty.id);
      const bidsWithNames = await mergeUserNamesIntoBids(dbBids);
      const frontendBids = bidsWithNames.map(convertBidFromDb);
      setBids(frontendBids);
    } catch (error) {
      console.error('Error loading bids:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBid = (bid: FrontendBid) => {
    setSelectedBid(bid);
    setShowAcceptance(true);
  };

  const handleBidAccepted = () => {
    setShowAcceptance(false);
    setSelectedBid(null);
    onBidAccepted?.(selectedBid!.id, selectedBid!.bidderAddress);
  };

  const handleCompleteBounty = () => {
    setShowCompletion(false);
    onBountyCompleted?.();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (bids.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-gray-600">No bids received yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bounty Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{bounty.title}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">{bounty.status}</Badge>
            <Badge variant="secondary">{bounty.value.amount} {bounty.value.token}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Bids List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Bids ({bids.length})</h3>
        {bids.map((bid) => (
          <Card key={bid.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold">Bidder: {bid.first_name || bid.last_name
                    ? `${bid.first_name || ''} ${bid.last_name || ''}`.trim()
                    : bid.bidderAddress}</h4>
                  <p className="text-sm text-gray-600">
                    Submitted: {bid.submittedAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">
                    {bid.proposedAmount} {bounty.value.token}
                  </p>
                  <p className="text-sm text-gray-500">
                    Original: {bounty.value.amount} {bounty.value.token}
                  </p>
                </div>
              </div>

              <Tabs defaultValue="experience" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="experience">Experience</TabsTrigger>
                  <TabsTrigger value="plan">Plan</TabsTrigger>
                  <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="experience" className="mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-2">Relevant Experience</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{bid.experience}</p>
                  </div>
                </TabsContent>

                <TabsContent value="plan" className="mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-2">Plan of Action</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{bid.planOfAction}</p>
                  </div>
                </TabsContent>

                <TabsContent value="deliverables" className="mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-2">Deliverables</h5>
                    <div className="space-y-2">
                      {Array.isArray(bid.deliverables) ? bid.deliverables.map((deliverable, index) => (
                        <div key={index} className="border-b border-gray-200 pb-2 last:border-0">
                          <p className="text-gray-700">{deliverable.description}</p>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="mr-4">Due: {format(new Date(deliverable.due_date), 'MMM dd, yyyy')}</span>
                            <span>Amount: {deliverable.payment_amount}</span>
                          </div>
                        </div>
                      )) : (
                        <p className="text-gray-700">No deliverables specified</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium mb-2">Timeline</h5>
                    <p className="text-gray-700 whitespace-pre-wrap">{bid.timeline}</p>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Additional Questions */}
              {Object.keys(bid.answers).length > 0 && (
                <div className="mt-4">
                  <h5 className="font-medium mb-2">Additional Questions</h5>
                  <div className="space-y-2">
                    {Object.entries(bid.answers).map(([question, answer]) => (
                      <div key={question} className="bg-gray-50 p-3 rounded">
                        <p className="text-sm font-medium text-gray-600">{question}</p>
                        <p className="text-gray-700 mt-1">{answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {bid.additionalNotes && (
                <div className="mt-4">
                  <h5 className="font-medium mb-2">Additional Notes</h5>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-700">{bid.additionalNotes}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 mt-6">
                {bounty.status === 'open' && (
                  <Button 
                    onClick={() => handleAcceptBid(bid)}
                    className="flex-1"
                  >
                    Accept Bid
                  </Button>
                )}
                {bounty.status === 'in-progress' && (
                  <Button 
                    onClick={() => setShowCompletion(true)}
                    className="flex-1"
                  >
                    Complete Bounty
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Acceptance Modal */}
      {showAcceptance && selectedBid && (
        <Dialog open={showAcceptance} onOpenChange={() => setShowAcceptance(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review & Approve Bid</DialogTitle>
              <DialogDescription id="review-dialog-desc">
                Review the bid details and assign reviewers before approval.
              </DialogDescription>
            </DialogHeader>
            <BountyAcceptance
              bountyId={bounty.id}
              bountyTitle={bounty.title}
              bountyValue={bounty.value}
              bidderAddress={selectedBid.bidderAddress}
              onAccept={handleBidAccepted}
            />
            <Button 
              variant="outline" 
              onClick={() => setShowAcceptance(false)}
              className="w-full mt-4"
            >
              Cancel
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Completion Modal */}
      {showCompletion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <BountyCompletion
              bountyId={bounty.id}
              bountyTitle={bounty.title}
              bountyValue={bounty.value}
              onComplete={handleCompleteBounty}
            />
            <Button 
              variant="outline" 
              onClick={() => setShowCompletion(false)}
              className="w-full mt-4"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}; 