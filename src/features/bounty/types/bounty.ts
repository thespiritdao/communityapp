export interface Deliverable {
  description: string;
  due_date: string;
  payment_amount: string;
}

export interface BountyTokenGating {
  required_tokens?: Array<{
    token_id: string;
    token_name: string;
    token_type: 'token' | 'pod_role' | 'system';
    minimum_balance?: string;
  }>;
  restriction_level?:
    | 'public'
    | 'token_holders'
    | 'pod_members'
    | 'invite_only';
}

export interface FrontendBounty {
  id: string; // This will be the Supabase UUID
  onchain_id: number; // This will be the uint256 ID from the contract
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  requirements?: string[];
  questions?: string[];
  token_gating?: BountyTokenGating;
  work_requirements?: string[]; // Separated from role requirements
  status: 'open' | 'in-progress' | 'completed' | 'cancelled' | 'closed';
  createdAt: Date;
  creator_address?: string;
  // Pod and funding information
  pod_id?: string; // UUID of the pod this bounty belongs to
  funding_source?: 'personal_wallet' | 'pod_treasury'; // Where funds come from
  // Bid acceptance configuration
  bid_acceptance_mode?: 'single' | 'multiple' | 'unlimited' | 'date_limited';
  max_bids_accepted?: number;
  bids_accepted_count?: number;
}

export interface FrontendBid {
  id: string;
  bountyId: string; // The Supabase UUID of the bounty
  bidderAddress: string;
  experience: string;
  planOfAction: string;
  deliverables: Deliverable[];
  timeline: string;
  proposedAmount: string;
  paymentOption: 'completion' | 'milestones' | 'split';
  paymentDetails: {
    upfrontAmount?: string;
    completionAmount?: string;
    milestonePayments?: { [key: string]: string };
  };
  answers: Record<string, string>;
  additionalNotes: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived' | 'legacy_pending';
  reviewerAddress?: string;
  finalApproverAddress?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  first_name?: string;
  last_name?: string;
  // On-chain bid placement tracking
  onchainBidIndex?: number; // Index in contract bids[bountyId][] array
  placementTxHash?: string; // Transaction hash from placeBid() call
  bidIpfsHash?: string; // IPFS hash of bid metadata
}

export interface FrontendBidReview {
  id: string;
  bidId: string;
  reviewerAddress: string;
  reviewType: 'technical' | 'final';
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FrontendNotification {
  id: string;
  recipientAddress: string;
  bountyId?: string;
  bidId?: string;
  notificationType:
    | 'bid_submitted'
    | 'bid_approved'
    | 'bid_rejected'
    | 'review_requested'
    | 'deliverable_due'
    | 'milestone_completed'
    | 'bounty_completed';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface FrontendMilestone {
  id: string;
  bidId: string;
  deliverableDescription: string;
  dueDate: Date;
  paymentAmount: string;
  status: 'pending' | 'completed' | 'overdue';
  completedAt?: Date;
  completedBy?: string;
  reviewComments?: string;
  createdAt: Date;
}

export interface DeliverableUrl {
  label: string;
  url: string;
}

export interface FrontendWorkSubmission {
  id: string;
  bountyId: string;
  bidId: string;
  submitterAddress: string;
  submissionTitle: string;
  submissionDescription: string;
  deliverableUrls: DeliverableUrl[];
  attachmentUrls: string[];
  completedDeliverables: string[]; // IDs of deliverables from bid
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  reviewerAddress?: string;
  reviewComments?: string;
  reviewedAt?: Date;
  revisionNumber: number;
  previousSubmissionId?: string;
  createdAt: Date;
  updatedAt: Date;
}
