import { supabase } from '@/lib/supabase';

// Database types
export interface Bounty {
  id: string;
  title: string;
  description: string;
  category: string;
  value_amount: string;
  value_token: 'SYSTEM' | 'SELF';
  requirements: string[];
  tasks: string[]; // Task list for the bounty
  questions: string[];
  status: 'open' | 'in-progress' | 'completed' | 'cancelled' | 'draft';
  creator_address: string;
  required_pod_id?: string;
  pod_id?: string; // Pod this bounty belongs to
  funding_source?: 'personal_wallet' | 'pod_treasury'; // Funding source for bounty
  ipfs_hash?: string;
  onchain_id?: number; // On-chain bounty ID from BountyManagerV2
  created_at: string;
  updated_at: string;
}

export interface Bid {
  id: string;
  bounty_id: string;
  bidder_address: string;
  experience: string;
  plan_of_action: string;
  deliverables: any[]; // Array of {description: string, due_date: string, payment_amount: string}
  timeline: string;
  proposed_amount: string;
  payment_option: 'completion' | 'milestones' | 'split';
  payment_details: any; // Payment schedule details
  answers: Record<string, string>;
  additional_notes: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived' | 'legacy_pending';
  reviewer_address?: string;
  final_approver_address?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  // On-chain bid placement tracking
  onchain_bid_index?: number;
  placement_tx_hash?: string;
  bid_ipfs_hash?: string;
}

export interface BidReview {
  id: string;
  bid_id: string;
  reviewer_address: string;
  review_type: 'technical' | 'final';
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  created_at: string;
  updated_at: string;
}

export interface BountyNotification {
  id: string;
  recipient_address: string;
  bounty_id?: string;
  bid_id?: string;
  notification_type:
    | 'bid_submitted'
    | 'bid_approved'
    | 'bid_rejected'
    | 'review_requested'
    | 'deliverable_due'
    | 'milestone_completed'
    | 'bounty_completed';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Milestone {
  id: string;
  bid_id: string;
  deliverable_description: string;
  due_date: string;
  payment_amount: string;
  status: 'pending' | 'completed' | 'overdue';
  completed_at?: string;
  completed_by?: string;
  review_comments?: string;
  created_at: string;
}

// Bounty API functions
export const bountyApi = {
  // Get all bounties
  async getAllBounties(): Promise<Bounty[]> {
    console.log(
      '📥 bountyApi.getAllBounties: Fetching all bounties from database...',
    );
    // Gates ride along so eligibility can be decided without a second query.
    const { data, error } = await supabase
      .from('bounties')
      .select('*, bounty_token_gates(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching bounties:', error);
      throw error;
    }

    console.log(
      `✅ bountyApi.getAllBounties: Fetched ${data?.length || 0} bounties from database`,
    );
    console.log(
      '📋 Raw bounty IDs:',
      data?.map((b) => ({
        id: b.id,
        title: b.title,
        created_at: b.created_at,
      })),
    );
    return data || [];
  },

  // Get bounty by ID
  async getBountyById(id: string): Promise<Bounty | null> {
    const { data, error } = await supabase
      .from('bounties')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching bounty:', error);
      throw error;
    }

    return data;
  },

  // Create new bounty
  async createBounty(
    bountyData: Omit<Bounty, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Bounty> {
    const { data, error } = await supabase
      .from('bounties')
      .insert([bountyData])
      .select()
      .single();

    if (error) {
      console.error('Error creating bounty:', error);
      throw error;
    }

    return data;
  },

  // Update bounty status
  async updateBountyStatus(
    id: string,
    status: Bounty['status'],
  ): Promise<void> {
    const { error } = await supabase
      .from('bounties')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating bounty status:', error);
      throw error;
    }
  },

  // Get bounties by creator
  async getBountiesByCreator(creatorAddress: string): Promise<Bounty[]> {
    const { data, error } = await supabase
      .from('bounties')
      .select('*')
      .eq('creator_address', creatorAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching creator bounties:', error);
      throw error;
    }

    return data || [];
  },
};

