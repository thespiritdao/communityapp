/**
 * Environment Configuration Fixes
 * 
 * Provides corrected environment values to fix the invalid hat ID issue.
 * This ensures that components use valid hat IDs while we migrate the database.
 */

import { getFixedExecutivePodHatId } from './hatIdValidator';

/**
 * Gets the corrected executive pod hat ID
 * This replaces the problematic environment variable until it's updated
 */
export function getExecutivePodHatId(): string {
  const envHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
  
  // If the environment variable is the problematic one, use the fixed version
  if (envHatId === '0x0000008800010000000000000000000000000000000000000000000000000000') {
    // Only log once to reduce console spam
    if (!globalThis.__hatIdWarningLogged) {
      console.info('🎩 Using corrected Executive Pod hat ID (environment value causes BigInt errors)');
      globalThis.__hatIdWarningLogged = true;
    }
    return getFixedExecutivePodHatId();
  }
  
  // If no environment variable is set, use the fixed one
  if (!envHatId) {
    if (!globalThis.__hatIdMissingLogged) {
      console.info('🎩 NEXT_PUBLIC_EXECUTIVE_POD_LEADER not configured, using default Executive Pod hat ID');
      globalThis.__hatIdMissingLogged = true;
    }
    return getFixedExecutivePodHatId();
  }
  
  return envHatId;
}

/**
 * Gets the corrected executive pod member hat ID
 */
export function getExecutivePodMemberHatId(): string {
  const envHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;
  
  // If the environment variable is the problematic one, use a fixed version
  if (envHatId === '0x0000008800010000000000000000000000000000000000000000000000000000') {
    if (!globalThis.__memberHatIdWarningLogged) {
      console.info('🎩 Using corrected Executive Pod member hat ID (environment value causes BigInt errors)');
      globalThis.__memberHatIdWarningLogged = true;
    }
    return '0x0000000000000000000000000000000000000000000000000000000000000002';
  }
  
  // If no environment variable is set, use a fixed one
  if (!envHatId) {
    if (!globalThis.__memberHatIdMissingLogged) {
      console.info('🎩 NEXT_PUBLIC_EXECUTIVE_POD_MEMBER not configured, using default member hat ID');
      globalThis.__memberHatIdMissingLogged = true;
    }
    return '0x0000000000000000000000000000000000000000000000000000000000000002';
  }
  
  return envHatId;
}

/**
 * Validates environment variables and provides warnings
 */
export function validateEnvironmentHatIds(): {
  valid: boolean;
  warnings: string[];
  corrections: Record<string, string>;
} {
  const warnings: string[] = [];
  const corrections: Record<string, string> = {};
  
  const leaderHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
  const memberHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;
  
  // Check leader hat ID
  if (leaderHatId === '0x0000008800010000000000000000000000000000000000000000000000000000') {
    warnings.push('NEXT_PUBLIC_EXECUTIVE_POD_LEADER contains invalid hat ID that causes BigInt conversion errors');
    corrections.NEXT_PUBLIC_EXECUTIVE_POD_LEADER = getFixedExecutivePodHatId();
  } else if (!leaderHatId) {
    warnings.push('NEXT_PUBLIC_EXECUTIVE_POD_LEADER is not set');
    corrections.NEXT_PUBLIC_EXECUTIVE_POD_LEADER = getFixedExecutivePodHatId();
  }
  
  // Check member hat ID
  if (memberHatId === '0x0000008800010000000000000000000000000000000000000000000000000000') {
    warnings.push('NEXT_PUBLIC_EXECUTIVE_POD_MEMBER contains invalid hat ID that causes BigInt conversion errors');
    corrections.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER = '0x0000000000000000000000000000000000000000000000000000000000000002';
  } else if (!memberHatId) {
    warnings.push('NEXT_PUBLIC_EXECUTIVE_POD_MEMBER is not set');
    corrections.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER = '0x0000000000000000000000000000000000000000000000000000000000000002';
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    corrections
  };
}

/**
 * Creates a .env update template with corrected values
 */
export function generateEnvUpdateTemplate(): string {
  const validation = validateEnvironmentHatIds();
  
  if (validation.valid) {
    return '# Environment variables are already valid';
  }
  
  return `# Updated environment variables with corrected hat IDs
# The previous hat IDs were causing BigInt conversion errors in viem
# Add these to your .env.local file:

${Object.entries(validation.corrections)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')}

# Backup of problematic values:
# NEXT_PUBLIC_EXECUTIVE_POD_LEADER_OLD=0x0000008800010000000000000000000000000000000000000000000000000000
# NEXT_PUBLIC_EXECUTIVE_POD_MEMBER_OLD=0x0000008800010000000000000000000000000000000000000000000000000000
`;
}