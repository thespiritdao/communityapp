"use client"

import React, { useEffect } from 'react';
import { BountyList } from '@/features/bounty/components/BountyList';
import { BountyForm, BountyFormData } from '@/features/bounty/components/BountyForm';
import { BidForm } from '@/features/bounty/components/BidForm';
import { BidReviewManager } from '@/features/bounty/components/BidReviewManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { useBountySupabase, FrontendBounty } from '@/features/bounty/hooks/useBountySupabase';
import { Button } from '@/components/ui/button';
import '@/features/bounty/styles/bounty.css';

const defaultCategories = [
  'Development',
  'Design',
  'Marketing',
  'Content',
  'Research',
  'Community',
];

export default function BountyPage() {
  const { address } = useAccount();
  const [isBountyManager, setIsBountyManager] = React.useState(false);
  const [selectedBountyForBid, setSelectedBountyForBid] = React.useState<FrontendBounty | null>(null);
  const [activeTab, setActiveTab] = React.useState('public');

  const {
    bounties,
    loading,
    error,
    loadBounties,
    createBounty,
    submitBid,
    clearError,
    createNotification,
    updateBidStatus,
  } = useBountySupabase();
  
  useEffect(() => {
    loadBounties();
  }, [loadBounties]);


  React.useEffect(() => {
    const checkBountyManager = async () => {
      if (address) {
        const balances = await fetchTokenBalances(address);
        setIsBountyManager(balances.hasBountyHat || false);
      }
    };

    checkBountyManager();
  }, [address]);

  const handleCreateBounty = async (formData: BountyFormData) => {
    try {
      await createBounty({ ...formData, status: 'open' });
      setActiveTab('public');
    } catch (error) {
      console.error('Failed to create bounty:', error);
      // Error is already set in the hook, so no need to set it here
    }
  };

  const handleBid = async (bountyId: string) => {
    const bounty = bounties.find(b => b.id === bountyId);
    if (bounty) {
      setSelectedBountyForBid(bounty);
      setActiveTab('bid');
    }
  };

  const handleSubmitBid = async (bidData: any) => {
    if (!selectedBountyForBid) return;

    try {
      await submitBid({
        bountyId: selectedBountyForBid.id,
        ...bidData
      });
      
      setSelectedBountyForBid(null);
      setActiveTab('public');
    } catch (error) {
      console.error('Failed to submit bid:', error);
    }
  };

  const handleCancelBid = () => {
    setSelectedBountyForBid(null);
    setActiveTab('public');
  };

  const handleBidStatusChange = async (bidId: string, status: 'approved' | 'rejected', reviewer?: string, finalApprover?: string) => {
    try {
      await updateBidStatus(bidId, status, reviewer, finalApprover);
    } catch (error) {
      console.error('Failed to update bid status:', error);
    }
  };

  const handleNotificationSent = async (notification: any) => {
    try {
      await createNotification({
        recipientAddress: notification.recipientAddress,
        bountyId: notification.bountyId,
        bidId: notification.bidId,
        notificationType: notification.notificationType,
        title: notification.title,
        message: notification.message,
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  };

  if (loading && bounties.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading bounties...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Bounties</h1>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex justify-between items-center">
            <p className="text-red-800">{error}</p>
            <Button variant="outline" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          {activeTab === 'bid' ? (
            <>
              <TabsTrigger value="public">Public Bounties</TabsTrigger>
              <TabsTrigger value="bid">Submit Bid</TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="public">Public Bounties</TabsTrigger>
              {isBountyManager && (
                <TabsTrigger value="create">Create Bounty</TabsTrigger>
              )}
              {isBountyManager && (
                <TabsTrigger value="review">Review Bids</TabsTrigger>
              )}
            </>
          )}
        </TabsList>

        <TabsContent value="public">
          {bounties.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">No bounties available yet.</p>
              {isBountyManager && (
                <Button onClick={() => setActiveTab('create')}>
                  Create the first bounty
                </Button>
              )}
            </div>
          ) : (
            <BountyList bounties={bounties} onBid={handleBid} />
          )}
        </TabsContent>

        {isBountyManager && (
          <TabsContent value="create">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold mb-6">Create New Bounty</h2>
              <BountyForm
                onSubmit={handleCreateBounty}
                categories={defaultCategories}
              />
            </div>
          </TabsContent>
        )}

        {isBountyManager && (
          <TabsContent value="review">
            <BidReviewManager
              onBidStatusChange={handleBidStatusChange}
              onNotificationSent={handleNotificationSent}
            />
          </TabsContent>
        )}

        {selectedBountyForBid && (
          <TabsContent value="bid">
            <BidForm
              bounty={selectedBountyForBid}
              onSubmit={handleSubmitBid}
              onCancel={handleCancelBid}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
} 