// Bid API functions
export const bidApi = {
  // Get bids for a bounty
  async getBidsForBounty(bountyId: string): Promise<Bid[]> {
    const { data, error } = await supabase
      .from('bids')
      .select(`*, user_profile:bidder_address (first_name, last_name)`)
      .eq('bounty_id', bountyId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching bids:', error);
      throw error;
    }

    return data || [];
  },

  // Get all bids (for admin review)
  async getAllBids(): Promise<Bid[]> {
    const { data, error } = await supabase
      .from('bids')
      .select(`*, user_profile:bidder_address (first_name, last_name)`)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching all bids:', error);
      throw error;
    }

    return data || [];
  },

  // Submit a bid
  async submitBid(bidData: Omit<Bid, 'id' | 'submitted_at'>): Promise<Bid> {
    // Ensure user profile exists before submitting bid
    // The issue is that the foreign key expects wallet_address to exist in user_profiles
    const normalizedAddress = bidData.bidder_address.toLowerCase();

    try {
      // First check if user profile exists by wallet_address
      const { data: existingProfile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('wallet_address, user_id')
        .eq('wallet_address', normalizedAddress)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error checking user profile:', fetchError);
        throw fetchError;
      }

      if (!existingProfile) {
        console.log('📝 Creating user profile for wallet:', normalizedAddress);

        // Use upsert to handle potential race conditions
        const { error: upsertError } = await supabase
          .from('user_profiles')
          .upsert(
            {
              wallet_address: normalizedAddress,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'wallet_address',
            },
          );

        if (upsertError) {
          console.error('❌ Failed to upsert user profile:', upsertError);
          // Try one more time with just insert in case upsert has issues
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              wallet_address: normalizedAddress,
            });

          if (insertError && insertError.code !== '23505') {
            // 23505 is duplicate key
            console.error(
              '❌ Failed to create user profile on retry:',
              insertError,
            );
            throw new Error(
              'Unable to create user profile. Please try refreshing and signing in again.',
            );
          }
        }
        console.log('✅ User profile created/upserted for bid submission');
      } else {
        console.log('✅ User profile already exists for bid submission');
      }
    } catch (profileError) {
      console.error('❌ Critical error handling user profile:', profileError);
      throw profileError; // Throw here as we can't proceed without a valid profile
    }

    // DEDUPLICATION: Check if bid already exists with same transaction hash
    if (bidData.placement_tx_hash) {
      console.log(
        '🔍 Checking for duplicate bid with txHash:',
        bidData.placement_tx_hash,
      );

      const { data: existingBid, error: checkError } = await supabase
        .from('bids')
        .select('id, bounty_id, bidder_address, placement_tx_hash')
        .eq('placement_tx_hash', bidData.placement_tx_hash)
        .eq('bounty_id', bidData.bounty_id)
        .eq('bidder_address', normalizedAddress)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Error checking for duplicate bid:', checkError);
        // Don't throw - continue with insert
      }

      if (existingBid) {
        console.log(
          '⚠️ Bid already exists with this transaction hash:',
          existingBid.id,
        );
        console.log('✅ Returning existing bid instead of creating duplicate');
        return existingBid as Bid;
      }
    }

    // Ensure bidder_address is normalized before inserting
    const bidDataWithNormalizedAddress = {
      ...bidData,
      bidder_address: normalizedAddress,
    };

    console.log('💾 Inserting new bid to database:', {
      bounty_id: bidDataWithNormalizedAddress.bounty_id,
      bidder: normalizedAddress,
      txHash: bidDataWithNormalizedAddress.placement_tx_hash,
      bidIndex: bidDataWithNormalizedAddress.onchain_bid_index,
    });

    const { data, error } = await supabase
      .from('bids')
      .insert([bidDataWithNormalizedAddress])
      .select()
      .single();

    if (error) {
      console.error('❌ Error submitting bid:', error);
      throw error;
    }

    console.log('✅ Bid inserted successfully:', data.id);
    return data;
  },

  // Update an existing bid (for editing)
  async updateBid(
    id: string,
    bidData: Partial<Omit<Bid, 'id' | 'submitted_at' | 'bidder_address'>>,
  ): Promise<Bid> {
    const { data, error } = await supabase
      .from('bids')
      .update(bidData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating bid:', error);
      throw error;
    }

    return data;
  },

  // Update bid status
  async updateBidStatus(
    id: string,
    status: Bid['status'],
    reviewer?: string,
    finalApprover?: string,
  ): Promise<void> {
    const updateData: any = {
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer || finalApprover,
    };

    if (reviewer) updateData.reviewer_address = reviewer;
    if (finalApprover) updateData.final_approver_address = finalApprover;

    const { error } = await supabase
      .from('bids')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating bid status:', error);
      throw error;
    }

    // If bid is approved, update the bounty status to 'in-progress'
    if (status === 'approved') {
      await this.updateBountyStatusToInProgress(id);
    }
  },

  // Update bounty status to in-progress when a bid is approved
  async updateBountyStatusToInProgress(bidId: string): Promise<void> {
    try {
      // First get the bid to find the bounty ID
      const { data: bid, error: bidError } = await supabase
        .from('bids')
        .select('bounty_id')
        .eq('id', bidId)
        .single();

      if (bidError || !bid) {
        console.error('Error finding bid for status update:', bidError);
        return;
      }

      // Update the bounty status to 'in-progress'
      const { error: bountyError } = await supabase
        .from('bounties')
        .update({ status: 'in-progress' })
        .eq('id', bid.bounty_id);

      if (bountyError) {
        console.error(
          'Error updating bounty status to in-progress:',
          bountyError,
        );
        throw bountyError;
      }

      console.log(`✅ Updated bounty ${bid.bounty_id} status to 'in-progress'`);
    } catch (error) {
      console.error('Failed to update bounty status:', error);
    }
  },

  // Get bids by bidder
  async getBidsByBidder(bidderAddress: string): Promise<Bid[]> {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('bidder_address', bidderAddress)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching bidder bids:', error);
      throw error;
    }

    return data || [];
  },

  // Get bid by ID
  async getBidById(id: string): Promise<Bid | null> {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching bid:', error);
      throw error;
    }

    return data;
  },
};

