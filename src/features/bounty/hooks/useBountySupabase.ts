import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useBountyContractEnhanced } from './useBountyContractEnhanced';
import {
  bountyApi,
  bidApi,
  notificationApi,
  bidReviewApi,
  convertBountyToDb,
  convertBountyFromDb,
  convertBidToDb,
  convertBidFromDb,
  type BountyNotification as DbBountyNotification,
} from '../lib/supabase';

import type {
  FrontendBounty,
  FrontendBid,
  FrontendNotification,
} from '../types/bounty';

export const useBountySupabase = () => {
  const { address } = useAccount();
  const { createBountyOnChain } = useBountyContractEnhanced();

  const [bounties, setBounties] = useState<FrontendBounty[]>([]);
  const [bids, setBids] = useState<FrontendBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBounties = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🚀 useBountySupabase: Loading bounties from API...');
      const dbBounties = await bountyApi.getAllBounties();
      console.log('✅ useBountySupabase: Raw bounties from DB:', dbBounties);
      const frontendBounties = dbBounties.map(convertBountyFromDb);
      console.log(
        '✅ useBountySupabase: Converted bounties:',
        frontendBounties,
      );
      setBounties(frontendBounties);
    } catch (err) {
      console.error('❌ useBountySupabase: Error loading bounties:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load bounties on initialization and whenever loadBounties changes
  useEffect(() => {
    console.log('🚀 useBountySupabase: Initial load effect triggered');
    loadBounties();
  }, [loadBounties]);

  // Return a stable loadBounties function that can be called to force refresh
  // This ensures that when the component remounts with a new key, it fetches fresh data
  useEffect(() => {
    console.log('🔄 Component mounted/remounted - forcing fresh bounty load');
  }, []);

  const loadAllBids = useCallback(async () => {
    try {
      setError(null);
      const dbBids = await bidApi.getAllBids();
      console.log('🔍 Database bids loaded:', dbBids);
      const frontendBids = dbBids.map(convertBidFromDb);
      console.log('🔍 Frontend bids converted:', frontendBids);
      setBids(frontendBids);
    } catch (err) {
      console.error('Error loading bids:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bids');
    }
  }, []);

  const createBounty = useCallback(
    async (
      bountyData: Omit<FrontendBounty, 'id' | 'createdAt' | 'onchain_id'>,
    ) => {
      setLoading(true);
      setError(null);
      try {
        // Only create bounty in Supabase
        // IMPORTANT: Normalize address to lowercase to match authentication flow
        const dbBountyData = convertBountyToDb({
          ...bountyData,
          creator_address: address?.toLowerCase(),
        });
        const newDbBounty = await bountyApi.createBounty(dbBountyData);
        const newFrontendBounty = convertBountyFromDb(newDbBounty);
        setBounties((prev) => [newFrontendBounty, ...prev]);
        return newFrontendBounty;
      } catch (err) {
        console.error('Error creating bounty:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create bounty';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const submitBid = useCallback(
    async (
      bidData: Omit<
        FrontendBid,
        'id' | 'submittedAt' | 'bidderAddress' | 'status'
      >,
    ) => {
      if (!address) throw new Error('Wallet not connected');

      setLoading(true);
      setError(null);
      try {
        // TODO: Add on-chain bid placement call here

        // IMPORTANT: Normalize address to lowercase to match authentication flow
        const normalizedAddress = address.toLowerCase();

        const dbBidData = convertBidToDb({
          ...bidData,
          bidderAddress: normalizedAddress,
          status: 'pending',
        });

        const newDbBid = await bidApi.submitBid(dbBidData);
        // You may want to update local state here if you are displaying bids
        return convertBidFromDb(newDbBid);
      } catch (err) {
        console.error('Error submitting bid:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to submit bid';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const updateBid = useCallback(
    async (
      bidId: string,
      bidData: Omit<
        FrontendBid,
        'id' | 'submittedAt' | 'bidderAddress' | 'status'
      >,
    ) => {
      if (!address) throw new Error('Wallet not connected');

      setLoading(true);
      setError(null);
      try {
        const dbBidData = convertBidToDb({
          ...bidData,
          bidderAddress: address.toLowerCase(),
          status: 'pending', // Keep as pending when editing
        });

        // Remove fields that shouldn't be updated
        const { bidder_address, status, ...updateData } = dbBidData;

        const updatedDbBid = await bidApi.updateBid(bidId, updateData);
        return convertBidFromDb(updatedDbBid);
      } catch (err) {
        console.error('Error updating bid:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update bid';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const updateBidStatus = useCallback(
    async (
      bidId: string,
      status: FrontendBid['status'],
      reviewer?: string,
      finalApprover?: string,
    ) => {
      try {
        setError(null);
        await bidApi.updateBidStatus(bidId, status, reviewer, finalApprover);

        // Update local state to reflect the change immediately
        setBids((prevBids) =>
          prevBids.map((bid) =>
            bid.id === bidId
              ? {
                  ...bid,
                  status,
                  reviewerAddress: reviewer || bid.reviewerAddress,
                  finalApproverAddress:
                    finalApprover || bid.finalApproverAddress,
                  reviewedAt: new Date(),
                  reviewedBy: reviewer || finalApprover,
                }
              : bid,
          ),
        );
      } catch (err) {
        console.error('Error updating bid status:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to update bid status',
        );
        throw err;
      }
    },
    [],
  );

  const createBidReview = useCallback(
    async (reviewData: {
      bidId: string;
      reviewerAddress: string;
      reviewType: 'technical' | 'final';
      status: 'pending' | 'approved' | 'rejected';
      comments?: string;
    }) => {
      try {
        setError(null);
        console.log('🔍 Creating bid review with data:', reviewData);

        const dbReviewData = {
          bid_id: reviewData.bidId,
          reviewer_address: reviewData.reviewerAddress,
          review_type: reviewData.reviewType,
          status: reviewData.status,
          comments: reviewData.comments,
        };

        console.log('🔍 Database review data:', dbReviewData);

        await bidReviewApi.createReview(dbReviewData);
      } catch (err) {
        console.error('Error creating bid review:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to create bid review',
        );
        throw err;
      }
    },
    [],
  );

  const createNotification = useCallback(
    async (
      notificationData: Omit<
        FrontendNotification,
        'id' | 'createdAt' | 'isRead'
      >,
    ) => {
      try {
        setError(null);
        const dbNotification: Omit<DbBountyNotification, 'id' | 'created_at'> =
          {
            recipient_address: notificationData.recipientAddress,
            bounty_id: notificationData.bountyId,
            bid_id: notificationData.bidId,
            notification_type: notificationData.notificationType,
            title: notificationData.title,
            message: notificationData.message,
            is_read: false,
          };
        await notificationApi.createNotification(dbNotification);
      } catch (err) {
        console.error('Error creating notification:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to create notification',
        );
        throw err;
      }
    },
    [],
  );

  return {
    bounties,
    bids,
    loading,
    error,
    loadBounties,
    loadAllBids,
    createBounty,
    submitBid,
    updateBid,
    updateBidStatus,
    createBidReview,
    createNotification,
    clearError: () => setError(null),
  };
};
