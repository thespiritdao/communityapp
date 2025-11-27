/**
 * Pod types - Re-exported from events for consistency but should eventually move here
 */
export type { Pod } from '../events/types/event';

/**
 * Member reference type for pod operations
 * Extended to support on-chain removal flow (Issue #7)
 */
export type MemberRef = {
  wallet: string;
  id?: string; // pod_members.id - needed for database updates
  hat_id?: string; // HAT token ID - needed for on-chain revocation
  membership_type?: 'leader' | 'member' | 'admin'; // Role type
  joined_at?: string; // Membership start time
};

/**
 * Pod creation data for new pod proposals
 */
export type PodCreationData = {
  name: string;
  description: string;
  parentPodId: string;
  podLeads: string[];
  image?: string;
  accountabilitySignatures?: Record<string, any>;
};

/**
 * Pod access levels for HAT-based permissions
 */
export type PodAccess = {
  hasManagementAccess: boolean;
  hasMembershipAccess: boolean;
  managementHatId?: string;
  membershipHatId?: string;
};

/**
 * Pod service configuration
 */
export type PodServiceConfig = {
  bypassRLS?: boolean;
  includeInactive?: boolean;
};