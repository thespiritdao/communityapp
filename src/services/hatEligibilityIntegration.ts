import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { EligibilityModuleService } from './eligibilityModuleService';

/**
 * Service for integrating eligibility criteria with HATs Protocol
 * Handles deployment and management of eligibility modules for pods
 */
export class HatEligibilityIntegration {
  private static readonly HATS_ADDRESS = process.env
    .NEXT_PUBLIC_HATS_ADDRESS as `0x${string}`;

  private static readonly HATS_ABI = parseAbi([
    'function mintHat(uint256 hatId, address to) external returns (bool success)',
    'function burnHat(uint256 hatId, address from) external',
    'function isWearerOfHat(address user, uint256 hatId) external view returns (bool isWearer)',
    'function isEligible(address user, uint256 hatId) external view returns (bool eligible)',
    'function changeHatEligibility(uint256 hatId, address newEligibility) external',
    'function changeHatToggle(uint256 hatId, address newToggle) external',
    'function getHatEligibilityModule(uint256 hatId) external view returns (address)',
    'function getHatToggleModule(uint256 hatId) external view returns (address)',
  ]);

  private static publicClient = createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
    ),
  });

  /**
   * Deploy and configure eligibility modules for a pod's HATs
   */
  static async deployPodEligibilityModules(
    podId: string,
    managementHatId: bigint,
    membershipHatId: bigint,
    leaderCriteria: any[],
    memberCriteria: any[],
    walletClient: any,
  ): Promise<{ success: boolean; deployments?: any[]; error?: string }> {
    try {
      console.log('🚀 Deploying eligibility modules for pod:', {
        podId,
        managementHatId: managementHatId.toString(),
        membershipHatId: membershipHatId?.toString(),
        leaderCriteriaCount: leaderCriteria.length,
        memberCriteriaCount: memberCriteria.length,
      });

      const deployments: any[] = [];

      // Deploy leader eligibility module if time-based criteria exist
      const leaderTimeCriteria = leaderCriteria.filter(
        (c) => c.type === 'time_based',
      );
      if (leaderTimeCriteria.length > 0) {
        console.log('🕐 Deploying leader time-based eligibility...');

        for (const criterion of leaderTimeCriteria) {
          const validFrom = criterion.valid_from
            ? new Date(criterion.valid_from)
            : null;
          const validUntil = criterion.valid_until
            ? new Date(criterion.valid_until)
            : null;

          const result = await EligibilityModuleService.addTimeBoundCriterion(
            managementHatId,
            validFrom,
            validUntil,
            criterion.requirement_type === 'required',
            walletClient,
          );

          if (!result.success) {
            throw new Error(
              `Failed to deploy leader eligibility: ${result.error}`,
            );
          }

          deployments.push({
            hatId: managementHatId.toString(),
            roleType: 'leader',
            criterionType: 'time_based',
            criterionName: criterion.name,
            txHash: result.txHash,
            validFrom: validFrom?.toISOString(),
            validUntil: validUntil?.toISOString(),
          });
        }
      }

      // Deploy member eligibility module if time-based criteria exist
      const memberTimeCriteria = memberCriteria.filter(
        (c) => c.type === 'time_based',
      );
      if (memberTimeCriteria.length > 0 && membershipHatId) {
        console.log('🕐 Deploying member time-based eligibility...');

        for (const criterion of memberTimeCriteria) {
          const validFrom = criterion.valid_from
            ? new Date(criterion.valid_from)
            : null;
          const validUntil = criterion.valid_until
            ? new Date(criterion.valid_until)
            : null;

          const result = await EligibilityModuleService.addTimeBoundCriterion(
            membershipHatId,
            validFrom,
            validUntil,
            criterion.requirement_type === 'required',
            walletClient,
          );

          if (!result.success) {
            throw new Error(
              `Failed to deploy member eligibility: ${result.error}`,
            );
          }

          deployments.push({
            hatId: membershipHatId.toString(),
            roleType: 'member',
            criterionType: 'time_based',
            criterionName: criterion.name,
            txHash: result.txHash,
            validFrom: validFrom?.toISOString(),
            validUntil: validUntil?.toISOString(),
          });
        }
      }

      console.log('✅ All eligibility modules deployed successfully');
      return { success: true, deployments };
    } catch (error: any) {
      console.error('❌ Failed to deploy eligibility modules:', error);
      return {
        success: false,
        error: error.message || 'Failed to deploy eligibility modules',
      };
    }
  }

  /**
   * Set eligibility module for a HAT
   */
  static async setHatEligibilityModule(
    hatId: bigint,
    eligibilityModuleAddress: `0x${string}`,
    walletClient: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.HATS_ADDRESS) {
        throw new Error('HATS address not configured');
      }

      console.log('🔧 Setting eligibility module for HAT:', {
        hatId: hatId.toString(),
        eligibilityModule: eligibilityModuleAddress,
      });

      const txHash = await walletClient.writeContract({
        address: this.HATS_ADDRESS,
        abi: this.HATS_ABI,
        functionName: 'changeHatEligibility',
        args: [hatId, eligibilityModuleAddress],
      });

      console.log('✅ HAT eligibility module set:', txHash);
      return { success: true, txHash };
    } catch (error: any) {
      console.error('❌ Failed to set HAT eligibility module:', error);
      return {
        success: false,
        error: error.message || 'Failed to set eligibility module',
      };
    }
  }

  /**
   * Check if a user is eligible for a HAT (considering time bounds)
   */
  static async checkHatEligibility(
    userAddress: `0x${string}`,
    hatId: bigint,
  ): Promise<{ eligible: boolean; reason?: string; expiration?: Date }> {
    try {
      if (!this.HATS_ADDRESS) {
        return { eligible: false, reason: 'HATS address not configured' };
      }

      // Check base HAT eligibility
      const isEligible = await this.publicClient.readContract({
        address: this.HATS_ADDRESS,
        abi: this.HATS_ABI,
        functionName: 'isEligible',
        args: [userAddress, hatId],
      });

      if (!isEligible) {
        return {
          eligible: false,
          reason: 'Does not meet HAT eligibility requirements',
        };
      }

      // Check eligibility module status
      const eligibilityResult = await EligibilityModuleService.checkEligibility(
        userAddress,
        hatId,
      );

      if (!eligibilityResult.eligible) {
        return {
          eligible: false,
          reason:
            eligibilityResult.error ||
            'Time-based eligibility criteria not met',
        };
      }

      return { eligible: true };
    } catch (error: any) {
      console.error('❌ Failed to check HAT eligibility:', error);
      return {
        eligible: false,
        reason: error.message || 'Failed to check eligibility',
      };
    }
  }

  /**
   * Get HAT eligibility module address
   */
  static async getHatEligibilityModule(
    hatId: bigint,
  ): Promise<`0x${string}` | null> {
    try {
      if (!this.HATS_ADDRESS) {
        return null;
      }

      const moduleAddress = await this.publicClient.readContract({
        address: this.HATS_ADDRESS,
        abi: this.HATS_ABI,
        functionName: 'getHatEligibilityModule',
        args: [hatId],
      });

      return moduleAddress === '0x0000000000000000000000000000000000000000'
        ? null
        : moduleAddress;
    } catch (error: any) {
      console.error('❌ Failed to get HAT eligibility module:', error);
      return null;
    }
  }

  /**
   * Monitor and enforce time-based membership expiration
   */
  static async enforceTimeBasedExpiration(
    podId: string,
    hatId: bigint,
  ): Promise<{ expired: string[]; errors: any[] }> {
    try {
      console.log(
        '⏰ Checking time-based expiration for HAT:',
        hatId.toString(),
      );

      const expired: string[] = [];
      const errors: any[] = [];

      // Get all current HAT wearers
      // Note: This would require a subgraph or event indexing to get all wearers efficiently
      // For now, we'll implement the structure for when that's available

      // Get hat criteria to check for time bounds
      const criteria = await EligibilityModuleService.getHatCriteria(hatId);

      if (criteria.length === 0) {
        console.log('ℹ️ No time-based criteria found for HAT');
        return { expired, errors };
      }

      console.log(`🔍 Found ${criteria.length} criteria to check`);

      // This would be implemented when we have a way to get all HAT wearers
      // For each wearer, check if they're still eligible
      // If not eligible due to time expiration, add to expired list

      return { expired, errors };
    } catch (error: any) {
      console.error('❌ Failed to enforce time-based expiration:', error);
      return { expired: [], errors: [error] };
    }
  }

  /**
   * Update time-based criteria for existing HAT
   */
  static async updateTimeBoundCriteria(
    hatId: bigint,
    newValidFrom: Date | null,
    newValidUntil: Date | null,
    walletClient: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Remove old time criteria and add new ones
      // This would require knowing the old criterion hash to remove it first

      const result = await EligibilityModuleService.addTimeBoundCriterion(
        hatId,
        newValidFrom,
        newValidUntil,
        true, // requireAll
        walletClient,
      );

      if (result.success) {
        console.log(
          '✅ Time-bound criteria updated for HAT:',
          hatId.toString(),
        );
      }

      return result;
    } catch (error: any) {
      console.error('❌ Failed to update time-bound criteria:', error);
      return {
        success: false,
        error: error.message || 'Failed to update criteria',
      };
    }
  }

  /**
   * Batch check eligibility for multiple users
   */
  static async batchCheckEligibility(
    userAddresses: `0x${string}`[],
    hatId: bigint,
  ): Promise<Map<string, { eligible: boolean; reason?: string }>> {
    const results = new Map<string, { eligible: boolean; reason?: string }>();

    try {
      const promises = userAddresses.map(async (address) => {
        const result = await this.checkHatEligibility(address, hatId);
        results.set(address.toLowerCase(), result);
      });

      await Promise.all(promises);
    } catch (error: any) {
      console.error('❌ Batch eligibility check failed:', error);
    }

    return results;
  }

  /**
   * Get time-based criteria summary for a HAT
   */
  static async getHatTimeBoundSummary(hatId: bigint): Promise<{
    hasTimeBounds: boolean;
    validFrom?: Date;
    validUntil?: Date;
    isActive: boolean;
    timeRemaining?: number;
  }> {
    try {
      const criteria = await EligibilityModuleService.getHatCriteria(hatId);

      if (criteria.length === 0) {
        return { hasTimeBounds: false, isActive: true };
      }

      // This is a simplified version - in practice we'd need to decode the criteria
      // to get the actual time bounds
      return {
        hasTimeBounds: true,
        isActive: true,
      };
    } catch (error: any) {
      console.error('❌ Failed to get time-bound summary:', error);
      return { hasTimeBounds: false, isActive: false };
    }
  }
}

export default HatEligibilityIntegration;
