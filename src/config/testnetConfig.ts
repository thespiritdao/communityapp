/**
 * Testnet Configuration Module
 *
 * This module provides testnet-specific settings that make the app
 * easier to test while maintaining production readiness for mainnet.
 *
 * Features:
 * - Relaxed permissions (1-person approvals for testing)
 * - Faster governance cycles (hours instead of days)
 * - Lower token requirements
 * - Auto-airdrop support
 */

// ============================================================
// Network Detection
// ============================================================

export const isTestnet = (): boolean => {
  return (
    process.env.NEXT_PUBLIC_IS_TESTNET === 'true' ||
    process.env.NEXT_PUBLIC_CHAIN_ID === '84532'
  ); // Base Sepolia
};

export const isMainnet = (): boolean => {
  return !isTestnet();
};

export const getNetworkName = (): string => {
  return isTestnet() ? 'Base Sepolia (Testnet)' : 'Base Mainnet';
};

// ============================================================
// Configuration Interface
// ============================================================

export interface AppConfig {
  // Network
  chainId: number;
  rpcUrl: string;
  networkName: string;
  isTestnet: boolean;

  // Pod Creation
  minPodLeaders: number;
  podCreationTokenRequirement: number;
  podCreationDeposit: bigint;

  // Governance
  proposalThreshold: number;
  votingPeriod: number; // seconds
  votingDelay: number; // seconds
  quorumPercentage: number;

  // Bounties
  bountyApprovalRequired: number; // Number of approvers needed
  bountyMinimumAmount: bigint;
  bountyEscrowTimeout: number; // seconds

  // Treasury
  treasuryWithdrawalThreshold: number; // Number of signatures
  treasuryWithdrawalDelay: number; // seconds

  // Events
  eventCreationDeposit: bigint;
  eventMinimumAttendance: number;
  eventRegistrationPeriod: number; // seconds

  // Membership
  membershipApprovalRequired: number;
  membershipTokenRequirement: bigint;

  // Token Expiration
  selfTokenExpiration: number; // seconds

  // Features
  enableAutoAirdrop: boolean;
  airdropAmounts: {
    system: bigint;
    self: bigint;
  };

  // UI/UX
  showTestnetBanner: boolean;
  enableDebugMode: boolean;
}

// ============================================================
// Testnet Configuration
// ============================================================

const TESTNET_CONFIG: AppConfig = {
  // Network
  chainId: 84532, // Base Sepolia
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org',
  networkName: 'Base Sepolia (Testnet)',
  isTestnet: true,

  // Pod Creation - Relaxed for testing
  minPodLeaders: 1, // 1 person can create a pod
  podCreationTokenRequirement: 10, // Only 10 tokens needed
  podCreationDeposit: BigInt(1), // Minimal deposit

  // Governance - Fast cycles for testing
  proposalThreshold: Number(process.env.NEXT_PUBLIC_PROPOSAL_THRESHOLD) || 100, // 100 tokens
  votingPeriod:
    Number(process.env.NEXT_PUBLIC_GOVERNANCE_VOTING_PERIOD) || 3600, // 1 hour
  votingDelay: Number(process.env.NEXT_PUBLIC_GOVERNANCE_VOTING_DELAY) || 300, // 5 minutes
  quorumPercentage: 10, // 10% quorum (vs 51% on mainnet)

  // Bounties - Single approval for testing
  bountyApprovalRequired: 1, // 1 person approval
  bountyMinimumAmount: BigInt(10 * 1e18), // 10 tokens
  bountyEscrowTimeout: 86400, // 1 day (vs 7 days mainnet)

  // Treasury - Single signature for testing
  treasuryWithdrawalThreshold: 1, // 1 signature
  treasuryWithdrawalDelay: 300, // 5 minutes (vs 24 hours mainnet)

  // Events - Lower barriers for testing
  eventCreationDeposit: BigInt(1 * 1e18), // 1 token
  eventMinimumAttendance: 1, // 1 person can attend
  eventRegistrationPeriod: 3600, // 1 hour before event

  // Membership - Easy to test
  membershipApprovalRequired: 1, // 1 person approval
  membershipTokenRequirement: BigInt(5 * 1e18), // 5 tokens

  // Token Expiration - Faster for testing
  selfTokenExpiration: 86400 * 30, // 30 days (vs 90 days mainnet)

  // Features - Testnet only
  enableAutoAirdrop: process.env.NEXT_PUBLIC_ENABLE_AUTO_AIRDROP === 'true',
  airdropAmounts: {
    system: BigInt(
      (Number(process.env.NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM) || 100) *
        1e18,
    ),
    self: BigInt(
      (Number(process.env.NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF) || 100) *
        1e18,
    ),
  },

  // UI/UX - Show testnet warnings
  showTestnetBanner: true,
  enableDebugMode: true,
};

