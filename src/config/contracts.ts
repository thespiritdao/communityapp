/**
 * Central Contract Configuration
 *
 * All blockchain contract addresses and ABIs are managed here.
 * This ensures consistency across the application and makes it easy to update addresses.
 */

// ============================================================================
// CONTRACT ADDRESSES
// ============================================================================

export const CONTRACT_ADDRESSES = {
  // Hats Protocol (Base Mainnet - DO NOT CHANGE)
  HATS_PROTOCOL: (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
    '0x3bc1a0ad72417f2d411118085256fc53cbddd137') as `0x${string}`,

  // Hats Module Factory
  HATS_MODULE_FACTORY: (process.env.NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS ||
    '0xfE661c01891172046feE16D3a57c3Cf456729efA') as `0x${string}`,

  // Tokens
  SYSTEM_TOKEN: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
  SELF_TOKEN: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,

  // Membership Tokens
  ADVOCATE_TOKEN: process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`,
  PROOF_OF_CURIOSITY: process.env
    .NEXT_PUBLIC_PROOF_OF_CURIOSITY as `0x${string}`,

  // Pod Management (V2)
  POD_FACTORY_V2: process.env
    .NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS as `0x${string}`,
  POD_MANAGER_V2: process.env
    .NEXT_PUBLIC_POD_MANAGER_V2_ADDRESS as `0x${string}`,
  POD_CREATION_MANAGER: process.env
    .NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`,

  // Treasury
  TREASURY_PROXY: process.env.NEXT_PUBLIC_TREASURY_PROXY as `0x${string}`,
  TREASURY_FACTORY: process.env
    .NEXT_PUBLIC_POD_TREASURY_FACTORY as `0x${string}`,

  // Events
  EVENT_MANAGER: process.env.NEXT_PUBLIC_EVENT_MANAGER as `0x${string}`,
  EVENT_ESCROW: process.env.NEXT_PUBLIC_EVENT_ESCROW_CONTRACT as `0x${string}`,
  EVENT_SYSTEM_FACTORY: process.env
    .NEXT_PUBLIC_EVENT_SYSTEM_FACTORY as `0x${string}`,
  EVENT_REGISTRATION_FACTORY: process.env
    .NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY as `0x${string}`,
  EVENT_COMPLETION_FACTORY: process.env
    .NEXT_PUBLIC_EVENT_COMPLETION_FACTORY as `0x${string}`,

  // Bounties
  BOUNTY_MANAGER: process.env
    .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
  POD_BOUNTY_SERVICE: process.env
    .NEXT_PUBLIC_POD_BOUNTY_SERVICE as `0x${string}`,

  // Governance
  DAO_GOVERNOR: process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`,
  DAO_TIMELOCK: process.env.NEXT_PUBLIC_DAO_TIMELOCK as `0x${string}`,

  // Marketplace
  PURCHASE_ROUTER: process.env.NEXT_PUBLIC_PURCHASE_ROUTER as `0x${string}`,
  PURCHASE_ROUTER_DECENTRALIZED: process.env
    .NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}`,

  // Safe Wallet (for multi-sig operations)
  SAFE_WALLET: process.env.NEXT_PUBLIC_SAFE_WALLET as `0x${string}`,

  // Utility
  MULTICALL: (process.env.NEXT_PUBLIC_MULTICALL_ADDRESS ||
    '0xcA11bde05977b3631167028862bE2a173976CA11') as `0x${string}`,
} as const;

// ============================================================================
// HAT IDS
// ============================================================================
// Hat IDs are sourced from pod_role_permissions via src/lib/hatRegistry.ts.
// They are NOT stored in env vars. Update token_address in pod_role_permissions
// after redeploying the hat tree and the app picks up new values automatically.
//
// Active hats (top hat 0x00000749):
//   EXECUTIVE_POD_LEADER       — Executive Pod leader hat
//   COMMUNITY_PODS_PARENT      — Community Pods parent hat
//   TEMPORAL_NATURALISM        — Temporal Naturalism pod hat
//   TEMPORAL_NATURALISM_MEMBER — Temporal Naturalism member hat
//
// Server-side usage:
//   import { getHatId, getHatIdBigInt } from '@/lib/hatRegistry';
//   const leaderId = await getHatIdBigInt('EXECUTIVE_POD_LEADER');
//
// Client-side usage:
//   import { getClientHatId } from '@/lib/hatRegistryClient';
//   const leaderId = getClientHatId('EXECUTIVE_POD_LEADER');  // populated at app boot
export type { HatIds, HatKey } from '@/lib/hatRegistry';

