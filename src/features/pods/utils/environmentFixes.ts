/**
 * Environment Configuration Fixes
 *
 * Provides corrected environment values to fix the invalid hat ID issue.
 * Now delegates to the DB-backed hat registry (getClientHatId) instead of
 * reading NEXT_PUBLIC_* environment variables directly.
 */

import { getFixedExecutivePodHatId } from './hatIdValidator';
import { getClientHatId } from '@/lib/hatRegistryClient';

/**
 * Gets the corrected executive pod hat ID
 * Reads from the DB-backed client registry; falls back to the fixed validator value.
 */
export function getExecutivePodHatId(): string {
  const registryHatId = getClientHatId('EXECUTIVE_POD_LEADER');

  if (registryHatId) {
    return registryHatId;
  }

  // If registry not yet populated, fall back to the fixed value
  if (!globalThis.__hatIdMissingLogged) {
    console.info(
      '🎩 EXECUTIVE_POD_LEADER not in registry yet, using default Executive Pod hat ID',
    );
    globalThis.__hatIdMissingLogged = true;
  }
  return getFixedExecutivePodHatId();
}

/**
 * Gets the corrected executive pod member hat ID — retired, always returns empty string
 * @deprecated Executive Pod Member hat no longer exists
 */
export function getExecutivePodMemberHatId(): string {
  return '';
}

/**
 * Validates registry hat IDs and provides warnings
 */
export function validateEnvironmentHatIds(): {
  valid: boolean;
  warnings: string[];
  corrections: Record<string, string>;
} {
  const warnings: string[] = [];
  const corrections: Record<string, string> = {};

  const leaderHatId = getClientHatId('EXECUTIVE_POD_LEADER');

  // Check leader hat ID
  if (!leaderHatId) {
    warnings.push('EXECUTIVE_POD_LEADER is not set in hat registry');
    corrections.EXECUTIVE_POD_LEADER = getFixedExecutivePodHatId();
  }

  return {
    valid: warnings.length === 0,
    warnings,
    corrections,
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
