import type { PublicClient, WalletClient } from 'viem';

// HATS Protocol ABI for deactivation functions
const HATS_DEACTIVATION_ABI = [
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
    name: 'transferHat',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'renounceHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
      { name: 'numChildren', type: 'uint16' },
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
  {
    name: 'isValidHatId',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export interface HatDeactivationResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export interface HatStatus {
  isActive: boolean;
  supply: number;
  maxSupply: number;
  details: string;
  eligibility: string;
  toggle: string;
  imageURI: string;
  numChildren: number;
  mutable: boolean;
}

export interface HatWearer {
  address: string;
  balance: number;
  profile?: {
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
  };
}

/**
 * Service for managing HAT deactivation and member removal operations
 */
export class HatDeactivationService {
  private static HATS_CONTRACT_ADDRESS = (process.env
    .NEXT_PUBLIC_HATS_CONTRACT ||
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137') as `0x${string}`;

  /**
   * Check if a hat ID is valid (numeric) and not a placeholder
   */
  static isValidHatId(hatId: string): boolean {
    if (!hatId) return false;

    // Check for placeholder values
    const placeholderValues = [
      'extracted_from_tx',
      'pending_creation',
      'pending',
      'null',
      'undefined',
      'none',
    ];

    if (placeholderValues.includes(hatId.toLowerCase())) {
      return false;
    }

    // Check if it's a valid number (Hats Protocol uses numeric IDs)
    try {
      const numericId = BigInt(hatId);
      return numericId >= 0n;
    } catch {
      return false;
    }
  }

  /**
   * Check if a user has admin permissions for a specific HAT
   */
  static async checkAdminPermissions(
    publicClient: PublicClient,
    userAddress: string,
    hatId: string,
  ): Promise<boolean> {
    try {
      // Validate hat ID first
      if (!this.isValidHatId(hatId)) {
        console.log(`🎩 Skipping admin check for invalid hat ID: ${hatId}`);
        return false;
      }

      const isAdmin = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'isAdminOfHat',
        args: [userAddress as `0x${string}`, BigInt(hatId)],
      });

      return Boolean(isAdmin);
    } catch (error) {
      console.error('Failed to check admin permissions:', error);
      return false;
    }
  }

  /**
   * Get current status of a HAT
   */
  static async getHatStatus(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<HatStatus | null> {
    try {
      // Validate hat ID first
      if (!this.isValidHatId(hatId)) {
        console.log(`🎩 Skipping status check for invalid hat ID: ${hatId}`);
        return null;
      }

      const hatDetails = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'viewHat',
        args: [BigInt(hatId)],
      });

      return {
        details: hatDetails[0],
        maxSupply: hatDetails[1],
        supply: hatDetails[2],
        eligibility: hatDetails[3],
        toggle: hatDetails[4],
        imageURI: hatDetails[5],
        numChildren: hatDetails[6],
        mutable: hatDetails[7],
        isActive: hatDetails[8],
      };
    } catch (error) {
      console.error('Failed to get HAT status:', error);
      return null;
    }
  }

  /**
   * Check if the top hat for a given HAT ID is active
   */
  static async checkTopHatStatus(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<{ isActive: boolean; topHatId: number }> {
    try {
      // Extract top hat ID from the hat ID (first 8 hex characters after 0x)
      const hatIdBigInt = BigInt(hatId);
      const hatIdHex = hatIdBigInt.toString(16).padStart(64, '0');
      const topHatHex = hatIdHex.slice(0, 8);
      const topHatId = Number.parseInt(topHatHex, 16);

      const topHatStatus = await this.getHatStatus(
        publicClient,
        topHatId.toString(),
      );

      return {
        isActive: topHatStatus?.isActive ?? false,
        topHatId,
      };
    } catch (error) {
      console.error('Failed to check top hat status:', error);
      return { isActive: false, topHatId: 0 };
    }
  }

  /**
   * Deactivate a HAT (disable it from being worn)
   * Uses the correct Hats Protocol approach: call setHatStatus on toggle module, then checkHatStatus on core
   */
  static async deactivateHat(
    publicClient: PublicClient,
    walletClient: WalletClient | null,
    hatId: string,
    userAddress: string,
  ): Promise<HatDeactivationResult> {
    // ENHANCED DEBUGGING for console log visibility
    console.log(
      `\n🎯 ==================== HAT DEACTIVATION START ====================`,
    );
    console.log(`🎯 Starting HAT deactivation for Hat ID: ${hatId}`);
    console.log(`   User: ${userAddress}`);
    console.log(`   HATS_CONTRACT_ADDRESS: ${this.HATS_CONTRACT_ADDRESS}`);
    console.log(
      `   Env NEXT_PUBLIC_HATS_CONTRACT: ${process.env.NEXT_PUBLIC_HATS_CONTRACT}`,
    );
    console.log(
      `   Browser: ${typeof window !== 'undefined' ? 'Client-side' : 'Server-side'}`,
    );
    console.log(
      `🎯 ================================================================\n`,
    );

    // Force console visibility with alert in development
    if (
      process.env.NODE_ENV === 'development' &&
      typeof window !== 'undefined'
    ) {
      console.warn(
        '🚨 DEVELOPMENT MODE: HAT deactivation starting - check console for detailed logs',
      );
    }

    try {
      // Check if hat ID is valid first
      if (!this.isValidHatId(hatId)) {
        console.log(`🎩 Skipping deactivation for invalid hat ID: ${hatId}`);
        return {
          success: false,
          error: `Invalid hat ID: ${hatId} (placeholder value)`,
        };
      }

      // Check if we have a wallet client for transactions
      if (!walletClient) {
        console.log(
          `🎩 No wallet client available, cannot deactivate hat: ${hatId}`,
        );
        return {
          success: false,
          error: 'Wallet client required for hat deactivation',
        };
      }

      // First get Hat status to check toggle address
      const hatStatus = await this.getHatStatus(publicClient, hatId);
      if (!hatStatus) {
        return {
          success: false,
          error: 'Failed to retrieve HAT status',
        };
      }

      if (!hatStatus.isActive) {
        return {
          success: false,
          error: 'HAT is already deactivated',
        };
      }

      // Check if toggle module is a special Hats Protocol address
      const isNullToggleModule =
        hatStatus.toggle.toLowerCase() ===
        '0x0000000000000000000000000000000000004a75';
      const isPassthroughModule =
        hatStatus.toggle.toLowerCase() ===
        this.HATS_CONTRACT_ADDRESS.toLowerCase();

      if (isNullToggleModule || isPassthroughModule) {
        console.log(`🎯 Detected special toggle module: ${hatStatus.toggle}`);
        console.log(`   Using admin-based deactivation approach`);

        // For null/passthrough toggle modules, check admin permissions instead
        const hasAdminPermission = await this.checkAdminPermissions(
          publicClient,
          userAddress,
          hatId,
        );
        if (!hasAdminPermission) {
          return {
            success: false,
            error: `Hat uses null/passthrough toggle module. Only admins can deactivate this HAT. Current user ${userAddress} is not an admin.`,
          };
        }

        console.log(
          `✅ User ${userAddress} has admin permissions for Hat ${hatId}`,
        );

        // For null toggle modules, call setHatStatus directly on Hats contract
        console.log(
          `🎯 Calling setHatStatus directly on Hats contract (null toggle module)`,
        );
        console.log(`   Contract Address: ${this.HATS_CONTRACT_ADDRESS}`);
        console.log(`   Hat ID: ${hatId}`);
        console.log(`   User Address: ${userAddress}`);

        const hash = await walletClient.writeContract({
          address: this.HATS_CONTRACT_ADDRESS,
          abi: HATS_DEACTIVATION_ABI,
          functionName: 'setHatStatus',
          args: [BigInt(hatId), false], // false = deactivated
        });

        console.log(
          `✅ Hat ${hatId} deactivated using null toggle module approach. Tx: ${hash}`,
        );

        return {
          success: true,
          transactionHash: hash,
        };
      }

      // CRITICAL FIX: Properly handle humanistic vs mechanistic toggles
      const isUserTheToggle =
        hatStatus.toggle.toLowerCase() === userAddress.toLowerCase();

      if (isUserTheToggle) {
        // HUMANISTIC TOGGLE: User's wallet is the toggle - call setHatStatus directly on HATS contract
        console.log(
          `🎯 HUMANISTIC TOGGLE DETECTED: User ${userAddress} is the toggle address`,
        );
        console.log(
          `   Calling setHatStatus directly on HATS contract: ${this.HATS_CONTRACT_ADDRESS}`,
        );
        console.log(
          `   NOT calling user's wallet address (this was the bug causing "Self calls not allowed")`,
        );

        const hash = await walletClient.writeContract({
          address: this.HATS_CONTRACT_ADDRESS, // FIXED: Call HATS contract, not user address
          abi: HATS_DEACTIVATION_ABI,
          functionName: 'setHatStatus',
          args: [BigInt(hatId), false], // false = deactivated
        });

        console.log(
          `✅ Hat ${hatId} deactivated using humanistic toggle approach. Tx: ${hash}`,
        );

        return {
          success: true,
          transactionHash: hash,
        };
      }

      // MECHANISTIC TOGGLE: External contract is the toggle - use two-step approach
      console.log(
        `🎯 MECHANISTIC TOGGLE DETECTED: External contract ${hatStatus.toggle} is the toggle`,
      );
      console.log(
        `   User ${userAddress} must be authorized to call this toggle contract`,
      );

      // Check if user has permission to call the mechanistic toggle
      // For mechanistic toggles, the toggle contract should allow the authorized caller
      try {
        console.log(
          `🎯 Step 1: Calling setHatStatus on mechanistic toggle module ${hatStatus.toggle}`,
        );

        // Step 1: Call setHatStatus on the toggle module
        const toggleHash = await walletClient.writeContract({
          address: hatStatus.toggle as `0x${string}`,
          abi: [
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
          ],
          functionName: 'setHatStatus',
          args: [BigInt(hatId), false], // false = deactivated
        });

        console.log(
          `✅ Step 1 complete: setHatStatus on toggle module. Tx: ${toggleHash}`,
        );

        // Step 2: Call checkHatStatus on Hats contract to pull the updated status
        console.log(
          `🎯 Step 2: Calling checkHatStatus on Hats contract to pull updated status`,
        );

        const checkHash = await walletClient.writeContract({
          address: this.HATS_CONTRACT_ADDRESS,
          abi: [
            {
              name: 'checkHatStatus',
              type: 'function',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [{ name: 'toggled', type: 'bool' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'checkHatStatus',
          args: [BigInt(hatId)],
        });

        console.log(
          `✅ Step 2 complete: checkHatStatus on Hats contract. Tx: ${checkHash}`,
        );
        console.log(
          `🎩 Hat ${hatId} deactivation complete using mechanistic toggle approach`,
        );

        return {
          success: true,
          transactionHash: checkHash, // Return the final transaction hash
        };
      } catch (mechanisticError) {
        // If mechanistic toggle fails, provide helpful error message
        return {
          success: false,
          error: `Failed to call mechanistic toggle contract ${hatStatus.toggle}. User ${userAddress} may not be authorized to call this toggle contract, or the contract may not implement the expected interface. Original error: ${mechanisticError instanceof Error ? mechanisticError.message : 'Unknown error'}`,
        };
      }
    } catch (error) {
      console.error('Failed to deactivate HAT:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to deactivate HAT',
      };
    }
  }

  /**
   * Reactivate a HAT (enable it to be worn)
   */
  static async reactivateHat(
    publicClient: PublicClient,
    walletClient: WalletClient,
    userAddress: string,
    hatId: string,
  ): Promise<HatDeactivationResult> {
    try {
      // Verify admin permissions
      const hasAdminPermission = await this.checkAdminPermissions(
        publicClient,
        userAddress,
        hatId,
      );
      if (!hasAdminPermission) {
        return {
          success: false,
          error: 'You do not have admin permissions for this HAT',
        };
      }

      // Check current HAT status
      const hatStatus = await this.getHatStatus(publicClient, hatId);
      if (!hatStatus) {
        return {
          success: false,
          error: 'Failed to retrieve HAT status',
        };
      }

      if (hatStatus.isActive) {
        return {
          success: false,
          error: 'HAT is already active',
        };
      }

      // Execute reactivation transaction
      const hash = await walletClient.writeContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'setHatStatus',
        args: [BigInt(hatId), true], // true = activated
      });

      return {
        success: true,
        transactionHash: hash,
      };
    } catch (error) {
      console.error('Failed to reactivate HAT:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to reactivate HAT',
      };
    }
  }

  /**
   * Remove HAT from a specific wearer (transfer to burn address)
   */
  static async removeHatFromWearer(
    publicClient: PublicClient,
    walletClient: WalletClient,
    userAddress: string,
    hatId: string,
    wearerAddress: string,
  ): Promise<HatDeactivationResult> {
    try {
      // Verify admin permissions
      const hasAdminPermission = await this.checkAdminPermissions(
        publicClient,
        userAddress,
        hatId,
      );
      if (!hasAdminPermission) {
        return {
          success: false,
          error: 'You do not have admin permissions for this HAT',
        };
      }

      // Verify the wearer actually has the HAT
      const balance = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'balanceOf',
        args: [wearerAddress as `0x${string}`, BigInt(hatId)],
      });

      if (Number(balance) === 0) {
        return {
          success: false,
          error: 'Address does not wear this HAT',
        };
      }

      // Transfer HAT to burn address (0x000...000)
      const hash = await walletClient.writeContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'transferHat',
        args: [
          BigInt(hatId),
          wearerAddress as `0x${string}`,
          '0x0000000000000000000000000000000000000000' as `0x${string}`,
        ],
      });

      return {
        success: true,
        transactionHash: hash,
      };
    } catch (error) {
      console.error('Failed to remove HAT from wearer:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove HAT from wearer',
      };
    }
  }

  /**
   * Allow a user to renounce their own HAT
   */
  static async renounceHat(
    walletClient: WalletClient,
    hatId: string,
  ): Promise<HatDeactivationResult> {
    try {
      // Execute renounce transaction (user can renounce their own HAT)
      const hash = await walletClient.writeContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'renounceHat',
        args: [BigInt(hatId)],
      });

      return {
        success: true,
        transactionHash: hash,
      };
    } catch (error) {
      console.error('Failed to renounce HAT:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to renounce HAT',
      };
    }
  }

  /**
   * Check if a HAT is valid and exists
   */
  static async isValidHat(
    publicClient: PublicClient,
    hatId: string,
  ): Promise<boolean> {
    try {
      const isValid = await publicClient.readContract({
        address: this.HATS_CONTRACT_ADDRESS,
        abi: HATS_DEACTIVATION_ABI,
        functionName: 'isValidHatId',
        args: [BigInt(hatId)],
      });

      return Boolean(isValid);
    } catch (error) {
      console.error('Failed to check HAT validity:', error);
      return false;
    }
  }

  /**
   * Get all HAT wearers for a specific HAT ID
   * Note: This is a simplified implementation. In production, you'd want to
   * query blockchain events or use a graph indexer for complete wearer lists.
   */
  static async getHatWearers(
    publicClient: PublicClient,
    hatId: string,
    knownAddresses: string[],
  ): Promise<HatWearer[]> {
    try {
      const wearers: HatWearer[] = [];

      // Check balance for each known address
      await Promise.all(
        knownAddresses.map(async (address) => {
          try {
            const balance = await publicClient.readContract({
              address: this.HATS_CONTRACT_ADDRESS,
              abi: HATS_DEACTIVATION_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`, BigInt(hatId)],
            });

            if (Number(balance) > 0) {
              wearers.push({
                address,
                balance: Number(balance),
              });
            }
          } catch (error) {
            console.error(`Failed to check balance for ${address}:`, error);
          }
        }),
      );

      return wearers;
    } catch (error) {
      console.error('Failed to get HAT wearers:', error);
      return [];
    }
  }

  /**
   * Batch operation to remove HAT from multiple wearers
   */
  static async batchRemoveHatWearers(
    publicClient: PublicClient,
    walletClient: WalletClient,
    userAddress: string,
    hatId: string,
    wearerAddresses: string[],
  ): Promise<{
    successful: string[];
    failed: Array<{ address: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ address: string; error: string }> = [];

    // Verify admin permissions once
    const hasAdminPermission = await this.checkAdminPermissions(
      publicClient,
      userAddress,
      hatId,
    );
    if (!hasAdminPermission) {
      return {
        successful: [],
        failed: wearerAddresses.map((addr) => ({
          address: addr,
          error: 'You do not have admin permissions for this HAT',
        })),
      };
    }

    // Process each wearer
    for (const wearerAddress of wearerAddresses) {
      try {
        const result = await this.removeHatFromWearer(
          publicClient,
          walletClient,
          userAddress,
          hatId,
          wearerAddress,
        );

        if (result.success) {
          successful.push(wearerAddress);
        } else {
          failed.push({
            address: wearerAddress,
            error: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        failed.push({
          address: wearerAddress,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed };
  }
}

export default HatDeactivationService;
