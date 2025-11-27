/**
 * Hats Protocol Hat ID Prediction Utilities
 *
 * Hat IDs in Hats Protocol are deterministic hierarchical identifiers
 * structured as 32 bytes with 16 levels (2 bytes per level).
 *
 * Each level can have up to 65,535 children (uint16).
 * Child hat IDs are calculated by setting the appropriate level bytes.
 */

/**
 * Predicts the child hat ID based on parent hat ID and child index
 *
 * @param parentHatId - The parent hat's ID as bigint
 * @param childIndex - The child position (1 for first child, 2 for second, etc.)
 * @returns The predicted child hat ID as bigint
 *
 * @example
 * const parentId = BigInt('0x0001000200030000000000000000000000000000');
 * const firstChild = predictChildHatId(parentId, 1);
 * console.log(firstChild.toString(16));
 * // Output: 0x0001000200030001000000000000000000000000
 */
export function predictChildHatId(
  parentHatId: bigint,
  childIndex: number,
): bigint {
  if (childIndex < 1 || childIndex > 65535) {
    throw new Error('Child index must be between 1 and 65535');
  }

  // Find the current level (highest non-zero level in parent ID)
  let currentLevel = 0;
  for (let i = 0; i < 16; i++) {
    // Extract 2 bytes at each level (from left to right)
    const levelValue = (parentHatId >> BigInt(16 * (15 - i))) & BigInt(0xffff);
    if (levelValue > 0n) {
      currentLevel = i;
    }
  }

  // Child will be at the next level
  const childLevel = currentLevel + 1;

  if (childLevel >= 16) {
    throw new Error('Maximum hat tree depth (16 levels) reached');
  }

  // Calculate child ID by setting the child index at the appropriate level
  const childIdAtLevel = BigInt(childIndex) << BigInt(16 * (15 - childLevel));

  // Combine parent ID with child position
  const predictedChildId = parentHatId | childIdAtLevel;

  return predictedChildId;
}

/**
 * Predicts the admin hat ID for a pod
 * Admin hat is always the first child of the management hat
 *
 * @param managementHatId - The management hat ID from Phase 1
 * @returns The predicted admin hat ID as bigint
 *
 * @example
 * const managementId = BigInt('366655357001228623453485877228625980940778025234769404');
 * const adminId = predictAdminHatId(managementId);
 * console.log('Admin HAT ID:', adminId.toString());
 */
export function predictAdminHatId(managementHatId: bigint): bigint {
  return predictChildHatId(managementHatId, 1);
}

/**
 * Validates a hat ID to ensure it's properly formatted
 *
 * @param hatId - The hat ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidHatId(hatId: bigint): boolean {
  // Hat ID should be positive
  if (hatId <= 0n) return false;

  // Hat ID should fit in 256 bits (32 bytes)
  const maxHatId = (BigInt(1) << BigInt(256)) - BigInt(1);
  if (hatId > maxHatId) return false;

  // Hat ID should have at least one non-zero level
  let hasNonZeroLevel = false;
  for (let i = 0; i < 16; i++) {
    const levelValue = (hatId >> BigInt(16 * (15 - i))) & BigInt(0xffff);
    if (levelValue > 0n) {
      hasNonZeroLevel = true;
      break;
    }
  }

  return hasNonZeroLevel;
}

/**
 * Gets the depth/level of a hat in the tree
 *
 * @param hatId - The hat ID to analyze
 * @returns The depth (0-15) of the hat in the tree
 *
 * @example
 * const hatId = BigInt('0x0001000200030000000000000000000000000000');
 * const depth = getHatDepth(hatId);
 * console.log(depth); // Output: 2 (3 levels counting from 0)
 */
export function getHatDepth(hatId: bigint): number {
  let depth = 0;
  for (let i = 0; i < 16; i++) {
    const levelValue = (hatId >> BigInt(16 * (15 - i))) & BigInt(0xffff);
    if (levelValue > 0n) {
      depth = i;
    }
  }
  return depth;
}

/**
 * Debug utility: Formats a hat ID for readable display
 *
 * @param hatId - The hat ID to format
 * @returns A formatted string showing the hierarchical structure
 *
 * @example
 * const hatId = BigInt('0x0001000200030001000000000000000000000000');
 * console.log(formatHatIdDebug(hatId));
 * // Output: "Level 0: 1, Level 1: 2, Level 2: 3, Level 3: 1"
 */
export function formatHatIdDebug(hatId: bigint): string {
  const levels: string[] = [];

  for (let i = 0; i < 16; i++) {
    const levelValue = (hatId >> BigInt(16 * (15 - i))) & BigInt(0xffff);
    if (levelValue > 0n) {
      levels.push(`Level ${i}: ${levelValue}`);
    }
  }

  return levels.join(', ') || 'Invalid hat ID';
}