// ============================================================
// Mainnet Configuration (Production)
// ============================================================

const MAINNET_CONFIG: AppConfig = {
  // Network
  chainId: 8453, // Base Mainnet
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
  networkName: 'Base Mainnet',
  isTestnet: false,

  // Pod Creation - Stricter requirements
  minPodLeaders: Number(process.env.NEXT_PUBLIC_MIN_POD_LEADERS) || 3,
  podCreationTokenRequirement: 1000, // 1000 tokens required
  podCreationDeposit: BigInt(100 * 1e18), // 100 token deposit

  // Governance - Production timeframes
  proposalThreshold: 10000, // 10k tokens to create proposal
  votingPeriod: 604800, // 1 week
  votingDelay: 86400, // 1 day
  quorumPercentage: 51, // 51% quorum

  // Bounties - Multi-person approval
  bountyApprovalRequired: 2, // 2 person approval
  bountyMinimumAmount: BigInt(100 * 1e18), // 100 tokens minimum
  bountyEscrowTimeout: 604800, // 7 days

  // Treasury - Multi-sig required
  treasuryWithdrawalThreshold: 3, // 3 signatures required
  treasuryWithdrawalDelay: 86400, // 24 hour delay

  // Events - Production barriers
  eventCreationDeposit: BigInt(100 * 1e18), // 100 tokens
  eventMinimumAttendance: 5, // 5 people minimum
  eventRegistrationPeriod: 86400, // 1 day before event

  // Membership - Standard requirements
  membershipApprovalRequired: 2, // 2 person approval
  membershipTokenRequirement: BigInt(50 * 1e18), // 50 tokens

  // Token Expiration - Production timeframe
  selfTokenExpiration: 86400 * 90, // 90 days

  // Features - Beta Testing Enabled
  // BETA TESTING: Auto-airdrop enabled on mainnet for 30-day beta period
  // TODO: Set to false before full production launch
  enableAutoAirdrop: process.env.NEXT_PUBLIC_ENABLE_AUTO_AIRDROP === 'true',
  airdropAmounts: {
    system: BigInt(
      (Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM) || 100) *
        1e18,
    ),
    self: BigInt(
      (Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF) || 100) *
        1e18,
    ),
  },

  // UI/UX - Production mode
  showTestnetBanner: false,
  enableDebugMode: false,
};

// ============================================================
// Configuration Getter
// ============================================================

/**
 * Get the appropriate configuration based on current network
 */
export function getConfig(): AppConfig {
  return isTestnet() ? TESTNET_CONFIG : MAINNET_CONFIG;
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof AppConfig>(
  key: K,
): AppConfig[K] {
  const config = getConfig();
  return config[key];
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof AppConfig): boolean {
  const value = getConfigValue(feature);
  return Boolean(value);
}

/**
 * Get formatted network info for display
 */
export function getNetworkInfo() {
  const config = getConfig();
  return {
    name: config.networkName,
    chainId: config.chainId,
    isTestnet: config.isTestnet,
    rpcUrl: config.rpcUrl,
  };
}

/**
 * Get testnet banner message
 */
export function getTestnetBannerMessage(): string | null {
  if (!isTestnet()) return null;

  return '🧪 TESTNET MODE: You are using Base Sepolia. Transactions use test ETH with no real value.';
}

/**
 * Check if auto-airdrop is enabled and get amounts
 */
export function getAirdropConfig() {
  const config = getConfig();

  if (!config.enableAutoAirdrop) {
    return null;
  }

  return {
    enabled: true,
    amounts: {
      system: config.airdropAmounts.system,
      self: config.airdropAmounts.self,
    },
  };
}

/**
 * Get governance timeframes in human-readable format
 */
export function getGovernanceTimeframes() {
  const config = getConfig();

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  };

  return {
    votingPeriod: formatDuration(config.votingPeriod),
    votingDelay: formatDuration(config.votingDelay),
    proposalThreshold: config.proposalThreshold,
    quorumPercentage: config.quorumPercentage,
  };
}

// ============================================================
// Export Default Config
// ============================================================

export default getConfig();
