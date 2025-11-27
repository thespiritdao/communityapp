/**
 * HatChildIndexService
 *
 * Provides accurate child index prediction for HAT creation using database tracking.
 *
 * WHY THIS IS NEEDED:
 * - Hats Protocol assigns sequential child indices (1, 2, 3...) to child hats
 * - To predict the admin HAT ID, we need to predict the management HAT ID first
 * - To predict management HAT ID, we need to know what child index it will be
 * - The child index = (number of existing children + 1)
 *
 * ARCHITECTURE:
 * Community Pod
 * ├─ First Sub Pod (index 1)
 * ├─ Second Sub Pod (index 2)
 * └─ Third Sub Pod (index 3)
 *
 * Without this service: Always predicts index 1 (only works for first pod)
 * With this service: Correctly predicts index 1, 2, 3, etc.
 */

import { supabase } from '@/lib/supabase';

export class HatChildIndexService {
  /**
   * Get the next child index for a parent HAT
   *
   * @param parentHatId - The parent HAT ID (e.g., Community Pod HAT ID)
   * @returns Next child index (1 for first child, 2 for second, etc.)
   */
  static async getNextChildIndex(parentHatId: string): Promise<number> {
    console.log('🔍 === QUERYING NEXT CHILD INDEX ===');
    console.log('  Parent HAT ID:', parentHatId);

    try {
      // Query all existing pods with this parent HAT
      const { data: existingPods, error } = await supabase
        .from('pods')
        .select('management_hat_id')
        .eq('parent_hat_id', parentHatId)
        .not('management_hat_id', 'is', null);

      if (error) {
        console.error('❌ Database query failed:', error);
        console.warn('⚠️ Falling back to childIndex=1');
        return 1;
      }

      if (!existingPods || existingPods.length === 0) {
        console.log('✅ No existing children found');
        console.log('  Next child index: 1 (first child)');
        return 1;
      }

      // Extract child indices from management HAT IDs
      const childIndices: number[] = [];

      for (const pod of existingPods) {
        if (!pod.management_hat_id) continue;

        try {
          const childIndex = this.extractChildIndex(
            pod.management_hat_id,
            parentHatId,
          );

          if (childIndex > 0) {
            childIndices.push(childIndex);
            console.log(`  Found existing child: index ${childIndex}`);
          }
        } catch (e) {
          console.warn(
            '⚠️ Failed to extract child index from:',
            pod.management_hat_id,
          );
        }
      }

      if (childIndices.length === 0) {
        console.log('✅ No valid child indices found');
        console.log('  Next child index: 1 (first child)');
        return 1;
      }

      // Get maximum index and add 1
      const maxIndex = Math.max(...childIndices);
      const nextIndex = maxIndex + 1;

      console.log('✅ Child index calculation:');
      console.log('  Existing children:', childIndices.length);
      console.log(
        '  Existing indices:',
        childIndices.sort((a, b) => a - b).join(', '),
      );
      console.log('  Maximum index:', maxIndex);
      console.log('  Next child index:', nextIndex);

      return nextIndex;
    } catch (error) {
      console.error('❌ Unexpected error in getNextChildIndex:', error);
      console.warn('⚠️ Falling back to childIndex=1');
      return 1;
    }
  }

  /**
   * Extract child index from a management HAT ID
   *
   * HAT IDs are 256-bit values with 16 levels of 16 bits each:
   * Level 0 (top) | Level 1 | Level 2 | ... | Level 15
   *
   * To find the child index of management HAT under parent HAT:
   * 1. Determine parent HAT depth
   * 2. Extract value at (depth + 1) level
   *
   * Example:
   * Parent HAT:     0x0001000200000000... (depth 1, has 2 levels)
   * Management HAT: 0x0001000200030000... (depth 2, child index is 3)
   *                             ^^^^ This is the child index
   *
   * @param managementHatId - Management HAT ID to extract index from
   * @param parentHatId - Parent HAT ID to determine depth
   * @returns Child index (1-65535)
   */
  private static extractChildIndex(
    managementHatId: string,
    parentHatId: string,
  ): number {
    const managementHatBigInt = BigInt(managementHatId);
    const parentHatBigInt = BigInt(parentHatId);

    // Find parent HAT depth (number of non-zero levels)
    let parentDepth = 0;
    for (let i = 0; i < 16; i++) {
      const levelValue =
        (parentHatBigInt >> BigInt(16 * (15 - i))) & BigInt(0xffff);
      if (levelValue > 0n) {
        parentDepth = i;
      }
    }

    // Child index is at (parentDepth + 1) level
    const childLevel = parentDepth + 1;
    const childIndexBigInt =
      (managementHatBigInt >> BigInt(16 * (15 - childLevel))) & BigInt(0xffff);

    return Number(childIndexBigInt);
  }

  /**
   * Verify that a management HAT is actually a child of the parent HAT
   *
   * @param managementHatId - Management HAT ID to verify
   * @param parentHatId - Expected parent HAT ID
   * @returns True if management HAT is a child of parent HAT
   */
  static isChildOf(managementHatId: string, parentHatId: string): boolean {
    const managementHatBigInt = BigInt(managementHatId);
    const parentHatBigInt = BigInt(parentHatId);

    // Find parent depth
    let parentDepth = 0;
    for (let i = 0; i < 16; i++) {
      const levelValue =
        (parentHatBigInt >> BigInt(16 * (15 - i))) & BigInt(0xffff);
      if (levelValue > 0n) {
        parentDepth = i;
      }
    }

    // Verify all parent levels match
    for (let i = 0; i <= parentDepth; i++) {
      const parentLevel =
        (parentHatBigInt >> BigInt(16 * (15 - i))) & BigInt(0xffff);
      const childLevel =
        (managementHatBigInt >> BigInt(16 * (15 - i))) & BigInt(0xffff);

      if (parentLevel !== childLevel) {
        return false;
      }
    }

    // Verify child has one more level than parent
    const childLevel = parentDepth + 1;
    const childIndex =
      (managementHatBigInt >> BigInt(16 * (15 - childLevel))) & BigInt(0xffff);

    return childIndex > 0n;
  }

  /**
   * Debug helper: Format HAT ID for logging
   */
  static formatHatId(hatId: string): string {
    const hatIdBigInt = BigInt(hatId);
    const levels: string[] = [];

    for (let i = 0; i < 16; i++) {
      const levelValue =
        (hatIdBigInt >> BigInt(16 * (15 - i))) & BigInt(0xffff);
      if (levelValue > 0n) {
        levels.push(`L${i}:${levelValue.toString()}`);
      }
    }

    return levels.join(' > ');
  }
}
