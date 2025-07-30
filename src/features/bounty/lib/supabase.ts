import { supabase } from '../../../lib/supabase';

// Database types
export interface Bounty {
  id: string;
  title: string;
  description: string;
  category: string;
  value_amount: string;
  value_token: 'SYSTEM' | 'SELF';
  requirements: string[];
  questions: string[];
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  creator_address: string;
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
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  reviewer_address?: string;
  final_approver_address?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
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
  notification_type: 'bid_submitted' | 'bid_approved' | 'bid_rejected' | 'review_requested' | 'deliverable_due' | 'milestone_completed' | 'bounty_completed';
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
    const { data, error } = await supabase
      .from('bounties')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bounties:', error);
      throw error;
    }

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
  async createBounty(bountyData: Omit<Bounty, 'id' | 'created_at' | 'updated_at'>): Promise<Bounty> {
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
  async updateBountyStatus(id: string, status: Bounty['status']): Promise<void> {
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
    const { data, error } = await supabase
      .from('bids')
      .insert([bidData])
      .select()
      .single();

    if (error) {
      console.error('Error submitting bid:', error);
      throw error;
    }

    return data;
  },

  // Update bid status
  async updateBidStatus(id: string, status: Bid['status'], reviewer?: string, finalApprover?: string): Promise<void> {
    const updateData: any = { 
      status, 
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer || finalApprover
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
  async createReview(reviewData: Omit<BidReview, 'id' | 'created_at' | 'updated_at'>): Promise<BidReview> {
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
  async updateReviewStatus(id: string, status: BidReview['status'], comments?: string): Promise<void> {
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
  async createNotification(notificationData: Omit<BountyNotification, 'id' | 'created_at'>): Promise<BountyNotification> {
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
  async getNotificationsForUser(recipientAddress: string): Promise<BountyNotification[]> {
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
  async createMilestones(milestonesData: Omit<Milestone, 'id' | 'created_at'>[]): Promise<Milestone[]> {
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
  async updateMilestoneStatus(id: string, status: Milestone['status'], completedBy?: string, reviewComments?: string): Promise<void> {
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
export const convertBountyToDb = (bounty: any): Omit<Bounty, 'id' | 'created_at' | 'updated_at'> => {
  return {
    title: bounty.title,
    description: bounty.description,
    category: bounty.category,
    value_amount: bounty.value.amount,
    value_token: bounty.value.token,
    requirements: bounty.requirements || [],
    questions: bounty.questions || [],
    status: bounty.status || 'open',
    creator_address: bounty.creator_address,
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
    questions: bounty.questions,
    status: bounty.status,
    createdAt: new Date(bounty.created_at),
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
  };
};

// Helper function to convert database bid format to frontend format
export const convertBidFromDb = (bid: Bid & { user_profile?: { first_name?: string; last_name?: string } }): any => {
  console.log('🔍 convertBidFromDb - Original bid data:', {
    proposed_amount: bid.proposed_amount,
    proposed_amount_type: typeof bid.proposed_amount,
    payment_details: bid.payment_details,
    payment_details_type: typeof bid.payment_details
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
        console.log('Deliverables is plain string, converting to array format:', bid.deliverables);
        parsedDeliverables = [{
          description: bid.deliverables,
          due_date: new Date().toISOString().split('T')[0], // Default to today
          payment_amount: '0'
        }];
      }
    } else if (Array.isArray(bid.deliverables)) {
      parsedDeliverables = bid.deliverables;
    }
  }

  // Parse payment details and ensure all numeric values are strings
  let parsedPaymentDetails: any = {};
  if (bid.payment_details) {
    if (typeof bid.payment_details === 'string') {
      try {
        parsedPaymentDetails = JSON.parse(bid.payment_details);
      } catch (error) {
        console.log('Payment details is plain string, using empty object:', bid.payment_details);
        parsedPaymentDetails = {};
      }
    } else if (typeof bid.payment_details === 'object') {
      parsedPaymentDetails = bid.payment_details;
    }
    
    // Ensure all numeric values in payment details are strings
    if (parsedPaymentDetails.upfrontAmount !== undefined) {
      parsedPaymentDetails.upfrontAmount = String(parsedPaymentDetails.upfrontAmount);
    }
    if (parsedPaymentDetails.completionAmount !== undefined) {
      parsedPaymentDetails.completionAmount = String(parsedPaymentDetails.completionAmount);
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
  };

  console.log('🔍 convertBidFromDb - Converted bid data:', {
    proposedAmount: convertedBid.proposedAmount,
    proposedAmount_type: typeof convertedBid.proposedAmount,
    paymentDetails: convertedBid.paymentDetails,
    paymentDetails_type: typeof convertedBid.paymentDetails
  });

  return convertedBid;
}; 