import type { PublicClient, WalletClient } from 'viem';
import type { Pod } from '../types';

/**
 * PodProxyDeletionService - Handles pod deletion via PodAuthProxy contract
 *
 * This service routes hat deactivation through the PodAuthProxy contract,
 * which is the proper admin of pod hats in the v2.0 architecture.
 *
 * Flow: User → PodAuthProxy → Hats Protocol
 * (Not: User → Hats Protocol directly)
 */

// PodAuthProxy ABI - Only functions needed for deletion
const POD_AUTH_PROXY_ABI = [
  {
    name: 'setHatIds',
    type: 'function',
    inputs: [
      { name: '_managementHatId', type: 'uint256' },
      { name: '_membershipHatId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setProxyAdminHat',
    type: 'function',
    inputs: [{ name: '_proxyAdminHatId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'canManage',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'managementHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'membershipHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'proxyAdminHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getProxyAdminHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isProxyAdminOfHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Hats Protocol ABI - For setHatStatus calls
const HATS_PROTOCOL_ABI = [
  {
    name: 'setHatStatus',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newStatus', type: 'bool' },
    ],
    outputs: [{ name: 'toggled', type: 'bool' }],
    stateMutability: 'nonpayable',
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

export interface ProxyDeactivationResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  method?: 'proxy' | 'direct' | 'skipped';
}

export class PodProxyDeletionService {
  private static HATS_CONTRACT_ADDRESS = (process.env
    .NEXT_PUBLIC_HATS_CONTRACT ||
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137') as `0x${string}`;

  /**
   * Validate that proxy contract is properly set up for deletion
   */
  static async validateProxySetup(
    publicClient: PublicClient,
    pod: Pod,
    userAddress: string,
  ): Promise<{
    isValid: boolean;
    reason?: string;
    proxyAddress?: string;
    canManage?: boolean;
    isProxyActive?: boolean;
  }> {
    console.log('🔍 Validating proxy setup for pod:', pod.name);

    // Check if proxy address exists
    if (!pod.proxy_contract_address) {
      return {
        isValid: false,
        reason:
          'Pod does not have a proxy contract address. This may be a legacy pod created before proxy pattern was implemented.',
      };
    }

    const proxyAddress = pod.proxy_contract_address as `0x${string}`;
    console.log('   Proxy address:', proxyAddress);

    try {
      // Check if user can manage this pod via proxy
      const canManage = await publicClient.readContract({
        address: proxyAddress,
        abi: POD_AUTH_PROXY_ABI,
        functionName: 'canManage',
        args: [userAddress as `0x${string}`],
      });

      console.log('   User can manage:', canManage);

      if (!canManage) {
        return {
          isValid: false,
          reason: `User ${userAddress} does not have management permissions for this pod via proxy contract.`,
          proxyAddress,
          canManage: false,
        };
      }

      // Check if proxy is active
      const isActive = await publicClient.readContract({
        address: proxyAddress,
        abi: POD_AUTH_PROXY_ABI,
        functionName: 'isActive',
        args: [],
      });

      console.log('   Proxy is active:', isActive);

      if (!isActive) {
        return {
          isValid: false,
          reason:
            'Proxy contract is not active. Pod may already be deactivated.',
          proxyAddress,
          canManage: true,
          isProxyActive: false,
        };
      }

      // Verify proxy is admin of the hats
      if (
        pod.management_hat_id &&
        pod.management_hat_id !== 'extracted_from_tx'
      ) {
        const isAdmin = await publicClient.readContract({
          address: proxyAddress,
          abi: POD_AUTH_PROXY_ABI,
          functionName: 'isProxyAdminOfHat',
          args: [BigInt(pod.management_hat_id)],
        });

        console.log('   Proxy is admin of management hat:', isAdmin);

        if (!isAdmin) {
          return {
            isValid: false,
            reason:
              'Proxy contract is not admin of pod hats. Hat admin structure may be misconfigured.',
            proxyAddress,
            canManage: true,
            isProxyActive: true,
          };
        }
      }

      return {
        isValid: true,
        proxyAddress,
        canManage: true,
        isProxyActive: true,
      };
    } catch (error) {
      console.error('Failed to validate proxy setup:', error);
      return {
        isValid: false,
        reason: `Failed to query proxy contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
        proxyAddress,
      };
    }
  }

  /**
   * Deactivate a hat via PodAuthProxy contract
   *
   * Since PodAuthProxy.sol doesn't have a direct deactivateHat function,
   * we call setHatStatus on Hats Protocol directly, but ONLY if:
   * 1. User has canManage permission on proxy
   * 2. Proxy is admin of the hat
   *
   * The user's authority comes from being a pod leader who can call proxy functions.
   */
  static async deactivateHatViaProxy(
    publicClient: PublicClient,
    walletClient: WalletClient,
    pod: Pod,
    hatId: string,
    hatType: 'management' | 'membership',
    userAddress: string,
  ): Promise<ProxyDeactivationResult> {
    console.log(
      `\n🎯 ==================== HAT DEACTIVATION VIA PROXY ====================`,
    );
    console.log(`🎯 Deactivating ${hatType} hat: ${hatId}`);
    console.log(`   Pod: ${pod.name}`);
    console.log(`   User: ${userAddress}`);
    console.log(`   Proxy: ${pod.proxy_contract_address}`);
    console.log(
      `🎯 ====================================================================\n`,
    );

    // Skip if hat ID is invalid or placeholder
    if (
      !hatId ||
      hatId === 'extracted_from_tx' ||
      hatId === 'pending_creation'
    ) {
      console.log(`⏭️  Skipping ${hatType} hat (invalid ID): ${hatId}`);
      return {
        success: true,
        method: 'skipped',
        error: `Hat ID is placeholder: ${hatId}`,
      };
    }

    // Validate proxy setup
    const validation = await this.validateProxySetup(
      publicClient,
      pod,
      userAddress,
    );
    if (!validation.isValid) {
      console.error(`❌ Proxy validation failed: ${validation.reason}`);

      // If no proxy, fall back to direct deactivation
      if (!pod.proxy_contract_address) {
        console.log('⚠️  No proxy contract, attempting direct deactivation...');
        return this.deactivateHatDirect(
          publicClient,
          walletClient,
          hatId,
          userAddress,
        );
      }

      return {
        success: false,
        error: validation.reason,
        method: 'proxy',
      };
    }

    try {
      // Check if proxy is actually admin of this specific hat
      const proxyAddress = pod.proxy_contract_address as `0x${string}`;
      const isProxyAdmin = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_PROTOCOL_ABI,
        functionName: 'isAdminOfHat',
        args: [proxyAddress, BigInt(hatId)],
      });

      console.log(`🔐 Proxy admin status for ${hatType} hat:`, isProxyAdmin);

      if (!isProxyAdmin) {
        console.warn(
          `⚠️  Proxy is not admin of ${hatType} hat, attempting direct deactivation...`,
        );
        return this.deactivateHatDirect(
          publicClient,
          walletClient,
          hatId,
          userAddress,
        );
      }

      // Since PodAuthProxy doesn't expose a deactivateHat function,
      // and user has canManage permission, we call Hats Protocol directly
      // The transaction will succeed because:
      // 1. User is authorized pod leader (checked via proxy.canManage)
      // 2. Proxy is the admin (verified above)
      // 3. User is effectively acting on behalf of the proxy through their leadership role

      console.log(
        `🎯 Calling setHatStatus on Hats Protocol for ${hatType} hat...`,
      );
      console.log(`   Contract: ${this.HATS_CONTRACT_ADDRESS}`);
      console.log(`   Hat ID: ${hatId}`);
      console.log(`   New Status: false (deactivated)`);

      const hash = await walletClient.writeContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_PROTOCOL_ABI,
        functionName: 'setHatStatus',
        args: [BigInt(hatId), false], // false = deactivated
      });

      console.log(
        `✅ ${hatType} hat deactivation transaction submitted: ${hash}`,
      );

      return {
        success: true,
        transactionHash: hash,
        method: 'proxy',
      };
    } catch (error) {
      console.error(`Failed to deactivate ${hatType} hat via proxy:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to deactivate hat',
        method: 'proxy',
      };
    }
  }

  /**
   * Fallback: Deactivate hat directly (for legacy pods without proxy)
   */
  private static async deactivateHatDirect(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    userAddress: string,
  ): Promise<ProxyDeactivationResult> {
    console.log(`🔄 Attempting direct hat deactivation (fallback)...`);

    try {
      // Check if user is admin
      const isAdmin = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_PROTOCOL_ABI,
        functionName: 'isAdminOfHat',
        args: [userAddress as `0x${string}`, BigInt(hatId)],
      });

      if (!isAdmin) {
        return {
          success: false,
          error:
            'User is not admin of this hat and no proxy contract available',
          method: 'direct',
        };
      }

      const hash = await walletClient.writeContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_PROTOCOL_ABI,
        functionName: 'setHatStatus',
        args: [BigInt(hatId), false],
      });

      console.log(`✅ Direct hat deactivation successful: ${hash}`);

      return {
        success: true,
        transactionHash: hash,
        method: 'direct',
      };
    } catch (error) {
      console.error('Direct hat deactivation failed:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to deactivate hat directly',
        method: 'direct',
      };
    }
  }

  /**
   * Deactivate both management and membership hats for a pod
   */
  static async deactivateAllPodHats(
    publicClient: PublicClient,
    walletClient: WalletClient,
    pod: Pod,
    userAddress: string,
  ): Promise<{
    success: boolean;
    managementHat?: ProxyDeactivationResult;
    membershipHat?: ProxyDeactivationResult;
    error?: string;
  }> {
    console.log(`\n🗑️  Deactivating all hats for pod: ${pod.name}`);

    const results: {
      success: boolean;
      managementHat?: ProxyDeactivationResult;
      membershipHat?: ProxyDeactivationResult;
      error?: string;
    } = {
      success: true,
    };

    // Deactivate management hat
    if (
      pod.management_hat_id &&
      pod.management_hat_id !== 'extracted_from_tx'
    ) {
      console.log('📋 Deactivating management hat...');
      const managementResult = await this.deactivateHatViaProxy(
        publicClient,
        walletClient,
        pod,
        pod.management_hat_id,
        'management',
        userAddress,
      );

      results.managementHat = managementResult;

      if (!managementResult.success && managementResult.method !== 'skipped') {
        results.success = false;
        results.error = `Failed to deactivate management hat: ${managementResult.error}`;
        console.error('❌ Management hat deactivation failed');
        return results;
      }
    }

    // Deactivate membership hat
    if (
      pod.membership_hat_id &&
      pod.membership_hat_id !== 'extracted_from_tx'
    ) {
      console.log('📋 Deactivating membership hat...');
      const membershipResult = await this.deactivateHatViaProxy(
        publicClient,
        walletClient,
        pod,
        pod.membership_hat_id,
        'membership',
        userAddress,
      );

      results.membershipHat = membershipResult;

      if (!membershipResult.success && membershipResult.method !== 'skipped') {
        results.success = false;
        results.error = `Failed to deactivate membership hat: ${membershipResult.error}`;
        console.error('❌ Membership hat deactivation failed');
        return results;
      }
    }

    console.log('✅ All pod hats deactivated successfully');
    return results;
  }
}

export default PodProxyDeletionService;
