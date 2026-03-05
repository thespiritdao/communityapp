import { HatToggleService } from './hatToggleService';
import type { PublicClient, WalletClient } from 'viem';
import { getClientHatId } from '@/lib/hatRegistryClient';

/**
 * Service for configuring HAT-based toggle modules for Pod roles
 * Replaces null toggle modules with actual HAT addresses to enable proper permission management
 */
export class HatModuleConfigurationService {
  /**
   * Check if a HAT needs its toggle module configured
   */
  static async needsToggleModuleConfiguration(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<{
    needsConfiguration: boolean;
    currentToggleModule: string;
    isNullToggle: boolean;
    reason?: string;
  }> {
    try {
      console.log('🔍 Checking toggle module configuration for HAT:', hatId);

      const hatDetails = await HatToggleService.readHat(publicClient, hatId);
      const { toggle } = hatDetails;

      const isNullToggle =
        toggle.toLowerCase() === '0x0000000000000000000000000000000000004a75';
      const isZeroAddress =
        toggle === '0x0000000000000000000000000000000000000000';

      console.log('📋 Current toggle module configuration:', {
        hatId,
        toggleModule: toggle,
        isNullToggle,
        isZeroAddress,
      });

      if (isNullToggle) {
        return {
          needsConfiguration: true,
          currentToggleModule: toggle,
          isNullToggle: true,
          reason:
            'Hat uses null toggle module which prevents permission management',
        };
      }

      if (isZeroAddress) {
        return {
          needsConfiguration: true,
          currentToggleModule: toggle,
          isNullToggle: false,
          reason: 'Hat has no toggle module assigned',
        };
      }

      return {
        needsConfiguration: false,
        currentToggleModule: toggle,
        isNullToggle: false,
        reason: 'Hat already has proper toggle module configured',
      };
    } catch (error) {
      console.error('❌ Failed to check toggle module configuration:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to check toggle configuration: ${error.message}`
          : 'Failed to check toggle configuration',
      );
    }
  }

  /**
   * Get the appropriate toggle HAT ID for a given pod role
   * For Executive Pod Member, use Executive Pod Leader HAT
   */
  static getToggleHatForRole(hatId: string): string | null {
    const executivePodLeader = getClientHatId('EXECUTIVE_POD_LEADER');

    // For other roles, you can add more mappings here
    // Example pattern: subordinate HATs are toggled by their parent/admin HATs
    void hatId;
    void executivePodLeader;

    console.log('⚠️ No specific toggle HAT mapping found for:', hatId);
    return null;
  }

  /**
   * Configure hat-based toggle module for a Pod role
   */
  static async configureHatBasedToggle(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    toggleHatId?: string,
  ): Promise<{
    success: boolean;
    transactionHash?: string;
    newToggleModule?: string;
    error?: string;
  }> {
    try {
      console.log('🔧 Configuring hat-based toggle module:', {
        hatId,
        toggleHatId,
      });

      // Ensure user is admin of the target HAT
      await HatToggleService.ensureAdmin(publicClient, walletClient, hatId);

      // Determine the appropriate toggle HAT
      const targetToggleHat = toggleHatId || this.getToggleHatForRole(hatId);

      if (!targetToggleHat) {
        throw new Error('No appropriate toggle HAT found for this role');
      }

      console.log('🎯 Setting toggle module to HAT:', targetToggleHat);

      // Read current configuration
      const before = await HatToggleService.readHat(publicClient, hatId);
      console.log('📋 Current configuration:', before);

      // Change toggle module to the specified HAT
      const transactionHash = await HatToggleService.changeToggle(
        walletClient,
        hatId,
        targetToggleHat as `0x${string}`,
      );

      console.log('🔄 Toggle module change transaction:', transactionHash);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      console.log('✅ Toggle module change confirmed');

      // Verify the change
      const after = await HatToggleService.readHat(publicClient, hatId);
      console.log('📋 New configuration:', after);

      if (after.toggle.toLowerCase() !== targetToggleHat.toLowerCase()) {
        throw new Error(
          `Toggle module change failed. Expected: ${targetToggleHat}, Got: ${after.toggle}`,
        );
      }

      console.log('✅ Hat-based toggle module successfully configured');

      return {
        success: true,
        transactionHash,
        newToggleModule: targetToggleHat,
      };
    } catch (error) {
      console.error('❌ Failed to configure hat-based toggle:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Configuration failed',
      };
    }
  }

  /**
   * Prepare toggle module configuration transaction for OnchainKit
   */
  static async prepareToggleModuleConfigurationTransaction(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    toggleHatId?: string,
  ): Promise<{
    transactionCall: any;
    account: string;
    isSponsored: boolean;
    targetToggleHat: string;
  }> {
    try {
      console.log('🔧 Preparing toggle module configuration transaction:', {
        hatId,
        toggleHatId,
      });

      // Get user account
      const [account] = await walletClient.getAddresses();

      // Ensure user is admin
      await HatToggleService.ensureAdmin(publicClient, walletClient, hatId);

      // Determine target toggle HAT
      const targetToggleHat = toggleHatId || this.getToggleHatForRole(hatId);

      if (!targetToggleHat) {
        throw new Error('No appropriate toggle HAT found for this role');
      }

      console.log('🎯 Preparing to set toggle module to HAT:', targetToggleHat);

      // Prepare the transaction call
      const transactionCall = {
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'changeHatToggle',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_newToggle', type: 'address' },
            ],
          },
        ],
        functionName: 'changeHatToggle',
        args: [BigInt(hatId), targetToggleHat as `0x${string}`],
      };

      console.log('📋 Prepared transaction call:', {
        function: 'changeHatToggle',
        hatId,
        newToggle: targetToggleHat,
      });

      return {
        transactionCall,
        account,
        isSponsored: true, // Hats Core operations can be sponsored
        targetToggleHat,
      };
    } catch (error) {
      console.error(
        '❌ Failed to prepare toggle module configuration transaction:',
        error,
      );
      throw error;
    }
  }

  /**
   * Check if all Pod roles have proper toggle module configuration
   */
  static async auditPodToggleModules(
    publicClient: PublicClient,
    podRoles: any[],
  ): Promise<{
    rolesNeedingConfiguration: any[];
    totalRoles: number;
    configurationNeeded: boolean;
  }> {
    const rolesNeedingConfiguration = [];

    for (const role of podRoles) {
      if (role.token_address) {
        try {
          const configCheck = await this.needsToggleModuleConfiguration(
            publicClient,
            role.token_address,
          );

          if (configCheck.needsConfiguration) {
            rolesNeedingConfiguration.push({
              ...role,
              configurationIssue: configCheck.reason,
              currentToggleModule: configCheck.currentToggleModule,
            });
          }
        } catch (error) {
          console.warn(
            `Failed to check configuration for role ${role.id}:`,
            error,
          );
        }
      }
    }

    return {
      rolesNeedingConfiguration,
      totalRoles: podRoles.length,
      configurationNeeded: rolesNeedingConfiguration.length > 0,
    };
  }
}

export default HatModuleConfigurationService;
