/**
 * Environment Variable Validation Utility
 *
 * Validates all required environment variables are present at app startup.
 * This ensures we fail fast if the app is misconfigured, rather than
 * encountering runtime errors later.
 *
 * Usage:
 *   import { validateEnvironment } from '@/utils/validateEnvironment';
 *   const validation = validateEnvironment();
 *   if (!validation.isValid) {
 *     console.error('Missing env vars:', validation.missing);
 *   }
 */

export interface EnvValidation {
  isValid: boolean;
  missing: string[];
  warnings: string[];
  details: {
    required: { key: string; present: boolean; category: string }[];
    optional: { key: string; present: boolean; category: string }[];
  };
}

/**
 * Required environment variables grouped by category
 */
const REQUIRED_ENV_VARS = {
  // Blockchain Network
  network: [
    'NEXT_PUBLIC_CHAIN_ID',
  ],

  // Hats Protocol
  hats: [
    'NEXT_PUBLIC_HATS_CONTRACT',
    'NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS',
  ],

  // Tokens
  tokens: [
    'NEXT_PUBLIC_SYSTEM_TOKEN',
    'NEXT_PUBLIC_SELF_TOKEN',
  ],

  // Pod Management
  pods: [
    'NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS',
    'NEXT_PUBLIC_POD_MANAGER_V2_ADDRESS',
  ],

  // Treasury
  treasury: [
    'NEXT_PUBLIC_TREASURY_PROXY',
    'NEXT_PUBLIC_POD_TREASURY_FACTORY',
  ],

  // Events
  events: [
    'NEXT_PUBLIC_EVENT_SYSTEM_FACTORY',
    'NEXT_PUBLIC_EVENT_ESCROW_CONTRACT',
  ],

  // Supabase
  supabase: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ],

  // OnchainKit (Coinbase)
  onchainkit: [
    'NEXT_PUBLIC_ONCHAINKIT_API_KEY',
    'NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME',
  ],
} as const;

/**
 * Optional environment variables (nice to have, but not critical)
 */
const OPTIONAL_ENV_VARS = {
  // Membership Tokens
  membership: [
    'NEXT_PUBLIC_ADVOCATE',
    'NEXT_PUBLIC_PROOF_OF_CURIOSITY',
  ],

  // Event NFT Factories
  events: [
    'NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY',
    'NEXT_PUBLIC_EVENT_COMPLETION_FACTORY',
  ],

  // Bounties
  bounties: [
    'NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS',
    'NEXT_PUBLIC_POD_BOUNTY_SERVICE',
  ],

  // Governance
  governance: [
    'NEXT_PUBLIC_DAO_GOVERNOR',
    'NEXT_PUBLIC_DAO_TIMELOCK',
  ],

  // Marketplace
  marketplace: [
    'NEXT_PUBLIC_PURCHASE_ROUTER',
    'NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED',
  ],

  // IPFS/Pinata
  ipfs: [
    'NEXT_PUBLIC_PINATA_JWT',
    'NEXT_PUBLIC_PINATA_GATEWAY',
  ],

  // Wallet Connect
  walletconnect: [
    'NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID',
  ],

  // Safe Wallet
  safe: [
    'NEXT_PUBLIC_SAFE_WALLET',
  ],

  // Testing/Development
  testing: [
    'NEXT_PUBLIC_PODS_TESTING',
  ],

  // Hat IDs (legacy/specific)
  hatIds: [
    'NEXT_PUBLIC_EXECUTIVE_POD_LEADER',
    'NEXT_PUBLIC_EXECUTIVE_POD_MEMBER',
    'NEXT_PUBLIC_COMMUNITY_PODS_PARENT',
    'NEXT_PUBLIC_DEV_POD_LEADER',
    'NEXT_PUBLIC_DEV_POD_MEMBER',
  ],

  // Pod IDs (legacy/specific)
  podIds: [
    'NEXT_PUBLIC_GOVERNANCE_POD_ID',
    'NEXT_PUBLIC_COMMUNITY_POD_ID',
  ],
} as const;

/**
 * Validate all environment variables
 */
