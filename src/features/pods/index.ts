// Main barrel export for pods feature
// Following the identity feature pattern for clean, organized exports

// ==========================================
// CORE SERVICES
// ==========================================

// Re-export all services from services barrel
export * from './services';

// ==========================================
// COMPONENTS
// ==========================================

// Re-export all components from components barrel
export * from './components';

// ==========================================
// HOOKS
// ==========================================

// Re-export all hooks from hooks barrel
export * from './hooks';

// ==========================================
// TYPES
// ==========================================

// Core pod types
export type {
  Pod,
  MemberRef,
  PodServiceConfig,
  PodCreationData,
} from './types';

// Service types from PodCoreService
export type {
  GovernanceProposalData,
  AccountabilitySignature,
} from './services/PodCoreService';

// Hook types (re-exported from hooks barrel)
export type {
  UsePodsConfig,
  UsePodsReturn,
  UsePodDetailsConfig,
  UsePodDetailsReturn,
  UsePodPermissionsConfig,
  UsePodPermissionsReturn,
  UseAccountabilityConfig,
  UseAccountabilityReturn,
} from './hooks';

// ==========================================
// UTILITIES
// ==========================================

// Treasury utilities
export {
  getTreasuryAddress,
  getTreasuryAddressSync,
} from './utils/treasuryAddressUtils';

// ==========================================
// CONSTANTS AND CONFIGURATION
// ==========================================

// Export any pod-specific constants
export const POD_STATUS = {
  DRAFT: 'draft',
  PROPOSED: 'proposed',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const MEMBERSHIP_TYPES = {
  LEADER: 'leader',
  MEMBER: 'member',
  ADMIN: 'admin',
} as const;

// ==========================================
// CONVENIENCE EXPORTS
// ==========================================

// Main hook for pod management
export { usePods as usePodsManager } from './hooks';

// Main service for pod operations
export { PodCoreService as PodsAPI } from './services/PodCoreService';
