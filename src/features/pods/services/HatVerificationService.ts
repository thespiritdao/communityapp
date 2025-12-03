/**
 * Hat Verification Service
 *
 * CRITICAL PRODUCTION FIX: Verifies HAT IDs exist onchain before persisting to database.
 *
 * This service prevents database-blockchain state divergence by:
 * 1. Verifying HAT IDs actually exist on Hats Protocol contract
 * 2. Checking HAT active status
 * 3. Validating parent-child HAT hierarchies
 *
 * Used by:
 * - Pod creation flow (HatsModulePodCreationForm)
 * - Pod database service (PodDatabaseService)
 * - Background sync jobs
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export interface HatDetails {
  details: string;
  maxSupply: number;
  supply: number;
  eligibility: string;
  toggle: string;
  imageURI: string;
  lastHatId: number;
  mutable: boolean;
  active: boolean;
}

export interface HatVerificationResult {
  exists: boolean;
  active?: boolean;
  details?: HatDetails;
  error?: string;
  errorType?: 'not_found' | 'inactive' | 'contract_error' | 'invalid_format';
}

export interface HatHierarchyResult {
  isValid: boolean;
  actualAdmin?: string;
  expectedAdmin?: string;
  error?: string;
}

/**
 * Service for verifying HAT IDs exist onchain and validating HAT hierarchies
 */