// Bid Review API functions
export const bidReviewApi = {
  // Create a bid review
  async createReview(
    reviewData: Omit<BidReview, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<BidReview> {
    const { data, error } = await supabase
      .from('bid_reviews')
      .insert([reviewData])
      .select()
      .single();

    if (error) {
      console.error('Error creating bid review:', error);
      throw error;
    }

    return data;
  },

  // Get reviews for a bid
  async getReviewsForBid(bidId: string): Promise<BidReview[]> {
    const { data, error } = await supabase
      .from('bid_reviews')
      .select('*')
      .eq('bid_id', bidId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bid reviews:', error);
      throw error;
    }

    return data || [];
  },

  // Update review status
  async updateReviewStatus(
    id: string,
    status: BidReview['status'],
    comments?: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('bid_reviews')
      .update({ status, comments, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating review status:', error);
      throw error;
    }
  },
};

// Notification API functions
export const notificationApi = {
  // Create a notification
  async createNotification(
    notificationData: Omit<BountyNotification, 'id' | 'created_at'>,
  ): Promise<BountyNotification> {
    const { data, error } = await supabase
      .from('bounty_notifications')
      .insert([notificationData])
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    return data;
  },

  // Get notifications for a user
  async getNotificationsForUser(
    recipientAddress: string,
  ): Promise<BountyNotification[]> {
    const { data, error } = await supabase
      .from('bounty_notifications')
      .select('*')
      .eq('recipient_address', recipientAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }

    return data || [];
  },

  // Mark notification as read
  async markNotificationAsRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('bounty_notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Get unread notification count
  async getUnreadNotificationCount(recipientAddress: string): Promise<number> {
    const { count, error } = await supabase
      .from('bounty_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', recipientAddress)
      .eq('is_read', false);

    if (error) {
      console.error('Error fetching unread notification count:', error);
      throw error;
    }

    return count || 0;
  },
};

// Milestone API functions
export const milestoneApi = {
  // Create milestones for a bid
  async createMilestones(
    milestonesData: Omit<Milestone, 'id' | 'created_at'>[],
  ): Promise<Milestone[]> {
    const { data, error } = await supabase
      .from('milestones')
      .insert(milestonesData)
      .select();

    if (error) {
      console.error('Error creating milestones:', error);
      throw error;
    }

    return data || [];
  },

  // Get milestones for a bid
  async getMilestonesForBid(bidId: string): Promise<Milestone[]> {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('bid_id', bidId)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching milestones:', error);
      throw error;
    }

    return data || [];
  },

  // Update milestone status
  async updateMilestoneStatus(
    id: string,
    status: Milestone['status'],
    completedBy?: string,
    reviewComments?: string,
  ): Promise<void> {
    const updateData: any = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      if (completedBy) updateData.completed_by = completedBy;
    }

    if (reviewComments) updateData.review_comments = reviewComments;

    const { error } = await supabase
      .from('milestones')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating milestone status:', error);
      throw error;
    }
  },
};

