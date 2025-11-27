import { HatsCoreService } from '../../../services/hatsCoreService';
import { HatsToggleModuleService } from '../../../services/hatsToggleModuleService';
import type { PublicClient, WalletClient } from 'viem';

// HATS Protocol Contract Address
const HATS_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

// Module addresses for correct configuration
const HAT_CONTROLLED_MODULE =
  '0x50DA25530F76FcF83dA7457a97DC72042EE55373' as const; // should be the TOGGLE
const PASSTHROUGH_MODULE =
  '0xBDB317b6734Af8311460e457C74a0953f73B0704' as const; // should be the ELIGIBILITY

// Minimal ABIs for hat operations
const abiViewHat = [
  {
    name: 'viewHat',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'supply', type: 'uint32' },
      { name: 'eligibility', type: 'address' }, // [3]
      { name: 'toggle', type: 'address' }, // [4]
      { name: 'imageURI', type: 'string' },
      { name: 'lastHatId', type: 'uint16' },
      { name: 'mutable', type: 'bool' },
      { name: 'active', type: 'bool' },
    ],
  },
] as const;

const abiIsAdminOfHat = [
  {
    name: 'isAdminOfHat',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const abiChangeHatToggle = [
  {
    name: 'changeHatToggle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newToggle', type: 'address' },
    ],
  },
] as const;

const abiChangeHatEligibility = [
  {
    name: 'changeHatEligibility',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newEligibility', type: 'address' },
    ],
  },
] as const;

// For OnchainKit Transaction - we'll use the Hats SDK to prepare the transaction
export interface HatToggleTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export interface HatToggleResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Service for toggling HAT status using OnchainKit transactions
 */
export class HatToggleService {
  /**
   * Retry RPC calls with exponential backoff to handle rate limiting
   */
  private static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 1000,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isRateLimit =
          error.message?.includes('429') ||
          error.message?.includes('Too Many Requests') ||
          error.message?.includes('rate limit');