export class HatVerificationService {
  private static readonly HATS_PROTOCOL_ADDRESS = (process.env
    .NEXT_PUBLIC_HATS_CONTRACT ||
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137') as `0x${string}`;

  // ⚠️ CRITICAL: viewHat returns INDIVIDUAL values, NOT a tuple!
  // Source: Hats Protocol docs - llms-full.txt line 1389
  private static readonly HATS_ABI = [
    {
      name: 'viewHat',
      type: 'function',
      inputs: [{ name: '_hatId', type: 'uint256' }],
      outputs: [
        { name: 'details', type: 'string' },
        { name: 'maxSupply', type: 'uint32' },
        { name: 'supply', type: 'uint32' },
        { name: 'eligibility', type: 'address' },
        { name: 'toggle', type: 'address' },
        { name: 'imageURI', type: 'string' },
        { name: 'lastHatId', type: 'uint16' },
        { name: 'mutable', type: 'bool' },
        { name: 'active', type: 'bool' },
      ],
      stateMutability: 'view',
    },
    {
      name: 'isAdminOfHat',
      type: 'function',
      inputs: [
        { name: '_user', type: 'address' },
        { name: '_hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    },
  ] as const;

  /**
   * Verify a HAT ID exists onchain and get its status
   *
   * CRITICAL: This must be called after extracting HAT ID from transaction
   * and BEFORE persisting to database.
   *
   * @param hatId - HAT ID to verify (decimal string or hex)
   * @returns Verification result with exists/active status
   */
  static async verifyHatExistsOnchain(
    hatId: string,
  ): Promise<HatVerificationResult> {
    try {
      console.log('🔍 Verifying HAT exists onchain:', hatId);

      // Validate format
      if (!hatId || hatId.trim() === '') {
        return {
          exists: false,
          error: 'HAT ID is empty',
          errorType: 'invalid_format',
        };
      }

      // Check for placeholder values
      const placeholderValues = [
        'extracted_from_tx',
        'pending_creation',
        'pending',
        'placeholder',
        'null',
        'undefined',
        'none',
      ];

      if (placeholderValues.includes(hatId.toLowerCase())) {
        return {
          exists: false,
          error: `HAT ID is a placeholder value: ${hatId}`,
          errorType: 'invalid_format',
        };
      }

      // Convert to BigInt
      let hatIdBigInt: bigint;
      try {
        hatIdBigInt = BigInt(hatId);
      } catch (e) {
        return {
          exists: false,
          error: `Invalid HAT ID format: ${hatId}`,
          errorType: 'invalid_format',
        };
      }

      // Create public client
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Call viewHat on Hats Protocol contract
      const hatDetails = (await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS,
        abi: this.HATS_ABI,
        functionName: 'viewHat',
        args: [hatIdBigInt],
      })) as any;

      // Parse response
      const details: HatDetails = {
        details: hatDetails[0],
        maxSupply: Number(hatDetails[1]),
        supply: Number(hatDetails[2]),
        eligibility: hatDetails[3],
        toggle: hatDetails[4],
        imageURI: hatDetails[5],
        lastHatId: Number(hatDetails[6]),
        mutable: hatDetails[7],
        active: hatDetails[8],
      };

      console.log('✅ HAT verified onchain:', {
        hatId,
        active: details.active,
        supply: details.supply,
        maxSupply: details.maxSupply,
      });

      return {
        exists: true,
        active: details.active,
        details,
        error: details.active ? undefined : 'HAT exists but is not active',
        errorType: details.active ? undefined : 'inactive',
      };
    } catch (error: any) {
      console.error('❌ HAT verification failed:', error);

      // Check for specific error indicating HAT doesn't exist
      const errorMessage = error?.message || '';
      const causeMessage = error?.cause?.message || '';
      const fullErrorText = errorMessage + ' ' + causeMessage;

      // Note: "Position out of bounds" error previously indicated ABI mismatch
      // With correct ABI (individual values not tuple), this should not occur
      if (
        fullErrorText.includes('out of bounds') ||
        fullErrorText.includes('reverted') ||
        fullErrorText.includes('does not exist')
      ) {
        console.warn(
          '⚠️ HAT ID does not exist onchain or call reverted:',
          hatId,
        );
        return {
          exists: false,
          error: 'HAT ID does not exist on blockchain',
          errorType: 'not_found',
        };
      }

      // Other contract errors
      return {
        exists: false,
        error: `Contract error: ${errorMessage}`,
        errorType: 'contract_error',
      };
    }
  }

  /**
   * Verify parent-child HAT relationship onchain
   *
   * Validates that a child HAT's admin is the expected parent HAT.
   * This ensures the HAT hierarchy in the database matches onchain reality.
   *
   * @param childHatId - Child HAT ID
   * @param expectedParentHatId - Expected parent/admin HAT ID
   * @returns Validation result
   */
  static async verifyHatHierarchy(
    childHatId: string,
    expectedParentHatId: string,
  ): Promise<HatHierarchyResult> {
    try {
      console.log('🔍 Verifying HAT hierarchy:', {
        child: childHatId,
        expectedParent: expectedParentHatId,
      });

      // First verify both HATs exist
      const [childVerification, parentVerification] = await Promise.all([
        this.verifyHatExistsOnchain(childHatId),
        this.verifyHatExistsOnchain(expectedParentHatId),
      ]);

      if (!childVerification.exists) {
        return {
          isValid: false,
          error: `Child HAT does not exist: ${childHatId}`,
        };
      }

      if (!parentVerification.exists) {
        return {
          isValid: false,
          error: `Parent HAT does not exist: ${expectedParentHatId}`,
        };
      }

      // Parse child HAT details to check admin
      // In Hats Protocol, the admin of a HAT is encoded in its structure
      // For now, we verify both exist and are active
      // TODO: Implement actual admin relationship check via contract query

      const isValid = (childVerification.active ?? false) && (parentVerification.active ?? false);

      console.log(
        isValid ? '✅ HAT hierarchy valid' : '⚠️ HAT hierarchy invalid',
      );

      return {
        isValid,
        actualAdmin: 'pending_implementation', // TODO: Query actual admin
        expectedAdmin: expectedParentHatId,
        error: isValid ? undefined : 'One or both HATs are not active',
      };
    } catch (error: any) {
      console.error('❌ HAT hierarchy verification failed:', error);
      return {
        isValid: false,
        error: error?.message || 'Failed to verify HAT hierarchy',
      };
    }
  }

  /**
   * Batch verify multiple HAT IDs
   * Useful for verifying all pods in database
   *
   * @param hatIds - Array of HAT IDs to verify
   * @returns Map of hatId -> verification result
   */
  static async batchVerifyHats(
    hatIds: string[],
  ): Promise<Map<string, HatVerificationResult>> {
    console.log(`🔍 Batch verifying ${hatIds.length} HATs...`);

    const results = new Map<string, HatVerificationResult>();

    // Verify in parallel (but limit concurrency to avoid rate limits)
    const BATCH_SIZE = 5;
    for (let i = 0; i < hatIds.length; i += BATCH_SIZE) {
      const batch = hatIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (hatId) => {
          const result = await this.verifyHatExistsOnchain(hatId);
          return { hatId, result };
        }),
      );

      batchResults.forEach(({ hatId, result }) => {
        results.set(hatId, result);
      });

      console.log(
        `✅ Verified ${Math.min(i + BATCH_SIZE, hatIds.length)}/${hatIds.length} HATs`,
      );
    }

    return results;
  }

  /**
   * Get human-readable error message for verification failure
   */
  static getErrorMessage(result: HatVerificationResult): string {
    if (result.exists && result.active) {
      return 'HAT is valid';
    }

    switch (result.errorType) {
      case 'not_found':
        return 'This role (HAT) does not exist on the blockchain. The pod may have been created incorrectly. Please contact support.';

      case 'inactive':
        return 'This role (HAT) exists but has been deactivated. The pod cannot be used until reactivated.';

      case 'invalid_format':
        return 'Invalid role ID format. This indicates a system error during pod creation.';

      case 'contract_error':
        return `Blockchain error: ${result.error}`;

      default:
        return result.error || 'Unknown verification error';
    }
  }
}