// Helper function to convert frontend bounty format to database format
export const convertBountyToDb = (
  bounty: any,
): Omit<Bounty, 'id' | 'created_at' | 'updated_at'> => {
  return {
    title: bounty.title,
    description: bounty.description,
    category: bounty.category,
    value_amount: bounty.value.amount,
    value_token: bounty.value.token,
    requirements: bounty.requirements || [],
    tasks: bounty.tasks || [],
    questions: bounty.questions || [],
    status: bounty.status || 'open',
    creator_address: bounty.creator_address,
    required_pod_id: bounty.podId || bounty.required_pod_id || null,
    ipfs_hash: bounty.ipfs_hash || null,
  };
};

// Helper function to convert database bounty format to frontend format
export const convertBountyFromDb = (bounty: Bounty): any => {
  return {
    id: bounty.id,
    title: bounty.title,
    description: bounty.description,
    category: bounty.category,
    value: {
      amount: bounty.value_amount,
      token: bounty.value_token,
    },
    requirements: bounty.requirements,
    tasks: bounty.tasks || [],
    questions: bounty.questions,
    status: bounty.status,
    createdAt: new Date(bounty.created_at),
    creator_address: bounty.creator_address,
    podId: bounty.required_pod_id,
    pod_id: bounty.pod_id, // Include pod_id
    funding_source: bounty.funding_source, // Include funding_source
    ipfs_hash: bounty.ipfs_hash,
    onchain_id: bounty.onchain_id, // Map on-chain bounty ID
    // Eligibility (see lib/eligibility.ts): passed through untouched so the
    // consumer can build the gate.
    required_pod_id: (bounty as any).required_pod_id ?? null,
    restriction_level: (bounty as any).restriction_level ?? null,
    bounty_token_gates: (bounty as any).bounty_token_gates ?? [],
  };
};

// Helper function to convert frontend bid format to database format
export const convertBidToDb = (bid: any): Omit<Bid, 'id' | 'submitted_at'> => {
  return {
    bounty_id: bid.bountyId,
    bidder_address: bid.bidderAddress,
    experience: bid.experience,
    plan_of_action: bid.planOfAction,
    deliverables: bid.deliverables || [],
    timeline: bid.timeline,
    proposed_amount: bid.proposedAmount,
    payment_option: bid.paymentOption || 'completion',
    payment_details: bid.paymentDetails || {},
    answers: bid.answers || {},
    additional_notes: bid.additionalNotes || '',
    status: bid.status || 'pending',
    reviewer_address: bid.reviewerAddress,
    final_approver_address: bid.finalApproverAddress,
    // On-chain bid placement tracking
    onchain_bid_index: bid.onchainBidIndex,
    placement_tx_hash: bid.placementTxHash,
    bid_ipfs_hash: bid.bidIpfsHash,
  };
};

