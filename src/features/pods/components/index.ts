// Optimized barrel exports for pods feature components
// Following the identity feature pattern for clean imports

// ==========================================
// CORE POD MANAGEMENT COMPONENTS
// ==========================================

// Main pod management and display
export { PodManagementContainer } from './PodManagementContainer';
export { PodDetailsContainer } from './PodDetailsContainer';
export { PodCard, PodCardGrid } from './PodCard';
// PodCreationForm - DELETED (replaced by HatsModulePodCreationForm)
export { PodDeletionManager } from './PodDeletionManager';
export { PodDeletionApprovalFlow } from './PodDeletionApprovalFlow';
export { PodPageLayout } from './PodPageLayout';
export {
  PodAccessGate,
  ExecutivePodGate,
  PodLeaderGate,
  PodMemberGate,
} from './PodAccessGate';

// Contract and treasury management
export { PodContractCreator } from './PodContractCreator';
export { default as ConsolidatedTreasuryDeployer } from './ConsolidatedTreasuryDeployerV2';
export { default as PodTreasurySync } from './PodTreasurySync';
export { TreasuryManagement } from './TreasuryManagement';
export { PodSpecificTreasuryManager } from './PodSpecificTreasuryManager';

// ==========================================
// HAT PROTOCOL INTEGRATION COMPONENTS
// ==========================================

// HAT management and controls
export { HatDeactivationControls } from './HatDeactivationControls';
export { HatsModuleManager } from './HatsModuleManager';
export { RepairHatModulesButton } from './RepairHatModulesButton';
export { AdvancedHATSettings } from './AdvancedHATSettings';

// HAT image management
export { HatImageViewer } from './HatImageViewer';
export { HatImageUpload } from './HatImageUpload';
export { PodImageUpload } from './PodImageUpload';
export { PodSettingsPanel } from './PodSettingsPanel';

// ==========================================
// MEMBERSHIP & GOVERNANCE COMPONENTS
// ==========================================

// Membership and registration
export { PodRegistrationManager } from './PodRegistrationManager';
export { AccountabilityAgreementModal } from './AccountabilityAgreementModal';
export { MembershipAgreementModal } from './MembershipAgreementModal';
export { OnChainAgreementSigningModal } from './OnChainAgreementSigningModal';
export { default as AgreementSigningModal } from './AgreementSigningModal';
export { AgreementsPanel } from './AgreementsPanel';

// Governance and approvals
export { GovernanceProposalModal } from './GovernanceProposalModal';
export { ExecutivePodApprovalPanel } from './ExecutivePodApprovalPanel';

// ==========================================
// ELIGIBILITY & PERMISSIONS COMPONENTS
// ==========================================

// Eligibility management
export { EligibilityCriteriaBuilder } from './EligibilityCriteriaBuilder';
export { EligibilityCriteriaDisplay } from './EligibilityCriteriaDisplay';
export { EligibilityGatedContent } from './EligibilityGatedContent';

// Role permissions and diagnostics
export { RolePermissionsDiagnostics } from './RolePermissionsDiagnostics';

// ==========================================
// SPECIALIZED POD FEATURES
// ==========================================

// Pod modules and extensions
export { default as PodModulesManager } from './PodModulesManager';
export { default as PodChatManager } from './PodChatManager';
export { HatsModulePodCreationForm } from './HatsModulePodCreationForm';

// Management tools
export { PodManagerControlPanel } from './PodManagerControlPanel';

// ==========================================
// UTILITY & INPUT COMPONENTS
// ==========================================

// User interaction components
export { UserSearchInput } from './UserSearchInput';
export { default as UserRecipientSelector } from './UserRecipientSelector';
export { TokenBalanceInput } from './TokenBalanceInput';

// Distribution and treasury tools
export {
  prepareDirectDistribution,
  prepareDirectEqualDistribution,
} from './DirectDistribution';

// Development and deployment helpers
export { RemixDeploymentHelper } from './RemixDeploymentHelper';
