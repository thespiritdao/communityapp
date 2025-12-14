/**
 * Beta Tester Utility Functions
 *
 * BETA TESTING ONLY - These functions grant superuser privileges to Beta Tester hat holders.
 *
 * ⚠️ IMPORTANT: Remove or disable these checks before full production launch!
 * See: BETA_TESTER_REMOVAL_GUIDE.md for reversal instructions.
 */

import type { HatPermissionInfo } from '@/hooks/useHatPermissions';

// Beta Tester Hat ID from environment
const BETA_TESTER_HAT_ID = process.env.NEXT_PUBLIC_BETA_TESTER_HAT as `0x${string}`;

/**
 * Check if user has Beta Tester hat
 *
 * @param userHats - Array of user's hat permissions
 * @returns true if user has Beta Tester hat
 */
export function isBetaTester(userHats: HatPermissionInfo[]): boolean {
  if (!BETA_TESTER_HAT_ID) {
    console.warn('⚠️ BETA_TESTER_HAT_ID not configured');
    return false;
  }

  return userHats.some(
    (hat) => hat.hatId.toLowerCase() === BETA_TESTER_HAT_ID.toLowerCase(),
  );
}

/**
 * Check if Beta Tester superuser mode is enabled
 *
 * Controlled by NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER environment variable.
 * Default: true (enabled for beta period)
 *
 * @returns true if Beta Tester superuser mode is enabled
 */
export function isBetaTesterSuperuserEnabled(): boolean {
  // Default to enabled for beta period
  const envValue = process.env.NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER;

  // Explicitly disabled?
  if (envValue === 'false') {
    return false;
  }

  // Enabled by default (true or undefined)
  return true;
}

/**
 * Check if user should have superuser access
 *
 * Returns true if:
 * - Beta Tester superuser mode is enabled AND
 * - User has Beta Tester hat
 *
 * @param userHats - Array of user's hat permissions
 * @returns true if user should have superuser access
 */
export function hasBetaTesterSuperuser(userHats: HatPermissionInfo[]): boolean {
  if (!isBetaTesterSuperuserEnabled()) {
    return false;
  }

  const result = isBetaTester(userHats);

  if (result) {
    console.log(
      '👑 Beta Tester Superuser: Granting full permissions (beta testing mode)',
    );
  }

  return result;
}

/**
 * Get Beta Tester hat ID
 */
export function getBetaTesterHatId(): string | null {
  return BETA_TESTER_HAT_ID || null;
}

/**
 * Log Beta Tester status for debugging
 */
export function logBetaTesterStatus(
  userHats: HatPermissionInfo[],
  context: string,
): void {
  const isBeta = isBetaTester(userHats);
  const superuserEnabled = isBetaTesterSuperuserEnabled();
  const hasSuperuser = hasBetaTesterSuperuser(userHats);

  console.log(`🔍 [${context}] Beta Tester Status:`, {
    isBetaTester: isBeta,
    superuserModeEnabled: superuserEnabled,
    hasSuperuserAccess: hasSuperuser,
    betaTesterHatId: BETA_TESTER_HAT_ID,
    userHatCount: userHats.length,
  });
}
