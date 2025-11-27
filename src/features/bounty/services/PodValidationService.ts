import { readContract } from 'wagmi/actions';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import BountyManagerABI from '@/abis/BountyManagerV2.json';
import PodAuthorizationFactoryABI from '@/abis/PodAuthorizationFactory.json';

// Get contract addresses from environment
const BOUNTY_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
const POD_AUTHORIZATION_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`) ||
  ('0xeCdDB060cD38439E0aC8874f159E961eB856407D' as `0x${string}`);

// Create a config for contract reads
const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

export interface PodValidationResult {
  isValid: boolean;
  contractPodId: string;
  error?: string;
}

// Cache for validation results to avoid repeated contract calls
const validationCache = new Map<string, PodValidationResult>();
const conversionCache = new Map<string, string>();

// Rate limiting
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 100; // 100ms minimum between calls

export class PodValidationService {
  /**
   * Delay between contract calls to avoid rate limiting
   */
  private static async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    if (timeSinceLastCall < MIN_CALL_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_CALL_INTERVAL - timeSinceLastCall),
      );
    }
    lastCallTime = Date.now();
  }

  /**
   * Get the pod service contract address from BountyManager
   */
  static async getPodServiceContract(): Promise<`0x${string}` | null> {
    try {
      await this.rateLimit();
      const podServiceAddress = (await readContract(config, {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BountyManagerABI,
        functionName: 'podServiceContract',
      })) as `0x${string}`;

      console.log('🏢 Pod service contract address:', podServiceAddress);
      return podServiceAddress;
    } catch (error) {
      console.error('❌ Failed to get pod service contract:', error);
      return null;
    }
  }

  /**
   * Validate if a pod ID exists in the PodAuthorizationFactory contract
   * This is what BountyManagerV2 uses to validate pods (via its podServiceContract pointer)
   */
  static async validatePodId(podId: string): Promise<PodValidationResult> {
    try {
      // If pod ID is empty, it's considered a public bounty (not valid for BountyManagerV2)
      if (!podId || podId.trim() === '') {
        return {
          isValid: false,
          contractPodId: '',
          error: 'Pod ID is required for bounty creation',
        };
      }

      // Check cache first
      if (validationCache.has(podId)) {
        console.log('✅ Using cached validation for pod:', podId);
        return validationCache.get(podId)!;
      }

      // Rate limit to avoid 429 errors
      await this.rateLimit();

      // Check if pod exists in PodAuthorizationFactory
      // BountyManagerV2 is configured to point to this contract
      const exists = (await readContract(config, {
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'isValidPod',
        args: [podId],
      })) as boolean;

      console.log('🔍 Pod validation result (PodAuthorizationFactory):', {
        podId,
        exists,
        note: 'BountyManagerV2.podServiceContract points to PodAuthorizationFactory',
      });

      const result = {
        isValid: exists,
        contractPodId: podId,
        error: exists
          ? undefined
          : 'Pod not registered in PodAuthorizationFactory contract',
      };

      // Cache the result
      validationCache.set(podId, result);
      return result;
    } catch (error) {
      console.error('❌ Pod validation failed:', error);
      const result = {
        isValid: false,
        contractPodId: podId,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      validationCache.set(podId, result);
      return result;
    }
  }

  /**
   * Convert database pod UUID to contract pod identifier
   * This handles the mapping between our database UUIDs and contract-recognized pod IDs
   *
   * IMPORTANT: The BountyManagerV2 contract requires a valid registered pod ID.
   * We use the database UUID directly as the pod ID since that's how pods are registered
   * in the PodBountyService contract via PodBlockchainSyncService.
   */
  static async convertDatabasePodToContractId(
    databasePodId: string,
  ): Promise<string> {
    try {
      // Check conversion cache first
      if (conversionCache.has(databasePodId)) {
        console.log('✅ Using cached conversion for pod:', databasePodId);
        return conversionCache.get(databasePodId)!;
      }

      // If empty or null, return the database ID directly
      // The contract will validate it via isValidPod()
      if (!databasePodId || databasePodId.trim() === '') {
        console.warn(
          '⚠️ No pod ID provided - bounty creation will likely fail without a valid pod',
        );
        const result = databasePodId || '';
        conversionCache.set(databasePodId, result);
        return result;
      }

      // Return the database UUID directly - it should be registered in PodBountyService
      // Pods are registered via PodBlockchainSyncService.generateRegisterPodCall()
      console.log(
        '✅ Using database pod ID directly for contract:',
        databasePodId,
      );

      const result = databasePodId;
      conversionCache.set(databasePodId, result);
      return result;
    } catch (error) {
      console.error('❌ Pod ID conversion failed:', error);
      // Return the original ID as fallback
      const result = databasePodId || '';
      conversionCache.set(databasePodId, result);
      return result;
    }
  }

  /**
   * Find a valid pod ID that can be used for public bounties
   * Tests different common values that might be accepted by the contract
   */
  static async findValidPublicBountyId(): Promise<string> {
    const publicBountyTestValues = [
      'public', // Common value for public items
      'general', // General purpose
      'open', // Open to all
      'none', // No pod restriction
      'global', // Global access
      '0', // Zero ID
      'default', // Default pod
      '', // Empty string
    ];

    console.log('🔍 Testing public bounty pod ID values...');

    for (const testValue of publicBountyTestValues) {
      try {
        const validation = await this.validatePodId(testValue);
        console.log(
          `  📝 Testing "${testValue}": ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`,
        );

        if (validation.isValid) {
          console.log(`✅ Found valid public bounty pod ID: "${testValue}"`);
          return testValue;
        }
      } catch (error) {
        console.log(`  📝 Testing "${testValue}": ❌ Error -`, error);
      }
    }

    // If nothing works, return empty string as fallback
    console.warn('⚠️ No valid public bounty pod ID found, using empty string');
    return '';
  }

  /**
   * Get all valid pod IDs from the contract (if such a function exists)
   * This is a helper function for debugging and understanding what pod IDs are valid
   */
  static async getValidPodIds(): Promise<string[]> {
    try {
      // This would require a function in the contract to list all pods
      // For now, we'll return an empty array and log that this needs implementation
      console.log(
        '🔧 getValidPodIds: Function not yet implemented in contract',
      );
      return [];
    } catch (error) {
      console.error('❌ Failed to get valid pod IDs:', error);
      return [];
    }
  }

  /**
   * Test the pod validation system with debugging
   */
  static async testPodValidation(
    testPodIds: string[] = ['', 'test-pod', 'invalid-pod'],
  ): Promise<void> {
    console.log('🧪 Testing pod validation system...');

    for (const podId of testPodIds) {
      const result = await this.validatePodId(podId);
      console.log(`Pod "${podId}":`, result);
    }
  }
}
