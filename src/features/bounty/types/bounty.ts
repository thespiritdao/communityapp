export interface Deliverable {
  description: string;
  due_date: string;
  payment_amount: string;
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
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  createdAt: Date;
  creator_address?: string;
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
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  reviewerAddress?: string;
  finalApproverAddress?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  first_name?: string;
  last_name?: string;
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
  notificationType: 'bid_submitted' | 'bid_approved' | 'bid_rejected' | 'review_requested' | 'deliverable_due' | 'milestone_completed' | 'bounty_completed';
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