        if (isRateLimit && attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.log(
            `⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retry attempts exceeded');
  }

  /**
   * Get current HAT status from blockchain
   * Uses isActive() to get dynamic status; mechanistic toggles are reflected via core reads.
   */
  static async getCurrentHatStatus(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<{ isActive: boolean; error?: string }> {
    console.log('📊 READING HAT STATUS FROM HATS CORE');
    console.log('===================================');
    console.log(`🎯 Target HAT ID: ${hatId}`);
    console.log(`📍 HATS Contract: ${HATS_CONTRACT_ADDRESS}`);
    console.log('💡 Using simplified approach: direct isActive() call only');

    try {
      console.log('\n1️⃣ CALLING HATS CORE isActive()');
      console.log('-------------------------------');

      const isActive = await this.retryWithBackoff(async () => {
        return await publicClient.readContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'isActive',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [{ name: 'active', type: 'bool' }],
            },
          ],
          functionName: 'isActive',
          args: [BigInt(hatId)],
        });
      });

      console.log(`✅ HAT isActive() result: ${isActive}`);
      console.log(
        `🔍 This reflects the true HAT status controlled by toggle modules`,
      );

      // Optional: Get additional HAT details for debugging
      try {
        console.log('\n2️⃣ GETTING ADDITIONAL HAT DETAILS (DEBUG INFO)');
        console.log('----------------------------------------------');

        const hatDetails = await this.retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: HATS_CONTRACT_ADDRESS,
            abi: [
              {
                name: 'viewHat',
                type: 'function',
                stateMutability: 'view',
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
              },
            ],
            functionName: 'viewHat',
            args: [BigInt(hatId)],
          });
        });

        console.log(`📋 HAT Details (for context):`);
        console.log(`   - Max Supply: ${hatDetails[1]}`);
        console.log(`   - Current Supply: ${hatDetails[2]}`);
        console.log(`   - Eligibility Module: ${hatDetails[3]}`);
        console.log(`   - Toggle Module: ${hatDetails[4]}`);
        console.log(`   - Mutable: ${hatDetails[7]}`);
        console.log(`   - Active (from viewHat): ${hatDetails[8]}`);

        // Verify consistency between isActive() and viewHat.active
        if (isActive !== hatDetails[8]) {
          console.log('⚠️  INCONSISTENCY DETECTED!');
          console.log(`   - isActive(): ${isActive}`);
          console.log(`   - viewHat.active: ${hatDetails[8]}`);
          console.log(
            '💡 This may indicate a race condition or toggle module issue',
          );
        } else {
          console.log('✅ isActive() and viewHat.active are consistent');
        }

        // Analyze toggle module configuration
        const toggleModule = hatDetails[4];
        if (toggleModule === '0x0000000000000000000000000000000000000000') {
          console.log(
            '📝 No toggle module set - HAT uses default toggle behavior',
          );
        } else if (toggleModule.toLowerCase().startsWith('0x000000')) {
          console.log('🎩 Toggle module appears to be HAT-based');
          console.log(`   - Toggle HAT ID: ${toggleModule}`);
        } else {
          console.log('📄 Toggle module appears to be a contract');
          console.log(`   - Toggle Contract: ${toggleModule}`);
        }
      } catch (detailsError) {
        console.log('⚠️  Could not fetch additional HAT details for debugging');
        console.log(
          `   Error: ${detailsError instanceof Error ? detailsError.message : String(detailsError)}`,
        );
      }

      console.log(
        `\n✅ FINAL RESULT: HAT ${hatId} is ${isActive ? 'ACTIVE' : 'INACTIVE'}`,
      );
      console.log(
        '💡 This is the authoritative status from Hats Protocol core',
      );

      return {
        isActive,
      };
    } catch (error) {
      console.error('❌ FAILED TO GET HAT STATUS:', error);

      // Provide detailed error analysis
      let errorMessage = 'Failed to get HAT status';
      console.log('\n🚨 ERROR ANALYSIS');
      console.log('----------------');

      if (error instanceof Error) {
        if (
          error.message.includes('429') ||
          error.message.includes('rate limit')
        ) {
          errorMessage = 'Rate limited by RPC provider';
          console.log('⏱️  Issue: Rate limit detected');
          console.log(
            '💡 Solution: Wait and retry, or use different RPC endpoint',
          );
        } else if (error.message.includes('revert')) {
          errorMessage = 'Contract call reverted - HAT may not exist';
          console.log('🚨 Issue: Contract call reverted');
          console.log(
            `💡 Possible causes: HAT ID ${hatId} may not exist or be invalid`,
          );
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error - check connection';
          console.log('🌐 Issue: Network connectivity problem');
          console.log(
            '💡 Solution: Check internet connection and RPC endpoint',
          );
        } else {
          errorMessage = error.message;
          console.log(`🐛 Unexpected error: ${error.message}`);
        }
      } else {
        console.log(`❓ Unknown error type: ${String(error)}`);
      }

      console.log(`\n💔 RETURNING ERROR STATE: isActive = false`);
      console.log(`📝 Error message: ${errorMessage}`);

      return {
        isActive: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Diagnose HAT toggle permissions
   */
  static async diagnoseTogglePermissions(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    userAddress: string,
  ): Promise<{
    canToggle: boolean;
    hatDetails: any;
    toggleModule: string;
    adminHat: any;
    error?: string;
  }> {
    try {
      // Initialize Hats Core Service
      const hatsService = new HatsCoreService(publicClient, walletClient);
      await hatsService.initialize();

      // Get detailed HAT information
      const hatDetails = await hatsService.getHatDetails(hatId);

      console.log('🔍 HAT Details:', {
        hatId,
        status: hatDetails?.status,
        toggle: hatDetails?.toggle,
        admin: hatDetails?.admin,
        mutable: hatDetails?.mutable,
      });

      return {
        canToggle: false, // We'll determine this based on the details
        hatDetails,
        toggleModule: hatDetails?.toggle || 'Unknown',
        adminHat: hatDetails?.admin,
        error: 'Detailed analysis needed - check console logs',
      };
    } catch (error) {
      console.error('❌ Failed to diagnose HAT permissions:', error);
      return {
        canToggle: false,
        hatDetails: null,
        toggleModule: 'Unknown',
        adminHat: null,
        error:
          error instanceof Error ? error.message : 'Failed to get HAT details',
      };
    }
  }

  /**
   * Execute HAT toggle using Hats Modules SDK with setHatStatus
   * Based on Hats team guidance: Use Modules SDK and call setHatStatus on the module
   *
   * IMPORTANT DISTINCTION (per Hats team):
   * - STATUS: Whether a HAT is active/inactive (what toggles control)
   * - MUTABILITY: Whether a HAT can be modified/transferred
   *
   * This function manages HAT STATUS (active/inactive) via toggle modules.
   * Toggle modules control the "active" state, not the "mutable" property.
   */
  static async executeToggleTransaction(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    newStatus: boolean,
  ): Promise<HatToggleResult> {
    try {
      const [account] = await walletClient.getAddresses();

      // Read toggle address from core
      const viewHatAbi = [
        {
          name: 'viewHat',
          type: 'function',
          stateMutability: 'view',
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
        },
      ];

      const hat = await publicClient.readContract({
        address: HATS_CONTRACT_ADDRESS,
        abi: viewHatAbi,
        functionName: 'viewHat',
        args: [BigInt(hatId)],
      });

      const toggleAddr = hat[4] as `0x${string}`;

      // Is it a mechanistic toggle (contract) or humanistic (EOA/Safe)?
      const code = await publicClient.getCode({ address: toggleAddr });
      const isMechanistic = code && code !== '0x';

      if (isMechanistic) {
        // Mechanistic: ask core to PULL from module
        const hash = await walletClient.writeContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'checkHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_wearer', type: 'address' },
              ],
              outputs: [{ name: 'toggled', type: 'bool' }],
            },
          ],
          functionName: 'checkHatStatus',
          args: [BigInt(hatId), account as `0x${string}`],
          account,
          chain: walletClient.chain,
        });
        return { success: true, transactionHash: hash };
      } else {
        // Humanistic: the toggle address must submit setHatStatus
        if (toggleAddr.toLowerCase() !== account.toLowerCase()) {
          return {
            success: false,
            error:
              "Current account is not the hat's toggle. Switch to the toggle EOA or use the Safe.",
          };
        }
        const hash = await walletClient.writeContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'setHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_newStatus', type: 'bool' },
              ],
              outputs: [],
            },
          ],
          functionName: 'setHatStatus',
          args: [BigInt(hatId), newStatus],
          account,
          chain: walletClient.chain,
        });
        return { success: true, transactionHash: hash };
      }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Toggle failed' };
    }
  }

  /**
   * Execute admin toggle using Hats SDK changeHatStatus
   */
  static async executeAdminToggle(
    hatsService: HatsCoreService,
    hatId: string,
    newStatus: boolean,
  ): Promise<{ transactionHash: string }> {
    try {
      console.log('🔧 Executing admin toggle via changeHatStatus:', {
        hatId,
        newStatus,
      });

      const result = await hatsService.toggleHatStatusViaAdmin({
        hatId,
        newStatus,
      });

      console.log('✅ Admin toggle successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Admin toggle failed:', error);
      throw new Error(
        error instanceof Error
          ? `Admin toggle failed: ${error.message}`
          : 'Admin toggle failed with unknown error',
      );
    }
  }

  /**
   * Legacy method using direct wallet client (backup)
   */
  static async toggleHatStatusDirect(
    publicClient: PublicClient,
    walletClient: WalletClient,
    userAddress: string,
    hatId: string,
    newStatus: boolean,
  ): Promise<HatToggleResult> {
    try {
      // Validate permissions
      const validation = await this.validateTogglePermissions(
        publicClient,
        userAddress,
        hatId,
      );
      if (!validation.canToggle) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Check current status to avoid unnecessary transactions
      const currentStatus = await this.getCurrentHatStatus(publicClient, hatId);
      if (currentStatus.error) {
        return {
          success: false,
          error: currentStatus.error,
        };
      }

      if (currentStatus.isActive === newStatus) {
        return {
          success: false,
          error: `HAT is already ${newStatus ? 'active' : 'inactive'}`,
        };
      }

      // Get user account
      const [account] = await walletClient.getAddresses();

      // Execute transaction (simplified ABI for setHatStatus)
      const hash = await walletClient.writeContract({
        address: HATS_CONTRACT_ADDRESS,
        abi: [
          {
            name: 'setHatStatus',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'hatId', type: 'uint256' },
              { name: 'newStatus', type: 'bool' },
            ],
            outputs: [],
          },
        ],
        functionName: 'setHatStatus',
        args: [BigInt(hatId), newStatus],
        account,
        chain: walletClient.chain,
      });

      return {
        success: true,
        transactionHash: hash,
      };
    } catch (error) {
      console.error('Failed to toggle HAT status:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to toggle HAT status',
      };
    }
  }

  /**
   * Get comprehensive HAT information including status and mutability
   * Helps clarify the difference between STATUS and MUTABILITY
   */
  static async getHatStatusAndMutabilityInfo(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<{
    status: boolean; // Active/inactive (controlled by toggle modules)
    mutable: boolean; // Can be modified/transferred (set during HAT creation)
    exists: boolean;
    error?: string;
  }> {
    try {
      console.log('📋 Getting HAT status vs mutability info for:', hatId);

      // Read both status and mutability from the Hats contract
      const [isActive, hatData] = await Promise.all([
        // Check if HAT is active (STATUS - what toggles control)
        publicClient.readContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'isActive',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [{ name: 'active', type: 'bool' }],
            },
          ],
          functionName: 'isActive',
          args: [BigInt(hatId)],
        }),
        // Get HAT details including mutability
        publicClient.readContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'viewHat',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [
                { name: 'details', type: 'string' },
                { name: 'maxSupply', type: 'uint32' },
                { name: 'supply', type: 'uint32' },
                { name: 'eligibility', type: 'address' },
                { name: 'toggle', type: 'address' },
                { name: 'imageURI', type: 'string' },
                { name: 'lastHatId', type: 'uint16' },
                { name: 'mutable', type: 'bool' }, // MUTABILITY - set at creation
              ],
            },
          ],
          functionName: 'viewHat',
          args: [BigInt(hatId)],
        }),
      ]);

      console.log('📊 HAT Information:');
      console.log(
        '- STATUS (active/inactive):',
        isActive,
        '← This is what toggles control',
      );
      console.log(
        '- MUTABILITY (can be modified):',
        hatData[7],
        '← Set during HAT creation, not controlled by toggles',
      );
      console.log('- Toggle module:', hatData[4]);
      console.log('- Eligibility module:', hatData[3]);

      return {
        status: isActive,
        mutable: hatData[7],
        exists: true,
      };
    } catch (error) {
      console.error('❌ Failed to get HAT status and mutability:', error);
      return {
        status: false,
        mutable: false,
        exists: false,
        error:
          error instanceof Error ? error.message : 'Failed to get HAT info',
      };
    }
  }

  /**
   * Check if HAT contract address is configured
   */
  static isConfigured(): boolean {
    return Boolean(HATS_CONTRACT_ADDRESS);
  }

  /**
   * Get the contract address being used
   */
  static getContractAddress(): string {
    return HATS_CONTRACT_ADDRESS || '';
  }

  /**
   * Read the current toggle module for Executive Pod Member HAT from on-chain
   */
  static async readMemberToggle(publicClient: PublicClient) {
    const EXEC_MEMBER_HAT = process.env
      .NEXT_PUBLIC_EXECUTIVE_POD_MEMBER as string;

    const viewHatAbi = [
      {
        name: 'viewHat',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: '_hatId', type: 'uint256' }],
        outputs: [
          { name: 'details', type: 'string' },
          { name: 'maxSupply', type: 'uint32' },
          { name: 'supply', type: 'uint32' },
          { name: 'eligibility', type: 'address' },
          { name: 'toggle', type: 'address' }, // [4] - THIS is the toggle module
          { name: 'imageURI', type: 'string' },
          { name: 'lastHatId', type: 'uint16' },
          { name: 'mutable', type: 'bool' },
          { name: 'active', type: 'bool' },
        ],
      },
    ] as const;

    const hat = (await publicClient.readContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: viewHatAbi,
      functionName: 'viewHat',
      args: [BigInt(EXEC_MEMBER_HAT)],
    })) as any[];

    const toggle = hat[4] as `0x${string}`;
    const active = hat[8] as boolean;

    console.log(
      '🔍 Executive Pod Member on-chain toggle:',
      toggle,
      'active:',
      active,
    );
    return { toggle, active };
  }

  /**
   * Check if the connected wallet is admin of the Executive Pod Member HAT
   */
  static async checkAdmin(
    publicClient: PublicClient,
    walletClient: WalletClient,
  ) {
    const EXEC_MEMBER_HAT = process.env
      .NEXT_PUBLIC_EXECUTIVE_POD_MEMBER as string;

    const [addr] = await walletClient.getAddresses();
    const isAdmin = await publicClient.readContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: [
        {
          name: 'isAdminOfHat',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: '_user', type: 'address' },
            { name: '_hatId', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'isAdminOfHat',
      args: [addr, BigInt(EXEC_MEMBER_HAT)],
    });

    if (!isAdmin) {
      throw new Error(
        `Caller ${addr} is not admin of the Executive Pod Member hat`,
      );
    }

    console.log('✅ Confirmed admin access for:', addr);
    return addr;
  }

  /**
   * Change the toggle module for Executive Pod Member HAT (admin only)
   */
  static async changeToggle(
    walletClient: WalletClient,
    newToggle: `0x${string}`,
  ) {
    const EXEC_MEMBER_HAT = process.env
      .NEXT_PUBLIC_EXECUTIVE_POD_MEMBER as string;

    return walletClient.writeContract({
      address: HATS_CONTRACT_ADDRESS,
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
      args: [BigInt(EXEC_MEMBER_HAT), newToggle],
      chain: walletClient.chain,
    });
  }

  /**
   * Change the eligibility module for Executive Pod Member HAT (admin only)
   */
  static async changeEligibility(
    walletClient: WalletClient,
    newElig: `0x${string}`,
  ) {
    const EXEC_MEMBER_HAT = process.env
      .NEXT_PUBLIC_EXECUTIVE_POD_MEMBER as string;

    return walletClient.writeContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: [
        {
          name: 'changeHatEligibility',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_newEligibility', type: 'address' },
          ],
        },
      ],
      functionName: 'changeHatEligibility',
      args: [BigInt(EXEC_MEMBER_HAT), newElig],
      chain: walletClient.chain,
    });
  }

  /**
   * Read hat configuration from on-chain
   */
  static async readHat(publicClient: PublicClient, hatId: string) {
    const tuple = (await publicClient.readContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: abiViewHat,
      functionName: 'viewHat',
      args: [BigInt(hatId)],
    })) as any[];

    const eligibility = tuple[3] as `0x${string}`;
    const toggle = tuple[4] as `0x${string}`;
    const mutable = tuple[7] as boolean;
    const active = tuple[8] as boolean;

    console.log('🔎 current hat config', {
      eligibility,
      toggle,
      mutable,
      active,
    });
    return { eligibility, toggle, mutable, active };
  }

  /**
   * Ensure the caller is admin of the hat
   */
  static async ensureAdmin(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
  ) {
    const [addr] = await walletClient.getAddresses();
    const isAdmin = await publicClient.readContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: abiIsAdminOfHat,
      functionName: 'isAdminOfHat',
      args: [addr as `0x${string}`, BigInt(hatId)],
    });
    if (!isAdmin)
      throw new Error(`Caller ${addr} is not admin of hat ${hatId}`);
    return addr;
  }

  /**
   * Change the toggle module for a hat
   */
  static async changeToggle(
    walletClient: WalletClient,
    hatId: string,
    newToggle: `0x${string}`,
  ) {
    return walletClient.writeContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: abiChangeHatToggle,
      functionName: 'changeHatToggle',
      args: [BigInt(hatId), newToggle],
      chain: walletClient.chain,
    });
  }

  /**
   * Change the eligibility module for a hat
   */
  static async changeEligibility(
    walletClient: WalletClient,
    hatId: string,
    newElig: `0x${string}`,
  ) {
    return walletClient.writeContract({
      address: HATS_CONTRACT_ADDRESS,
      abi: abiChangeHatEligibility,
      functionName: 'changeHatEligibility',
      args: [BigInt(hatId), newElig],
      chain: walletClient.chain,
    });
  }

  /**
   * Swap modules to correct configuration:
   * - toggle = HatControlledModule
   * - eligibility = PassthroughModule
   */
  static async fixHatModules(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
  ) {
    console.log('🛠️ fixHatModules: start', { hatId, HATS_CONTRACT_ADDRESS });
    await this.ensureAdmin(publicClient, walletClient, hatId);

    const before = await this.readHat(publicClient, hatId);
    console.log('📋 BEFORE configuration:', before);

    // Change toggle first
    if (before.toggle.toLowerCase() !== HAT_CONTROLLED_MODULE.toLowerCase()) {
      console.log('🔄 Changing toggle to HatControlledModule...');
      const tx = await this.changeToggle(
        walletClient,
        hatId,
        HAT_CONTROLLED_MODULE,
      );
      console.log('🔁 changeHatToggle tx:', tx);

      // Wait for transaction to be mined
      console.log('⏳ Waiting for toggle change to be confirmed...');
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log('✅ Toggle change confirmed');
    } else {
      console.log('✅ toggle already correct');
    }

    // Change eligibility second
    if (before.eligibility.toLowerCase() !== PASSTHROUGH_MODULE.toLowerCase()) {
      console.log('🔄 Changing eligibility to PassthroughModule...');
      const tx = await this.changeEligibility(
        walletClient,
        hatId,
        PASSTHROUGH_MODULE,
      );
      console.log('🔁 changeHatEligibility tx:', tx);

      // Wait for transaction to be mined
      console.log('⏳ Waiting for eligibility change to be confirmed...');
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log('✅ Eligibility change confirmed');
    } else {
      console.log('✅ eligibility already correct');
    }

    // Read final configuration
    const after = await this.readHat(publicClient, hatId);
    console.log('📋 AFTER configuration:', after);
    console.log('✅ fixHatModules complete');

    // Detailed verification
    const toggleCorrect =
      after.toggle.toLowerCase() === HAT_CONTROLLED_MODULE.toLowerCase();
    const eligibilityCorrect =
      after.eligibility.toLowerCase() === PASSTHROUGH_MODULE.toLowerCase();

    console.log('🔍 Verification:');
    console.log(
      `- Toggle: ${toggleCorrect ? '✅' : '❌'} Expected: ${HAT_CONTROLLED_MODULE}, Got: ${after.toggle}`,
    );
    console.log(
      `- Eligibility: ${eligibilityCorrect ? '✅' : '❌'} Expected: ${PASSTHROUGH_MODULE}, Got: ${after.eligibility}`,
    );

    if (!toggleCorrect || !eligibilityCorrect) {
      throw new Error(
        `fixHatModules did not converge to the desired config. Toggle: ${toggleCorrect}, Eligibility: ${eligibilityCorrect}`,
      );
    }

    return after;
  }

  /**
   * Quick fix for eligibility module only (when toggle is already correct)
   */
  static async fixEligibilityOnly(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
  ) {
    console.log('🔧 Fixing eligibility module only...');
    await this.ensureAdmin(publicClient, walletClient, hatId);

    const current = await this.readHat(publicClient, hatId);
    console.log('📋 Current config:', current);

    if (
      current.eligibility.toLowerCase() !== PASSTHROUGH_MODULE.toLowerCase()
    ) {
      console.log('🔄 Changing eligibility to PassthroughModule...');
      const tx = await this.changeEligibility(
        walletClient,
        hatId,
        PASSTHROUGH_MODULE,
      );
      console.log('🔁 changeHatEligibility tx:', tx);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log('✅ Eligibility change confirmed');

      // Verify
      const after = await this.readHat(publicClient, hatId);
      console.log('📋 Final config:', after);

      return after;
    } else {
      console.log('✅ Eligibility already correct');
      return current;
    }
  }

  /**
   * Check the current status directly from the HatControlledModule
   */
  static async checkHatControlledModuleStatus(
    publicClient: PublicClient,
    hatId: string,
  ) {
    try {
      const status = await publicClient.readContract({
        address: HAT_CONTROLLED_MODULE,
        abi: [
          {
            name: 'getHatStatus',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'getHatStatus',
        args: [BigInt(hatId)],
      });

      console.log('🎯 HatControlledModule says hat should be:', status);
      return status;
    } catch (error) {
      console.error('❌ Failed to read from HatControlledModule:', error);
      throw error;
    }
  }

  /**
   * Try to find if HatControlledModule has a setter function
   */
  static async probeHatControlledModuleFunctions(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    newStatus: boolean,
  ) {
    console.log('🔍 Probing HatControlledModule for control functions...');

    const [account] = await walletClient.getAddresses();

    // Common function patterns for HatControlledModule
    const possibleFunctions = [
      {
        name: 'setHatStatus',
        abi: {
          name: 'setHatStatus',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_newStatus', type: 'bool' },
          ],
        },
      },
      {
        name: 'toggleHat',
        abi: {
          name: 'toggleHat',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_active', type: 'bool' },
          ],
        },
      },
      {
        name: 'setTargetStatus',
        abi: {
          name: 'setTargetStatus',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_status', type: 'bool' },
          ],
        },
      },
    ];

    for (const func of possibleFunctions) {
      try {
        console.log(`🧪 Testing function: ${func.name}`);

        // Try to call the function
        const hash = await walletClient.writeContract({
          address: HAT_CONTROLLED_MODULE,
          abi: [func.abi],
          functionName: func.name,
          args: [BigInt(hatId), newStatus],
          account,
          chain: walletClient.chain,
        });

        console.log(`✅ SUCCESS: ${func.name} transaction:`, hash);

        // Wait for confirmation
        await publicClient.waitForTransactionReceipt({ hash });

        // Check if status changed
        const statusAfter = await this.checkHatControlledModuleStatus(
          publicClient,
          hatId,
        );
        console.log(`📊 Status after ${func.name}:`, statusAfter);

        return {
          success: true,
          functionUsed: func.name,
          transactionHash: hash,
          newStatus: statusAfter,
        };
      } catch (error) {
        console.log(`❌ ${func.name} failed:`, error.message);
        continue;
      }
    }

    console.log('❌ No working control functions found on HatControlledModule');
    return { success: false, error: 'No control functions found' };
  }

  /**
   * Check if a module implements IHatsToggle.getHatStatus
   */
  static async moduleImplementsIHatsToggle(
    publicClient: PublicClient,
    moduleAddr: `0x${string}`,
    hatId: string,
  ): Promise<boolean> {
    try {
      const abiIHatsToggle = [
        {
          name: 'getHatStatus',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: '_hatId', type: 'uint256' }],
          outputs: [{ name: '', type: 'bool' }],
        },
      ] as const;

      await publicClient.readContract({
        address: moduleAddr,
        abi: abiIHatsToggle,
        functionName: 'getHatStatus',
        args: [BigInt(hatId)],
      });

      console.log('✅ Module implements IHatsToggle:', moduleAddr);
      return true;
    } catch {
      console.log('❌ Module does NOT implement IHatsToggle:', moduleAddr);
      return false;
    }
  }

  /**
   * Get known toggle module address for specific HATs from environment variables
   */
  static getKnownToggleModule(hatId: string): string | null {
    // Check if this is the Executive Pod Member HAT
    const executivePodMember = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;
    const executivePodMemberToggleModule =
      process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER_TOGGLE_MODULE;

    if (hatId === executivePodMember && executivePodMemberToggleModule) {
      console.log('🎯 Found known toggle module for Executive Pod Member HAT');
      return executivePodMemberToggleModule;
    }

    // Add more HAT ID mappings here as needed
    // Example:
    // if (hatId === process.env.NEXT_PUBLIC_OTHER_HAT && process.env.NEXT_PUBLIC_OTHER_HAT_TOGGLE_MODULE) {
    //   return process.env.NEXT_PUBLIC_OTHER_HAT_TOGGLE_MODULE;
    // }

    return null;
  }

  /**
   * Prepare TWO-STEP mechanistic HAT toggle transaction for OnchainKit
   * Step 1: setHatStatus on toggle module
   * Step 2: checkHatStatus on Hats Core to sync
   *
   * CRITICAL FIX: For humanistic toggles (EOA addresses), call setHatStatus directly on Hats contract
   * to avoid "Self calls are not allowed" error from Coinbase Smart Wallet
   */
  static async prepareTwoStepToggleTransaction(
    publicClient: PublicClient,
    walletClient: WalletClient,
    toggleModuleAddress: string,
    hatId: string,
    newStatus: boolean,
  ): Promise<{
    transactionCalls: any[];
    account: string;
    isSponsored: boolean;
  }> {
    try {
      console.log(
        '🔧 NEW FIXED CODE: Preparing toggle transaction with EOA detection:',
        {
          toggleModuleAddress,
          hatId,
          newStatus,
          timestamp: new Date().toISOString(),
        },
      );

      // Get user account
      const [account] = await walletClient.getAddresses();

      // Check if toggle module is null/special
      const isNullToggleModule =
        toggleModuleAddress.toLowerCase() ===
        '0x0000000000000000000000000000000000004a75';
      const isPassthroughModule =
        toggleModuleAddress.toLowerCase() ===
        HATS_CONTRACT_ADDRESS.toLowerCase();

      if (isNullToggleModule || isPassthroughModule) {
        console.log(
          '🎯 NULL TOGGLE MODULE DETECTED - Using direct Hats contract approach',
        );
        console.log(`   Toggle module: ${toggleModuleAddress}`);
        console.log(`   Strategy: Call setHatStatus directly on Hats contract`);

        // For null toggle modules, call setHatStatus directly on Hats contract
        const transactionCall = {
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'setHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_newStatus', type: 'bool' },
              ],
              outputs: [{ name: 'toggled', type: 'bool' }],
            },
          ],
          functionName: 'setHatStatus',
          args: [BigInt(hatId), newStatus],
        };

        console.log('📋 Prepared null toggle transaction:', {
          target: HATS_CONTRACT_ADDRESS,
          function: 'setHatStatus',
          hatId,
          newStatus,
        });

        return {
          transactionCalls: [transactionCall],
          account,
          isSponsored: true,
        };
      }

      // Check if toggle module is an EOA (humanistic toggle)
      console.log(
        '🔍 Checking if toggle module is EOA (humanistic) or contract (mechanistic)...',
      );
      const contractCode = await publicClient.getCode({
        address: toggleModuleAddress as `0x${string}`,
      });

      console.log('🔍 DEBUG: getCode result:', {
        address: toggleModuleAddress,
        contractCode,
        codeLength: contractCode?.length,
        isUndefined: contractCode === undefined,
        isNull: contractCode === null,
        isEmpty: contractCode === '',
        isZeroX: contractCode === '0x',
      });

      // CRITICAL FIX: Coinbase Smart Wallets are contracts but should be treated as humanistic toggles
      // Check if this is the user's own wallet address (Coinbase Smart Wallet or EOA)
      const isEOA = !contractCode || contractCode === '0x';
      const isUserWallet =
        toggleModuleAddress.toLowerCase() === account.toLowerCase();
      const shouldUseDirectHatsContract = isEOA || isUserWallet;

      console.log('🎯 EOA/Wallet Detection Result:', {
        isEOA,
        isUserWallet,
        shouldUseDirectHatsContract,
        reason: shouldUseDirectHatsContract
          ? isEOA
            ? 'Traditional EOA'
            : 'User wallet (Smart Wallet)'
          : 'External contract module',
      });

      if (shouldUseDirectHatsContract) {
        console.log(
          '🎯 HUMANISTIC TOGGLE DETECTED - Using direct Hats contract approach',
        );
        console.log(`   Toggle module: ${toggleModuleAddress}`);
        console.log(`   User account: ${account}`);
        console.log(
          `   Type: ${isEOA ? 'Traditional EOA' : 'Smart Wallet (still user-controlled)'}`,
        );
        console.log(
          `   Strategy: Call setHatStatus directly on Hats contract to avoid self-call error`,
        );

        // CRITICAL FIX: For humanistic toggles (EOA addresses), call setHatStatus directly on Hats contract
        // This avoids the "Self calls are not allowed" error from Coinbase Smart Wallet
        const transactionCall = {
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'setHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_newStatus', type: 'bool' },
              ],
              outputs: [{ name: 'toggled', type: 'bool' }],
            },
          ],
          functionName: 'setHatStatus',
          args: [BigInt(hatId), newStatus],
        };

        console.log(
          '📋 Prepared humanistic toggle transaction (direct Hats contract call):',
          {
            target: HATS_CONTRACT_ADDRESS,
            function: 'setHatStatus',
            hatId,
            newStatus,
            reason: isEOA
              ? 'EOA toggle module'
              : 'User wallet (Smart Wallet) - avoiding self-call error',
          },
        );

        return {
          transactionCalls: [transactionCall],
          account,
          isSponsored: true,
        };
      }

      console.log(
        '✅ MECHANISTIC TOGGLE DETECTED (Contract) - Using two-step approach',
      );
      console.log(`   Toggle module contract: ${toggleModuleAddress}`);
      console.log(
        '🔧 Using TWO-STEP approach: 1) setHatStatus on module, 2) checkHatStatus on core',
      );

      // STEP 1: Write new status to the toggle module
      console.log(
        `💡 Step 1: Calling setHatStatus(${hatId}, ${newStatus}) on module ${toggleModuleAddress}`,
      );

      const step1TransactionCall = {
        address: toggleModuleAddress as `0x${string}`,
        abi: [
          {
            name: 'setHatStatus',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_newStatus', type: 'bool' },
            ],
            outputs: [],
          },
        ],
        functionName: 'setHatStatus',
        args: [BigInt(hatId), newStatus],
      };

      // STEP 2: Sync with Hats Core
      console.log('🔧 STEP 2: Syncing with Hats Core...');
      console.log(
        `💡 Calling checkHatStatus(${hatId}) on Hats Core to pull updated status`,
      );

      const step2TransactionCall = {
        address: HATS_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'checkHatStatus',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [{ name: 'toggled', type: 'bool' }],
          },
        ],
        functionName: 'checkHatStatus',
        args: [BigInt(hatId)],
      };

      console.log('🎯 Prepared two-step transaction calls:');
      console.log('  Step 1 (write to module):', {
        address: step1TransactionCall.address,
        functionName: step1TransactionCall.functionName,
        args: step1TransactionCall.args,
      });
      console.log('  Step 2 (sync with core):', {
        address: step2TransactionCall.address,
        functionName: step2TransactionCall.functionName,
        args: step2TransactionCall.args,
      });

      // Return both transaction calls for OnchainKit Transaction component
      // NOTE: Step 1 (module write) may not be sponsorable, Step 2 (core sync) typically is
      console.log(
        '⚠️  SPONSORSHIP NOTE: Toggle module write may not be sponsored, but Hats Core sync should be',
      );

      return {
        transactionCalls: [step1TransactionCall, step2TransactionCall],
        account,
        isSponsored: true, // Try sponsorship - OnchainKit will handle sponsorship policy issues gracefully
      };
    } catch (error) {
      console.error('❌ Two-step toggle preparation failed:', error);
      throw new Error(
        error instanceof Error
          ? `Two-step toggle preparation failed: ${error.message}`
          : 'Two-step toggle preparation failed with unknown error',
      );
    }
  }

  /**
   * Prepare HAT toggle transaction for OnchainKit with sponsorship support
   * Uses checkHatStatus on HATS contract (protocol-recommended approach)
   * DEPRECATED: Use prepareTwoStepToggleTransaction for mechanistic toggles
   */
  static async prepareToggleTransaction(
    publicClient: PublicClient,
    walletClient: WalletClient,
    toggleModuleAddress: string,
    hatId: string,
    newStatus: boolean,
  ): Promise<{ transactionCall: any; account: string; isSponsored: boolean }> {
    try {
      console.log(
        '⚠️ DEPRECATED: Use prepareTwoStepToggleTransaction for mechanistic toggles',
      );
      console.log('🔧 Triggering HAT status check via HATS protocol:', {
        toggleModuleAddress,
        hatId,
        newStatus,
        approach: 'checkHatStatus on HATS contract (INCOMPLETE - only step 2)',
      });

      // Get user account
      const [account] = await walletClient.getAddresses();

      // Verify the contract exists
      const contractCode = await publicClient.getCode({
        address: toggleModuleAddress as `0x${string}`,
      });

      if (!contractCode || contractCode === '0x') {
        throw new Error(
          `Toggle module contract not found at address: ${toggleModuleAddress}`,
        );
      }

      console.log(
        '✅ Toggle module contract verified at:',
        toggleModuleAddress,
      );

      // OLD APPROACH: Only step 2 (sync) without step 1 (write to module)
      // This is why the toggle wasn't working - we were only pulling the existing status
      console.log(
        '🔧 Using checkHatStatus to trigger protocol status update...',
      );
      console.log(
        '💡 WARNING: This only syncs existing status, does not change module status',
      );

      // Prepare transaction call for OnchainKit with sponsorship
      const transactionCall = {
        address: HATS_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'checkHatStatus',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [{ name: 'toggled', type: 'bool' }],
          },
        ],
        functionName: 'checkHatStatus',
        args: [BigInt(hatId)],
      };

      console.log(
        '🎯 Prepared transaction call for OnchainKit:',
        transactionCall,
      );

      // Return the transaction call for OnchainKit Transaction component
      return {
        transactionCall,
        account,
        isSponsored: true, // Enable sponsorship for HAT toggles
      };
    } catch (error) {
      console.error('❌ setHatStatus direct call failed:', error);
      throw new Error(
        error instanceof Error
          ? `setHatStatus call failed: ${error.message}`
          : 'setHatStatus call failed with unknown error',
      );
    }
  }

  /**
   * Execute HAT toggle using the official Hats Modules SDK
   */
  static async executeHatsModulesSDKToggle(
    publicClient: PublicClient,
    walletClient: WalletClient,
    toggleModuleAddress: string,
    hatId: string,
    newStatus: boolean,
    userAddress: string,
  ): Promise<{ transactionHash: string }> {
    try {
      console.log('🏭 Initializing Hats Modules SDK for toggle operation...', {
        toggleModuleAddress,
        hatId,
        newStatus,
        userAddress,
      });

      // Initialize the Hats Toggle Module Service
      const moduleService = new HatsToggleModuleService(
        publicClient,
        walletClient,
      );
      await moduleService.initialize();

      console.log('✅ Hats Modules SDK initialized successfully');

      // Check if module is deployed
      const isDeployed =
        await moduleService.isModuleDeployed(toggleModuleAddress);
      if (!isDeployed) {
        throw new Error(
          `Toggle module not deployed at address: ${toggleModuleAddress}`,
        );
      }

      console.log(
        '✅ Toggle module contract verified at:',
        toggleModuleAddress,
      );

      // Execute the toggle via the Modules SDK using systematic approach
      const result = await moduleService.toggleHatViaAllModules(
        toggleModuleAddress,
        hatId,
        newStatus,
        userAddress,
      );

      if (result.status === 'success' && result.transactionHash) {
        console.log('✅ Hats Modules SDK toggle successful:', {
          transactionHash: result.transactionHash,
          moduleId: result.moduleId,
        });

        return { transactionHash: result.transactionHash };
      } else {
        throw new Error(`Toggle failed via Modules SDK: ${result.status}`);
      }
    } catch (error) {
      console.error('❌ Hats Modules SDK toggle failed:', error);
      throw new Error(
        error instanceof Error
          ? `Hats Modules SDK toggle failed: ${error.message}`
          : 'Hats Modules SDK toggle failed with unknown error',
      );
    }
  }

  /**
   * Diagnose toggle module permissions and configuration
   */
  static async diagnoseToggleModulePermissions(
    publicClient: PublicClient,
    toggleModuleAddress: string,
    hatId: string,
    userAddress: string,
  ): Promise<void> {
    try {
      console.log('🔬 Diagnosing toggle module permissions...');
      console.log(`- Module: ${toggleModuleAddress}`);
      console.log(`- HAT ID: ${hatId}`);
      console.log(`- User: ${userAddress}`);

      // Try to read common toggle module state variables
      const commonReadFunctions = [
        // For SimpleToggleModule style contracts
        {
          name: 'hatControllers',
          abi: {
            name: 'hatControllers',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: '', type: 'uint256' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        },
        // Alternative: hatStatus
        {
          name: 'hatStatus',
          abi: {
            name: 'hatStatus',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: '', type: 'uint256' }],
            outputs: [{ name: '', type: 'bool' }],
          },
        },
      ];

      for (const func of commonReadFunctions) {
        try {
          const result = await publicClient.readContract({
            address: toggleModuleAddress as `0x${string}`,
            abi: [func.abi],
            functionName: func.name,
            args: [BigInt(hatId), userAddress as `0x${string}`],
          });

          console.log(`✅ ${func.name}(${hatId}):`, result);

          if (func.name === 'hatControllers' && result) {
            console.log('🎯 Controller HAT ID found:', result.toString());
            console.log(
              '💡 You need to wear this controller HAT to toggle the target HAT',
            );
          }
        } catch (readError) {
          console.log(`❌ Cannot read ${func.name}:`, readError.message);
        }
      }
    } catch (error) {
      console.log('⚠️  Toggle module diagnosis failed:', error.message);
      console.log(
        '💡 This is expected if the contract uses a different interface',
      );
    }
  }

  /**
   * Prepare HAT toggle transaction for OnchainKit Transaction component with sponsorship
   * Uses native Hats Protocol checkHatStatus function for humanistic toggles
   */
  static async prepareHatToggleForOnchainKit(
    publicClient: PublicClient,
    walletClient: WalletClient,
    hatId: string,
    newStatus: boolean,
  ): Promise<{ transactionCall: any; isSponsored: boolean }> {
    try {
      console.log(
        '🔧 Preparing HAT toggle for OnchainKit Transaction component:',
        {
          hatId,
          newStatus,
        },
      );

      // First validate permissions to determine toggle type
      const [account] = await walletClient.getAddresses();
      const validation = await this.validateTogglePermissions(
        publicClient,
        account,
        hatId,
      );

      console.log('🔍 Toggle validation result:', validation.details?.reason);

      // CRITICAL FIX: Branch based on toggle type (humanistic vs mechanistic)
      if (validation?.details?.reason === 'HUMANISTIC_TOGGLE_AUTHORIZED') {
        console.log(
          '🔄 HUMANISTIC TOGGLE: Using setHatStatus for PassthroughModule',
        );
        console.log(
          '💡 PassthroughModule requires PUSH via setHatStatus, not PULL via checkHatStatus',
        );

        // Humanistic path: push the new status
        const transactionCall = {
          address: HATS_CONTRACT_ADDRESS as `0x${string}`,
          abi: [
            {
              name: 'setHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_newStatus', type: 'bool' },
              ],
              outputs: [{ name: 'toggled', type: 'bool' }],
            },
          ],
          functionName: 'setHatStatus',
          args: [BigInt(hatId), newStatus],
        };

        console.log(
          '✅ Transaction prepared: setHatStatus for humanistic toggle',
        );
        console.log('⚠️  Sponsorship disabled to avoid Coinbase policy issues');

        return {
          transactionCall,
          isSponsored: false, // Start with false to rule out policy issues
        };
      } else if (validation?.details?.reason === 'MECHANISTIC_TOGGLE') {
        console.log(
          '🔄 MECHANISTIC TOGGLE: Using checkHatStatus for IHatsToggle module',
        );
        console.log('💡 IHatsToggle modules require PULL via checkHatStatus');

        // Mechanistic path: pull from module
        const transactionCall = {
          address: HATS_CONTRACT_ADDRESS as `0x${string}`,
          abi: [
            {
              name: 'checkHatStatus',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [{ name: 'toggled', type: 'bool' }],
            },
          ],
          functionName: 'checkHatStatus',
          args: [BigInt(hatId)],
        };

        console.log(
          '✅ Transaction prepared: checkHatStatus for mechanistic toggle',
        );
        console.log('✅ Sponsorship enabled for mechanistic toggles');

        return {
          transactionCall,
          isSponsored: true,
        };
      } else {
        // User is not authorized or validation failed
        console.error('❌ Toggle validation failed:', validation);
        throw new Error(
          validation.error || 'You do not have permission to toggle this hat',
        );
      }
    } catch (error) {
      console.error('❌ Failed to prepare HAT toggle transaction:', error);
      throw error;
    }
  }

  /**
   * Validate if the current user has permissions to toggle a specific HAT
   * Uses Hats Protocol core to check toggle module configuration and permissions
   */
  static async validateTogglePermissions(
    publicClient: PublicClient,
    userAddress: string,
    hatId: string,
  ): Promise<{ canToggle: boolean; error?: string; details?: any }> {
    console.log('🔐 VALIDATING TOGGLE PERMISSIONS');
    console.log('================================');
    console.log(`👤 User Address: ${userAddress}`);
    console.log(`🎯 Target HAT ID: ${hatId}`);
    console.log(`📍 HATS Contract: ${HATS_CONTRACT_ADDRESS}`);

    try {
      // Get full HAT details from Hats Protocol core
      console.log('\n1️⃣ READING HAT DETAILS FROM CORE');
      console.log('--------------------------------');

      const hatDetails = await this.retryWithBackoff(async () => {
        return await publicClient.readContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'viewHat',
              type: 'function',
              stateMutability: 'view',
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
            },
          ],
          functionName: 'viewHat',
          args: [BigInt(hatId)],
        });
      });

      console.log(`📊 HAT Details Retrieved:`);
      console.log(`   - Max Supply: ${hatDetails[1]}`);
      console.log(`   - Current Supply: ${hatDetails[2]}`);
      console.log(`   - Eligibility Module: ${hatDetails[3]}`);
      console.log(`   - Toggle Module: ${hatDetails[4]}`);
      console.log(`   - Mutable: ${hatDetails[7]}`);
      console.log(`   - Active: ${hatDetails[8]}`);

      const toggleModule = hatDetails[4];
      console.log(`\n🔍 Toggle Module Analysis: ${toggleModule}`);

      // Check if toggle module is set (not zero address)
      if (toggleModule === '0x0000000000000000000000000000000000000000') {
        console.log('❌ NO TOGGLE MODULE SET');
        console.log(
          '💡 This HAT cannot be toggled - no toggle module assigned',
        );
        return {
          canToggle: false,
          error: 'This role cannot be toggled - no toggle module assigned',
          details: {
            reason: 'NO_TOGGLE_MODULE',
            toggleModule,
            hatActive: hatDetails[8],
            userAddress,
          },
        };
      }

      console.log('\n2️⃣ ANALYZING TOGGLE MODULE TYPE');
      console.log('-------------------------------');

      // Check if toggle module is a special Hats Protocol address
      const isNullToggleModule =
        toggleModule.toLowerCase() ===
        '0x0000000000000000000000000000000000004a75';
      const isPassthroughModule =
        toggleModule.toLowerCase() === HATS_CONTRACT_ADDRESS.toLowerCase();

      console.log(`🔍 Toggle Module Type Analysis:`);
      console.log(`   - Is Null Toggle Module: ${isNullToggleModule}`);
      console.log(`   - Is Passthrough Module: ${isPassthroughModule}`);

      if (isNullToggleModule || isPassthroughModule) {
        console.log('🎯 DETECTED SPECIAL TOGGLE MODULE');
        console.log(
          '   For null/passthrough toggles, checking admin permissions instead',
        );

        // For null/passthrough toggle modules, check admin permissions
        console.log('\n3️⃣ CHECKING ADMIN PERMISSIONS (NULL TOGGLE)');
        console.log('-------------------------------------------');

        // Check both admin and wearer permissions for null toggle modules
        const [isAdminOfHat, isWearerOfHat] = await Promise.all([
          this.retryWithBackoff(async () => {
            return await publicClient.readContract({
              address: HATS_CONTRACT_ADDRESS,
              abi: [
                {
                  name: 'isAdminOfHat',
                  type: 'function',
                  stateMutability: 'view',
                  inputs: [
                    { name: '_user', type: 'address' },
                    { name: '_hatId', type: 'uint256' },
                  ],
                  outputs: [{ name: '', type: 'bool' }],
                },
              ],
              functionName: 'isAdminOfHat',
              args: [userAddress as `0x${string}`, BigInt(hatId)],
            });
          }),
          this.retryWithBackoff(async () => {
            return await publicClient.readContract({
              address: HATS_CONTRACT_ADDRESS,
              abi: [
                {
                  name: 'isWearerOfHat',
                  type: 'function',
                  stateMutability: 'view',
                  inputs: [
                    { name: '_user', type: 'address' },
                    { name: '_hatId', type: 'uint256' },
                  ],
                  outputs: [{ name: '', type: 'bool' }],
                },
              ],
              functionName: 'isWearerOfHat',
              args: [userAddress as `0x${string}`, BigInt(hatId)],
            });
          }),
        ]);

        console.log(`🔑 User is admin of target HAT: ${isAdminOfHat}`);
        console.log(`👑 User is wearer of target HAT: ${isWearerOfHat}`);

        // For null toggle modules, allow either admin OR wearer permissions
        if (!isAdminOfHat && !isWearerOfHat) {
          console.log('❌ USER IS NEITHER ADMIN NOR WEARER OF TARGET HAT');
          console.log(
            '💡 Null toggle modules require either admin or wearer permissions',
          );
          return {
            canToggle: false,
            error:
              'You do not have admin or wearer permissions for this HAT. You must either be an admin or wear the HAT to toggle it.',
            details: {
              reason: 'NO_HAT_PERMISSIONS_NULL_TOGGLE',
              toggleModule,
              userAddress,
              isAdminOfHat: false,
              isWearerOfHat: false,
              suggestion:
                'Contact pod leaders to grant permissions or join the pod',
            },
          };
        }

        const permissionType = isAdminOfHat ? 'admin' : 'wearer';
        console.log(
          `✅ USER HAS ${permissionType.toUpperCase()} PERMISSIONS FOR NULL TOGGLE`,
        );
        return {
          canToggle: true,
          details: {
            reason: 'NULL_TOGGLE_AUTHORIZED',
            toggleModule,
            userAddress,
            isAdminOfHat,
            isWearerOfHat,
            permissionType,
            note: `User has ${permissionType} permissions for null toggle module`,
          },
        };
      }

      // Check if toggle module is a HAT ID (starts with many zeros, indicating HAT-based toggle)
      const isHatBasedToggle =
        toggleModule.toLowerCase().startsWith('0x000000') &&
        !isNullToggleModule;
      console.log(`🎩 HAT-based Toggle: ${isHatBasedToggle}`);

      if (isHatBasedToggle) {
        console.log('🔍 Toggle module appears to be a HAT-based toggle');
        console.log(`🎯 Toggle HAT ID: ${toggleModule}`);

        // Check if user wears the toggle HAT
        console.log('\n3️⃣ CHECKING HAT WEARER STATUS');
        console.log('-----------------------------');

        const isWearerOfToggleHat = await this.retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: HATS_CONTRACT_ADDRESS,
            abi: [
              {
                name: 'isWearerOfHat',
                type: 'function',
                stateMutability: 'view',
                inputs: [
                  { name: '_user', type: 'address' },
                  { name: '_hatId', type: 'uint256' },
                ],
                outputs: [{ name: '', type: 'bool' }],
              },
            ],
            functionName: 'isWearerOfHat',
            args: [userAddress as `0x${string}`, BigInt(toggleModule)],
          });
        });

        console.log(`👑 User wears toggle HAT: ${isWearerOfToggleHat}`);

        if (!isWearerOfToggleHat) {
          console.log('❌ USER DOES NOT WEAR REQUIRED TOGGLE HAT');
          console.log(
            `💡 User must wear HAT ${toggleModule} to toggle this role`,
          );
          return {
            canToggle: false,
            error: `You must wear the required HAT to toggle this role`,
            details: {
              reason: 'NOT_TOGGLE_HAT_WEARER',
              requiredHat: toggleModule,
              userAddress,
              isWearerOfToggleHat,
            },
          };
        }

        console.log('✅ USER HAS HAT-BASED TOGGLE PERMISSIONS');
        return {
          canToggle: true,
          details: {
            reason: 'HAT_BASED_TOGGLE_AUTHORIZED',
            toggleModule,
            userAddress,
            isWearerOfToggleHat: true,
          },
        };
      } else {
        console.log('📄 Toggle module appears to be a contract address');
        console.log(`🔧 Toggle Module Contract: ${toggleModule}`);

        // For contract-based toggle modules, we need to check if user has permissions
        // This is more complex and depends on the specific module implementation
        console.log('\n3️⃣ CHECKING CONTRACT MODULE PERMISSIONS');
        console.log('--------------------------------------');
        console.log(
          '⚠️  Contract-based toggle modules require specific implementation checks',
        );
        console.log(
          "💡 For now, we'll check if user is admin of the target HAT",
        );

        // Check if user is admin of the target HAT (fallback permission check)
        const isAdminOfHat = await this.retryWithBackoff(async () => {
          return await publicClient.readContract({
            address: HATS_CONTRACT_ADDRESS,
            abi: [
              {
                name: 'isAdminOfHat',
                type: 'function',
                stateMutability: 'view',
                inputs: [
                  { name: '_user', type: 'address' },
                  { name: '_hatId', type: 'uint256' },
                ],
                outputs: [{ name: '', type: 'bool' }],
              },
            ],
            functionName: 'isAdminOfHat',
            args: [userAddress as `0x${string}`, BigInt(hatId)],
          });
        });

        console.log(`🔑 User is admin of target HAT: ${isAdminOfHat}`);

        if (!isAdminOfHat) {
          console.log('❌ USER IS NOT ADMIN OF TARGET HAT');
          console.log(
            '💡 Contract-based toggle modules typically require admin permissions',
          );
          return {
            canToggle: false,
            error: 'You do not have admin permissions for this HAT',
            details: {
              reason: 'NOT_HAT_ADMIN',
              toggleModule,
              userAddress,
              isAdminOfHat: false,
            },
          };
        }

        // Check if this is actually a mechanistic toggle (implements IHatsToggle)
        const implementsIHatsToggle = await this.moduleImplementsIHatsToggle(
          publicClient,
          toggleModule as `0x${string}`,
          hatId,
        );

        if (implementsIHatsToggle) {
          console.log('✅ MECHANISTIC TOGGLE: Module implements IHatsToggle');
          return {
            canToggle: true,
            details: {
              reason: 'MECHANISTIC_TOGGLE',
              toggleModule,
              userAddress,
              isAdminOfHat: true,
              note: 'Module implements IHatsToggle - use checkHatStatus',
            },
          };
        } else {
          console.log(
            '❌ HUMANISTIC TOGGLE: Module does not implement IHatsToggle',
          );
          console.log(
            '💡 This requires the toggle address to call setHatStatus directly',
          );

          // For humanistic toggles, only the toggle address itself can call setHatStatus
          if (toggleModule.toLowerCase() === userAddress.toLowerCase()) {
            return {
              canToggle: true,
              details: {
                reason: 'HUMANISTIC_TOGGLE_AUTHORIZED',
                toggleModule,
                userAddress,
                note: 'User is the toggle address - authorized to call setHatStatus',
              },
            };
          } else {
            return {
              canToggle: false,
              error: `Only the toggle address (${toggleModule}) can modify this hat's status`,
              details: {
                reason: 'HUMANISTIC_TOGGLE_UNAUTHORIZED',
                toggleModule,
                userAddress,
                note: 'Switch to the toggle address or use a mechanistic toggle module',
              },
            };
          }
        }

        console.log('⚠️  CONTRACT MODULE DETECTED - ADVANCED VALIDATION NEEDED');
        console.log(
          '💡 User has admin permissions, but contract module may have specific rules',
        );
        return {
          canToggle: false,
          error:
            'Contract-based toggle modules require specific implementation - please configure HAT-based toggle',
          details: {
            reason: 'CONTRACT_MODULE_UNSUPPORTED',
            toggleModule,
            userAddress,
            isAdminOfHat: true,
            suggestion: 'Set toggle module to a HAT ID for simpler permissions',
          },
        };
      }
    } catch (error) {
      console.error('❌ TOGGLE PERMISSION VALIDATION FAILED:', error);

      let errorMessage = 'Failed to validate toggle permissions';
      if (error instanceof Error) {
        if (
          error.message.includes('429') ||
          error.message.includes('rate limit')
        ) {
          errorMessage = 'Rate limited by RPC provider - try again';
          console.log('⏱️  Rate limit detected, user should retry');
        } else if (error.message.includes('revert')) {
          errorMessage = 'Contract call failed - HAT may not exist';
          console.log('🚨 Contract revert - HAT ID may be invalid');
        } else {
          errorMessage = error.message;
          console.log(`🐛 Unexpected error: ${error.message}`);
        }
      }

      return {
        canToggle: false,
        error: errorMessage,
        details: {
          reason: 'VALIDATION_ERROR',
          originalError: error instanceof Error ? error.message : String(error),
          userAddress,
          hatId,
        },
      };
    }
  }
}

export default HatToggleService;
