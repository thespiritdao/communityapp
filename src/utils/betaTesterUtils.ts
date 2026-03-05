/**
 * Beta Tester Utility Functions
 *
 * Beta testing period has ended. All functions return false.
 * The beta tester hat has been retired.
 */

import type { HatRole } from '@/services/hatPermissionsService';

/**
 * Check if user has Beta Tester hat — always false (hat retired)
 */
export function isBetaTester(_userHats: string[] | HatRole[]): boolean {
  return false;
}

/**
 * Check if Beta Tester superuser mode is enabled — always false (beta ended)
 */
export function isBetaTesterSuperuserEnabled(): boolean {
  return false;
}

/**
 * Check if user should have superuser access — always false (beta ended)
 */
export function hasBetaTesterSuperuser(_userHats: string[] | HatRole[]): boolean {
  return false;
}

/**
 * Get Beta Tester hat ID — always null (hat retired)
 */
export function getBetaTesterHatId(): string | null {
  return null;
}

/**
 * Log Beta Tester status for debugging
 */
export function logBetaTesterStatus(
  _userHats: string[] | HatRole[],
  context: string,
): void {
  console.log(`🔍 [${context}] Beta Tester Status: retired`);
}