// Helper function to convert database bid format to frontend format
export const convertBidFromDb = (
  bid: Bid & { user_profile?: { first_name?: string; last_name?: string } },
): any => {
  console.log('🔍 convertBidFromDb - Original bid data:', {
    proposed_amount: bid.proposed_amount,
    proposed_amount_type: typeof bid.proposed_amount,
    payment_details: bid.payment_details,
    payment_details_type: typeof bid.payment_details,
  });

  // Parse deliverables - handle various formats
  let parsedDeliverables = [];
  if (bid.deliverables) {
    if (typeof bid.deliverables === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(bid.deliverables);
        parsedDeliverables = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        // If it's not valid JSON, treat it as a plain string and create a single deliverable
        console.log(
          'Deliverables is plain string, converting to array format:',
          bid.deliverables,
        );
        parsedDeliverables = [
          {
            description: bid.deliverables,
            due_date: new Date().toISOString().split('T')[0], // Default to today
            payment_amount: '0',
          },
        ];
      }
    } else if (Array.isArray(bid.deliverables)) {
      parsedDeliverables = bid.deliverables;
    }
  }

  // Ensure all deliverables have a due_date field (for backward compatibility)
  parsedDeliverables = parsedDeliverables.map((d) => ({
    ...d,
    due_date: d.due_date || new Date().toISOString().split('T')[0],
  }));

  // Parse payment details and ensure all numeric values are strings
  let parsedPaymentDetails: any = {};
  if (bid.payment_details) {
    if (typeof bid.payment_details === 'string') {
      try {
        parsedPaymentDetails = JSON.parse(bid.payment_details);
      } catch (error) {
        console.log(
          'Payment details is plain string, using empty object:',
          bid.payment_details,
        );
        parsedPaymentDetails = {};
      }
    } else if (typeof bid.payment_details === 'object') {
      parsedPaymentDetails = bid.payment_details;
    }

    // Ensure all numeric values in payment details are strings
    if (parsedPaymentDetails.upfrontAmount !== undefined) {
      parsedPaymentDetails.upfrontAmount = String(
        parsedPaymentDetails.upfrontAmount,
      );
    }
    if (parsedPaymentDetails.completionAmount !== undefined) {
      parsedPaymentDetails.completionAmount = String(
        parsedPaymentDetails.completionAmount,
      );
    }
  }

  const convertedBid = {
    id: bid.id,
    bountyId: bid.bounty_id,
    bidderAddress: bid.bidder_address,
    first_name: bid.user_profile?.first_name || '',
    last_name: bid.user_profile?.last_name || '',
    experience: bid.experience,
    planOfAction: bid.plan_of_action,
    deliverables: parsedDeliverables,
    timeline: bid.timeline,
    proposedAmount: String(bid.proposed_amount), // Ensure this is always a string
    paymentOption: bid.payment_option,
    paymentDetails: parsedPaymentDetails,
    answers: bid.answers || {},
    additionalNotes: bid.additional_notes || '',
    status: bid.status,
    reviewerAddress: bid.reviewer_address,
    finalApproverAddress: bid.final_approver_address,
    submittedAt: new Date(bid.submitted_at),
    reviewedAt: bid.reviewed_at ? new Date(bid.reviewed_at) : undefined,
    reviewedBy: bid.reviewed_by,
    // On-chain bid placement tracking
    onchainBidIndex: bid.onchain_bid_index,
    placementTxHash: bid.placement_tx_hash,
    bidIpfsHash: bid.bid_ipfs_hash,
  };

  console.log('🔍 convertBidFromDb - Converted bid data:', {
    proposedAmount: convertedBid.proposedAmount,
    proposedAmount_type: typeof convertedBid.proposedAmount,
    paymentDetails: convertedBid.paymentDetails,
    paymentDetails_type: typeof convertedBid.paymentDetails,
  });

  return convertedBid;
};