export function validateEnvironment(): EnvValidation {
  const missing: string[] = [];
  const warnings: string[] = [];
  const requiredDetails: { key: string; present: boolean; category: string }[] = [];
  const optionalDetails: { key: string; present: boolean; category: string }[] = [];

  // Check required variables
  Object.entries(REQUIRED_ENV_VARS).forEach(([category, vars]) => {
    vars.forEach(key => {
      const value = process.env[key];
      const present = !!(value && value.trim() !== '');

      requiredDetails.push({ key, present, category });

      if (!present) {
        missing.push(key);
      }
    });
  });

  // Check optional variables
  Object.entries(OPTIONAL_ENV_VARS).forEach(([category, vars]) => {
    vars.forEach(key => {
      const value = process.env[key];
      const present = !!(value && value.trim() !== '');

      optionalDetails.push({ key, present, category });

      if (!present) {
        warnings.push(`Optional: ${key} not set (${category})`);
      }
    });
  });

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    details: {
      required: requiredDetails,
      optional: optionalDetails,
    },
  };
}

/**
 * Validate and log results to console
 */
export function validateEnvironmentWithLogging(): EnvValidation {
  const validation = validateEnvironment();

  console.log('\n🔍 Environment Variable Validation\n');
  console.log('='.repeat(50));

  if (!validation.isValid) {
    console.error('\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:\n');
    validation.missing.forEach(v => {
      const detail = validation.details.required.find(d => d.key === v);
      console.error(`  - ${v} (${detail?.category})`);
    });
    console.error('\n⚠️  Application will not function correctly without these variables.');
    console.error('    Please check your .env file and ensure all required variables are set.\n');
  } else {
    console.log('\n✅ All required environment variables are set\n');
  }

  // Show breakdown by category
  console.log('\n📊 Required Variables by Category:\n');
  const categories = Object.keys(REQUIRED_ENV_VARS);
  categories.forEach(category => {
    const categoryVars = validation.details.required.filter(d => d.category === category);
    const present = categoryVars.filter(d => d.present).length;
    const total = categoryVars.length;
    const status = present === total ? '✅' : '❌';
    console.log(`  ${status} ${category.padEnd(15)} ${present}/${total}`);
  });

  // Show optional variables (only if some are missing)
  const missingOptional = validation.details.optional.filter(d => !d.present);
  if (missingOptional.length > 0 && missingOptional.length < validation.details.optional.length) {
    console.log('\n⚠️  Optional Variables Not Set:\n');
    missingOptional.forEach(detail => {
      console.warn(`  - ${detail.key} (${detail.category})`);
    });
    console.log('\n   These are optional but may limit functionality in certain features.\n');
  }

  console.log('='.repeat(50));
  console.log('\n');

  return validation;
}

/**
 * Get specific environment variable with validation
 */
export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];

  if (!value || value.trim() === '') {
    throw new Error(
      `Required environment variable "${key}" is not set. ` +
      `Please add it to your .env file.`
    );
  }

  return value;
}

/**
 * Get optional environment variable with fallback
 */
export function getOptionalEnvVar(key: string, fallback: string = ''): string {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : fallback;
}

/**
 * Validate specific contract address format
 */
export function validateContractAddress(address: string | undefined, name: string): boolean {
  if (!address) {
    console.warn(`⚠️  Contract address for "${name}" is not set`);
    return false;
  }

  if (!address.startsWith('0x')) {
    console.error(`❌ Contract address for "${name}" does not start with 0x: ${address}`);
    return false;
  }

  if (address.length !== 42) {
    console.error(`❌ Contract address for "${name}" is not 42 characters: ${address} (length: ${address.length})`);
    return false;
  }

  return true;
}

/**
 * Auto-run validation in development mode
 */
if (typeof window === 'undefined') { // Server-side only
  if (process.env.NODE_ENV === 'development') {
    const validation = validateEnvironmentWithLogging();

    if (!validation.isValid) {
      // In development, throw error to prevent app from starting
      throw new Error(
        `❌ Missing required environment variables: ${validation.missing.join(', ')}\n\n` +
        `Please check your .env.local file and ensure all required variables are set.\n` +
        `See .env.example for a template.`
      );
    }
  }
}

// Export validation result for use in other modules
export const ENV_VALIDATION = typeof window === 'undefined'
  ? validateEnvironment()
  : { isValid: true, missing: [], warnings: [], details: { required: [], optional: [] } };