// ============================================================================
// POD IDS (from environment)
// ============================================================================

export const POD_IDS = {
  GOVERNANCE: process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID as string,
  COMMUNITY: process.env.NEXT_PUBLIC_COMMUNITY_POD_ID as string,
} as const;

// ============================================================================
// CONFIGURATION FLAGS
// ============================================================================

export const CONFIG_FLAGS = {
  IS_TESTING: process.env.NEXT_PUBLIC_PODS_TESTING === 'true',
  MIN_POD_LEADERS: parseInt(process.env.NEXT_PUBLIC_MIN_POD_LEADERS || '1', 10),
  FORCE_APPROVAL_FLOW: process.env.NEXT_PUBLIC_FORCE_APPROVAL_FLOW === 'true',
  TEST_MULTI_APPROVAL: process.env.NEXT_PUBLIC_TEST_MULTI_APPROVAL === 'true',
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

interface ValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that all required contract addresses are configured
 * Call this on app initialization to catch configuration issues early
 */
export function validateContractAddresses(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required addresses (will break the app if missing)
  const required = {
    HATS_PROTOCOL: CONTRACT_ADDRESSES.HATS_PROTOCOL,
    SYSTEM_TOKEN: CONTRACT_ADDRESSES.SYSTEM_TOKEN,
    SELF_TOKEN: CONTRACT_ADDRESSES.SELF_TOKEN,
  };

  // Critical addresses (app features will break if missing)
  const critical = {
    EVENT_MANAGER: CONTRACT_ADDRESSES.EVENT_MANAGER,
    BOUNTY_MANAGER: CONTRACT_ADDRESSES.BOUNTY_MANAGER,
    DAO_GOVERNOR: CONTRACT_ADDRESSES.DAO_GOVERNOR,
    TREASURY_PROXY: CONTRACT_ADDRESSES.TREASURY_PROXY,
  };

  // Optional addresses (features may not work but app won't crash)
  const optional = {
    POD_FACTORY_V2: CONTRACT_ADDRESSES.POD_FACTORY_V2,
    POD_MANAGER_V2: CONTRACT_ADDRESSES.POD_MANAGER_V2,
    EVENT_ESCROW: CONTRACT_ADDRESSES.EVENT_ESCROW,
  };

  // Check required
  Object.entries(required).forEach(([key, value]) => {
    if (!value || value === '0x' || (value as string) === 'undefined') {
      missing.push(key);
    }
  });

  // Check critical (will cause feature failures)
  Object.entries(critical).forEach(([key, value]) => {
    if (!value || value === '0x' || (value as string) === 'undefined') {
      missing.push(key);
    }
  });

  // Check optional
  Object.entries(optional).forEach(([key, value]) => {
    if (!value || value === '0x' || (value as string) === 'undefined') {
      warnings.push(`${key} not configured - related features may not work`);
    }
  });

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validates a contract address format
 */
export function isValidAddress(address: string | undefined): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Gets contract address with validation
 * Throws error if address is invalid
 */
export function getContractAddress(
  contractKey: keyof typeof CONTRACT_ADDRESSES,
): `0x${string}` {
  const address = CONTRACT_ADDRESSES[contractKey];

  if (!isValidAddress(address)) {
    throw new Error(
      `Invalid or missing contract address for ${contractKey}. ` +
        `Please check your environment variables.`,
    );
  }

  return address;
}

// ============================================================================
// CHAIN CONFIGURATION
// ============================================================================

export const CHAIN_CONFIG = {
  CHAIN_ID: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10),
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  PAYMASTER_URL: process.env.NEXT_PUBLIC_PAYMASTER,
  CDP_API_CLIENT: process.env.NEXT_PUBLIC_CDP_API_CLIENT,
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default CONTRACT_ADDRESSES;
