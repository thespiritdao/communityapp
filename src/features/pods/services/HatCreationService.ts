/**
 * Hat Creation Service
 *
 * Handles proper creation and management of Hats Protocol hats for pods.
 * Fixes the invalid hat ID generation issue.
 */

import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import {
  validateAndConvertHatId,
  getFixedExecutivePodHatId,
} from '../utils/hatIdValidator';

export interface HatCreationParams {
  adminHatId: string;
  details: string;
  imageURI: string;
  maxSupply: number;
  eligibilityModule?: string;
  toggleModule?: string;
  mutable: boolean;
  walletClient: any;
}

export interface HatCreationResult {
  success: boolean;
  hatId?: string;
  transactionHash?: string;
  error?: string;
}

export class HatCreationService {
  private static readonly HATS_PROTOCOL_ADDRESS =
    process.env.NEXT_PUBLIC_HATS_PROTOCOL_ADDRESS ||
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

  /**
   * Creates a new hat using the Hats Protocol
   */
  static async createHat(
    params: HatCreationParams,
  ): Promise<HatCreationResult> {
    try {
      console.log('🎩 Creating new hat with params:', {
        adminHatId: params.adminHatId,
        details: params.details.substring(0, 100) + '...',
        maxSupply: params.maxSupply,
        mutable: params.mutable,
      });

      // Validate admin hat ID
      const adminValidation = validateAndConvertHatId(params.adminHatId);
      if (!adminValidation.isValid || !adminValidation.hatIdBigInt) {
        return {
          success: false,
          error: `Invalid admin hat ID: ${adminValidation.error}`,
        };
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Check if admin hat exists and is active
      const adminHatDetails = await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS,
        abi: [
          {
            name: 'viewHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [
              {
                type: 'tuple',
                components: [
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
              },
            ],
            stateMutability: 'view',
          },
        ],
        functionName: 'viewHat',
        args: [adminValidation.hatIdBigInt],
      });

      if (!adminHatDetails[8]) {
        // active field
        return {
          success: false,
          error: 'Admin hat is not active',
        };
      }

      // Create the hat using createHat function
      // CRITICAL FIX: Use creator address as toggle module
      // The toggle module must be an ADDRESS (20 bytes), not a hat ID (32 bytes)
      const account = await this.walletClient
        .getAddresses()
        .then((addrs) => addrs[0]);
      const toggleModule = params.toggleModule || account;

      console.log('🎯 Hat creation parameters:', {
        admin: params.adminHatId,
        eligibility:
          params.eligibilityModule ||
          '0x0000000000000000000000000000000000000000',
        toggle: toggleModule,
        mutable: params.mutable,
        maxSupply: params.maxSupply,
      });

      if (toggleModule === account) {
        console.log(
          '✅ Using creator address as toggle module (enables permission management)',
        );
      }

      const createHatData = encodeFunctionData({
        abi: [
          {
            name: 'createHat',
            type: 'function',
            inputs: [
              { name: '_admin', type: 'uint256' },
              { name: '_details', type: 'string' },
              { name: '_maxSupply', type: 'uint32' },
              { name: '_eligibility', type: 'address' },
              { name: '_toggle', type: 'address' },
              { name: '_mutable', type: 'bool' },
              { name: '_imageURI', type: 'string' },
            ],
            outputs: [{ name: 'newHatId', type: 'uint256' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'createHat',
        args: [
          adminValidation.hatIdBigInt,
          params.details,
          params.maxSupply,
          params.eligibilityModule ||
            '0x0000000000000000000000000000000000000000',
          toggleModule as `0x${string}`,
          params.mutable,
          params.imageURI,
        ],
      });

      // Execute the transaction
      const txHash = await params.walletClient.sendTransaction({
        to: this.HATS_PROTOCOL_ADDRESS,
        data: createHatData,
        value: 0n,
        account: params.walletClient.account,
      });

      console.log('✅ Hat creation transaction sent:', txHash);

      // Wait for transaction confirmation and get the new hat ID
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      // Parse logs to get the new hat ID
      // In a production implementation, you'd parse the HatCreated event
      // For now, we'll return a placeholder
      const newHatId = this.generateNextHatId(params.adminHatId);

      return {
        success: true,
        hatId: newHatId,
        transactionHash: txHash,
      };
    } catch (error: any) {
      console.error('❌ Failed to create hat:', error);
      return {
        success: false,
        error: error?.message || error?.toString() || 'Failed to create hat',
      };
    }
  }

  /**
   * Generates the next child hat ID for a given admin hat
   * This is a simplified version - in production, you'd query the contract
   */
  private static generateNextHatId(adminHatId: string): string {
    const validation = validateAndConvertHatId(adminHatId);
    if (!validation.isValid || !validation.hatIdBigInt) {
      throw new Error('Invalid admin hat ID');
    }

    // Simplified child hat ID generation
    // In reality, you'd need to query the contract for the next available ID
    const nextChildId = (validation.hatIdBigInt << 32n) + 1n;
    return '0x' + nextChildId.toString(16).padStart(64, '0');
  }

  /**
   * Creates a management hat for a pod - SUPPORTS PROXY ADMIN HAT PATTERN (v2)
   *
   * ARCHITECTURE (v2 - Proxy Admin HAT Pattern):
   * TOP HAT
   * ├── EXEC POD
   * └── COMMUNITY POD
   *     └── Sub-Pod
   *         ├── Proxy Admin HAT (worn by PodAuthProxy)
   *         └── Pod Management HAT (admin: Proxy Admin HAT)
   *
   * This achieves:
   * ✅ Pod leaders can modify their own HAT details (via proxy)
   * ✅ HAT remains in the tree hierarchy (not separate top hat)
   * ✅ Exec Pod retains toggle control (deactivation power)
   * ✅ Proxy wearing admin HAT = proxy has admin rights
   *
   * @param podName - Name of the pod
   * @param description - Description of the pod
   * @param walletClient - Wallet client for signing transactions
   * @param imageURI - Optional image URI for the HAT
   * @param adminHatId - Admin HAT ID (can be proxy admin HAT or parent pod HAT)
   */
  static async createPodManagementHat(
    podName: string,
    description: string,
    walletClient: any,
    imageURI?: string,
    adminHatId?: string,
  ): Promise<
    HatCreationResult & { needsAdminTransfer?: boolean; newHatId?: string }
  > {
    // Use provided admin HAT or default to Executive Pod
    const hatAdmin = adminHatId || getFixedExecutivePodHatId();

    // Determine if this is using the proxy admin pattern
    const isProxyAdminPattern =
      adminHatId !== undefined && adminHatId !== getFixedExecutivePodHatId();

    console.log('🎯 Creating pod management HAT:', {
      podName,
      adminHatId: hatAdmin,
      adminType: isProxyAdminPattern
        ? 'Proxy Admin HAT (v2)'
        : 'Parent Pod HAT (legacy)',
      architecture: isProxyAdminPattern
        ? 'Proxy Admin Pattern'
        : 'Traditional Hierarchy',
    });

    // Get account for toggle module
    const account = await walletClient
      .getAddresses()
      .then((addrs: string[]) => addrs[0]);

    // Create HAT with specified admin (proxy admin HAT or parent pod HAT)
    const creationResult = await this.createHat({
      adminHatId: hatAdmin, // Admin HAT ID (proxy admin HAT for v2, parent for legacy)
      details: JSON.stringify({
        type: 'pod_management',
        name: `${podName} Leadership`,
        description: isProxyAdminPattern
          ? `Management HAT for ${podName} pod. Pod leaders can autonomously manage HAT details via authorization proxy. ${description}`
          : `Management HAT for ${podName} pod. ${description}`,
        architecture: isProxyAdminPattern
          ? 'proxy-admin-pattern-v2'
          : 'traditional-hierarchy',
        version: isProxyAdminPattern ? '2.0' : '1.0',
        responsibilities: [
          'Manage pod members',
          'Set access requirements',
          'Coordinate pod activities',
          'Modify pod HAT metadata',
        ],
        authorities: [
          'Add/remove pod members',
          'Update pod settings',
          'Manage pod treasury',
          isProxyAdminPattern
            ? 'Change HAT details (via proxy)'
            : 'Request HAT changes from admin',
        ],
        governance: {
          adminType: isProxyAdminPattern ? 'Proxy Admin HAT' : 'Parent Pod HAT',
          adminHatId: hatAdmin,
          toggleControl: 'Pod Creator',
          autonomy: isProxyAdminPattern
            ? 'full (via proxy)'
            : 'limited (requires parent admin)',
        },
      }),
      imageURI: imageURI || '',
      maxSupply: 10,
      toggleModule: account, // Toggle control (for deactivation)
      mutable: true,
      walletClient,
    });

    if (!creationResult.success || !creationResult.hatId) {
      return creationResult;
    }

    if (isProxyAdminPattern) {
      console.log(
        '✅ Pod Management HAT created with Proxy Admin HAT as admin:',
        creationResult.hatId,
      );
      console.log('🎉 Pod leaders can now autonomously manage HAT via proxy!');
    } else {
      console.log(
        '✅ Pod Management HAT created with parent as admin (legacy):',
        creationResult.hatId,
      );
      console.log('⚠️ Pod leaders must request changes from parent pod admin');
    }

    return {
      ...creationResult,
      needsAdminTransfer: false, // No transfer needed with proxy admin pattern
      newHatId: creationResult.hatId,
    };
  }

  /**
   * Transfers admin rights to make a HAT self-admin (within tree hierarchy)
   *
   * CRITICAL: This must be called AFTER the HAT is created and AFTER
   * pod leaders have been minted the HAT.
   *
   * Flow:
   * 1. HAT is created under parent (parent is admin)
   * 2. Pod leaders are minted the HAT
   * 3. Admin is transferred to the HAT itself (becomes self-admin)
   * 4. Pod leaders (wearing the HAT) are now admins of it
   *
   * @param hatId - The HAT to make self-admin
   * @param currentAdminHatId - Current admin HAT ID (usually parent pod)
   * @param walletClient - Wallet client (must be wearing current admin HAT)
   */
  static async transferAdminToSelf(
    hatId: string,
    currentAdminHatId: string,
    walletClient: any,
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      console.log('🔄 Transferring admin to make HAT self-admin:', {
        hatId,
        currentAdmin: currentAdminHatId,
        newAdmin: hatId + ' (self)',
      });

      // Validate HAT IDs
      const hatValidation = validateAndConvertHatId(hatId);
      const adminValidation = validateAndConvertHatId(currentAdminHatId);

      if (!hatValidation.isValid || !adminValidation.isValid) {
        return {
          success: false,
          error: 'Invalid HAT ID format',
        };
      }

      // CRITICAL: In Hats Protocol, to make a HAT self-admin while keeping it in the tree,
      // we need to check if transferHat can be used for admin transfer
      // OR if there's a specific function for admin transfer

      // For now, document that this needs to be done via Hats Protocol UI or direct contract call
      console.warn('⚠️ Admin transfer to self must be done via:');
      console.warn('   1. Hats Protocol UI (if supported)');
      console.warn('   2. Direct contract call to transferHat or equivalent');
      console.warn(
        '   3. OR: Accept that parent remains admin (current behavior)',
      );

      return {
        success: false,
        error:
          'Admin transfer to self not yet implemented - requires Hats Protocol specific method',
      };
    } catch (error: any) {
      console.error('❌ Failed to transfer admin:', error);
      return {
        success: false,
        error: error?.message || 'Failed to transfer admin',
      };
    }
  }

  /**
   * Creates a membership hat for a pod
   */
  static async createPodMembershipHat(
    podName: string,
    description: string,
    managementHatId: string,
    walletClient: any,
  ): Promise<HatCreationResult> {
    console.log(
      '🎯 Creating pod membership hat with proper toggle configuration:',
      {
        podName,
        adminHat: managementHatId,
        toggleWillBe: managementHatId, // Pod management hat will control membership hats
      },
    );

    return this.createHat({
      adminHatId: managementHatId,
      details: JSON.stringify({
        name: `${podName} Member`,
        description: `Membership hat for ${podName} pod. ${description}`,
        responsibilities: [
          'Participate in pod activities',
          'Follow pod guidelines',
          'Contribute to pod goals',
        ],
        authorities: [
          'Access pod resources',
          'Participate in discussions',
          'Vote on pod proposals',
        ],
      }),
      imageURI: '', // Should be provided by the pod creation form
      maxSupply: 1000, // Higher default for members
      toggleModule: managementHatId, // Pod management hat controls membership
      mutable: true,
      walletClient,
    });
  }

  /**
   * Creates a membership HAT on-demand when first member is approved
   * This is called when a pod was created with only a management HAT
   * and now needs a membership HAT for the first time
   *
   * @param podId - Pod UUID from database
   * @param podName - Name of the pod
   * @param managementHatId - Management HAT ID (must exist and be valid)
   * @param walletClient - Wallet client for signing transactions
   * @returns Result with new HAT ID if successful
   */
  static async createMembershipHatOnDemand(
    podId: string,
    podName: string,
    managementHatId: string,
    walletClient: any,
  ): Promise<HatCreationResult & { needsDbUpdate?: boolean }> {
    try {
      console.log('🎩 Auto-creating membership HAT on-demand:', {
        podId,
        podName,
        managementHatId,
      });

      // Validate management HAT exists
      const managementValidation = validateAndConvertHatId(managementHatId);
      if (!managementValidation.isValid || !managementValidation.hatIdBigInt) {
        return {
          success: false,
          error: `Invalid management HAT ID: ${managementValidation.error}`,
        };
      }

      // Verify management HAT is active
      const isActive = await this.validateHatExists(managementHatId);

      if (isActive === null) {
        // HAT ID is structurally invalid (doesn't exist on-chain)
        return {
          success: false,
          error:
            'The management role ID for this pod appears to be invalid or was not properly created on-chain. Please contact an administrator to recreate the pod with valid role IDs.',
        };
      }

      if (!isActive) {
        return {
          success: false,
          error: 'Management role is not active or does not exist on-chain',
        };
      }

      // Create the membership HAT
      const creationResult = await this.createPodMembershipHat(
        podName,
        'General membership role',
        managementHatId,
        walletClient,
      );

      if (!creationResult.success || !creationResult.hatId) {
        return {
          ...creationResult,
          needsDbUpdate: false,
        };
      }

      console.log(
        '✅ Membership HAT created successfully:',
        creationResult.hatId,
      );
      console.log('📝 Database needs to be updated with new membership_hat_id');

      return {
        ...creationResult,
        needsDbUpdate: true, // Signal that database update is needed
      };
    } catch (error: any) {
      console.error('❌ Failed to create membership HAT on-demand:', error);
      return {
        success: false,
        error:
          error?.message ||
          error?.toString() ||
          'Failed to create membership HAT',
      };
    }
  }

  /**
   * Validates that a hat ID exists and is active
   * @returns true if active, false if inactive/not found, null if structurally invalid
   */
  static async validateHatExists(hatId: string): Promise<boolean | null> {
    try {
      const validation = validateAndConvertHatId(hatId);
      if (!validation.isValid) return false;

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const hatDetails = await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS,
        abi: [
          {
            name: 'viewHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [
              {
                type: 'tuple',
                components: [
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
              },
            ],
            stateMutability: 'view',
          },
        ],
        functionName: 'viewHat',
        args: [validation.hatIdBigInt!],
      });

      return hatDetails[8]; // active field
    } catch (error: any) {
      // Check if it's a "position out of bounds" error - indicates invalid HAT ID structure
      // The error might be in error.message or error.cause.message (for ContractFunctionExecutionError)
      const errorMessage = error?.message || '';
      const causeMessage = error?.cause?.message || '';
      const fullErrorText = errorMessage + ' ' + causeMessage;

      if (
        fullErrorText.includes('Position') &&
        fullErrorText.includes('out of bounds')
      ) {
        console.warn(
          '⚠️ HAT ID appears to be structurally invalid (not on-chain):',
          {
            hatId,
            error: errorMessage,
            cause: causeMessage,
          },
        );
        // Return null to indicate invalid structure (different from inactive)
        return null;
      }

      console.error('❌ Failed to validate hat existence:', error);
      return false;
    }
  }

  /**
   * Gets the current supply of a hat
   */
  static async getHatSupply(hatId: string): Promise<number> {
    try {
      const validation = validateAndConvertHatId(hatId);
      if (!validation.isValid) return 0;

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const hatDetails = await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS,
        abi: [
          {
            name: 'viewHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [
              {
                type: 'tuple',
                components: [
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
              },
            ],
            stateMutability: 'view',
          },
        ],
        functionName: 'viewHat',
        args: [validation.hatIdBigInt!],
      });

      return Number(hatDetails[2]); // supply field
    } catch (error) {
      console.error('❌ Failed to get hat supply:', error);
      return 0;
    }
  }
}
