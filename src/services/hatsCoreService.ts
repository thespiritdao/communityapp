import { HatsClient } from '@hatsprotocol/sdk-v1-core';
import { HatsSubgraphClient } from '@hatsprotocol/sdk-v1-subgraph';
import type { PublicClient, WalletClient } from 'viem';
import { base } from 'viem/chains';

/**
 * Service class for Hats Protocol Core SDK integration
 * Provides essential hat operations: create, mint, transfer, revoke, queries
 * Complements the existing HatsModulesService without conflicts
 */
export class HatsCoreService {
  private coreClient: HatsClient | null = null;
  private subgraphClient: HatsSubgraphClient | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  /**
   * Initialize both core and subgraph clients
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      console.log('🎩 Initializing HATS Core Service...');
      console.log('🔗 Chain:', this.publicClient.chain?.name || 'Unknown');

      // Initialize Core SDK (for onchain operations)
      this.coreClient = new HatsClient({
        chainId: this.publicClient.chain?.id || base.id,
        publicClient: this.publicClient,
        walletClient: this.walletClient,
      });

      // Initialize Subgraph SDK (for queries)
      this.subgraphClient = new HatsSubgraphClient({
        config: {
          [this.publicClient.chain?.id || base.id]: {
            endpoint: this.getSubgraphEndpoint(this.publicClient.chain?.id || base.id)
          }
        }
      });

      this.isInitialized = true;
      console.log('✅ HATS Core Service initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize HATS Core Service:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get subgraph endpoint for chain
   */
  private getSubgraphEndpoint(chainId: number): string {
    const endpoints: Record<number, string> = {
      1: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-ethereum',
      8453: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-base', // Base
      10: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-optimism',
      137: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-polygon',
      42161: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-arbitrum',
      100: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-gnosis',
      42220: 'https://api.thegraph.com/subgraphs/name/hats-protocol/hats-v1-celo',
    };
    
    return endpoints[chainId] || endpoints[8453]; // Default to Base
  }

  /**
   * Ensure clients are initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.coreClient || !this.subgraphClient) {
      throw new Error('HatsCoreService not initialized. Call initialize() first.');
    }
  }

  // ========================================
  // HAT CREATION OPERATIONS
  // ========================================

  /**
   * Create a new hat (requires wallet client)
   */
  async createHat(params: {
    admin: string;
    details: string;
    maxSupply?: number;
    eligibility?: string;
    toggle?: string;
    mutable?: boolean;
    imageURI?: string;
  }): Promise<{ hatId: string; transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for creating hats');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    // CRITICAL FIX: Use creator address as toggle module for proper permission management
    // The toggle module must be an ADDRESS (20 bytes), not a hat ID (32 bytes)
    const toggleModule = params.toggle || account;
    
    console.log('🎯 Hats SDK hat creation parameters:', {
      admin: params.admin,
      eligibility: params.eligibility || '0x0000000000000000000000000000000000000001',
      toggle: toggleModule,
      mutable: params.mutable ?? true,
      maxSupply: params.maxSupply || 1
    });
    
    if (toggleModule === account) {
      console.log('✅ Using creator address as toggle module (enables permission management)');
    }

    const result = await this.coreClient!.createHat({
      account,
      admin: BigInt(params.admin),
      details: params.details,
      maxSupply: params.maxSupply || 1,
      eligibility: (params.eligibility || '0x0000000000000000000000000000000000000001') as `0x${string}`,
      toggle: toggleModule as `0x${string}`,
      mutable: params.mutable ?? true,
      imageURI: params.imageURI || ''
    });

    return {
      hatId: result.hatId.toString(),
      transactionHash: result.transactionHash
    };
  }

  /**
   * Calculate the next hat ID for a given admin hat
   * This uses the same logic as the protocol
   */
  getNextChildHatId(adminHatId: string): string {
    // For now, return a placeholder - the actual hat ID is determined on-chain
    // In production, this would use proper tree traversal logic
    const baseId = BigInt(adminHatId);
    return (baseId + BigInt(1)).toString();
  }

  // ========================================
  // HAT MINTING & MANAGEMENT
  // ========================================

  /**
   * Mint a hat to an address
   */
  async mintHat(params: {
    hatId: string;
    wearer: string;
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for minting hats');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    const result = await this.coreClient!.mintHat({
      account,
      hatId: BigInt(params.hatId),
      wearer: params.wearer as `0x${string}`
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Batch mint hats to multiple addresses
   */
  async batchMintHats(params: {
    hatId: string;
    wearers: string[];
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for batch minting hats');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    const result = await this.coreClient!.batchMintHats({
      account,
      hatIds: params.wearers.map(() => BigInt(params.hatId)),
      wearers: params.wearers as `0x${string}`[]
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Transfer hat from one address to another
   */
  async transferHat(params: {
    hatId: string;
    from: string;
    to: string;
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for transferring hats');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    const result = await this.coreClient!.transferHat({
      account,
      hatId: BigInt(params.hatId),
      from: params.from as `0x${string}`,
      to: params.to as `0x${string}`
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Revoke hat from an address
   */
  async revokeHat(params: {
    hatId: string;
    wearer: string;
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for revoking hats');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    // Check if the hat can be revoked
    const canRevoke = await this.coreClient!.isInGoodStanding({
      hatId: BigInt(params.hatId),
      wearer: params.wearer as `0x${string}`
    });

    if (!canRevoke) {
      throw new Error('Cannot revoke hat: wearer is not in good standing or hat is not revocable');
    }

    // Use setHatStatus to revoke
    const result = await this.coreClient!.setHatStatus({
      account,
      hatId: BigInt(params.hatId),
      newStatus: false
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Toggle HAT status (activate/deactivate)
   */
  async toggleHatStatus(params: {
    hatId: string;
    newStatus: boolean;
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for toggling hat status');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    console.log('🎩 Executing setHatStatus via Hats SDK:', {
      account,
      hatId: params.hatId,
      newStatus: params.newStatus
    });

    const result = await this.coreClient!.setHatStatus({
      account,
      hatId: BigInt(params.hatId),
      newStatus: params.newStatus
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Check if user has admin permissions for a HAT
   */
  async isHatAdmin(params: {
    userAddress: string;
    hatId: string;
  }): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      // Get HAT details to find admin HAT
      const hatDetails = await this.getHatDetails(params.hatId);
      
      if (!hatDetails?.admin?.id) {
        console.log('❌ No admin HAT found for this HAT');
        return false;
      }
      
      const adminHatId = hatDetails.admin.id;
      console.log('🔍 Admin HAT ID:', adminHatId);
      
      // Check if user wears the admin HAT
      const adminHat = await this.subgraphClient!.getWearer({
        chainId: this.publicClient.chain?.id || base.id,
        wearerAddress: params.userAddress as `0x${string}`,
        props: {
          currentHats: {
            props: {
              prettyId: true,
              status: true
            }
          }
        }
      });
      
      const hasAdminHat = adminHat?.currentHats?.some(
        (hat: any) => hat.id === adminHatId && hat.status
      );
      
      console.log('🔐 Admin HAT check result:', {
        userAddress: params.userAddress,
        adminHatId,
        hasAdminHat,
        currentHats: adminHat?.currentHats?.length || 0
      });
      
      return Boolean(hasAdminHat);
      
    } catch (error) {
      console.error('Failed to check admin permissions:', error);
      
      // Check if it's a CORS-related error and provide helpful info
      if (error instanceof Error && (
          error.message.includes('CORS') || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('Redirect is not allowed')
        )) {
        console.log('🚫 CORS error detected - subgraph API unavailable. Admin permissions cannot be verified.');
        console.log('💡 This is expected in development. For production, ensure proper CORS configuration.');
      }
      
      return false;
    }
  }

  /**
   * Detect CORS issues based on environment and error patterns
   */
  private detectCorsIssues(): boolean {
    // In development with localhost, CORS redirects commonly fail
    return typeof window !== 'undefined' && 
           window.location.hostname === 'localhost';
  }

  /**
   * Alternative: Use admin functions to manage HAT status
   * This works if user has admin permissions instead of toggle permissions
   */
  async toggleHatStatusViaAdmin(params: {
    hatId: string;
    newStatus: boolean;
  }): Promise<{ transactionHash: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for toggling hat status');
    }

    const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);

    // Try to check admin permissions, but proceed if CORS blocks it
    try {
      const isAdmin = await this.isHatAdmin({
        userAddress: account,
        hatId: params.hatId
      });

      if (isAdmin) {
        console.log('✅ Admin permissions verified');
      } else {
        console.log('⚠️  Admin permission check failed - trying direct toggle anyway (may be due to CORS)');
        // Don't throw here - try the transaction anyway since CORS may be blocking verification
      }
    } catch (error) {
      console.log('⚠️  Admin permission check failed due to technical issues - proceeding with toggle attempt');
      console.log('🔄 This may succeed if you actually have the required permissions');
    }

    console.log('🎩 Using admin permissions to toggle HAT status:', {
      account,
      hatId: params.hatId,
      newStatus: params.newStatus,
      method: 'admin'
    });

    // Use admin method to change HAT status via setHatStatus
    const result = await this.coreClient!.setHatStatus({
      account,
      hatId: BigInt(params.hatId),
      newStatus: params.newStatus
    });

    return { transactionHash: result.transactionHash };
  }

  /**
   * Get detailed HAT information including toggle module
   */
  async getHatDetails(hatId: string) {
    this.ensureInitialized();
    
    return await this.subgraphClient!.getHat({
      chainId: this.publicClient.chain?.id || base.id,
      hatId: BigInt(hatId),
      props: {
        prettyId: true,
        status: true,
        details: true,
        maxSupply: true,
        currentSupply: true,
        mutable: true,
        imageUri: true,
        admin: {
          prettyId: true,
          status: true
        },
        eligibility: true,
        toggle: true
      }
    });
  }

  // ========================================
  // HAT QUERIES (via Subgraph)
  // ========================================

  /**
   * Get hat details by ID
   */
  async getHat(hatId: string) {
    this.ensureInitialized();
    
    return await this.subgraphClient!.getHat({
      chainId: this.publicClient.chain?.id || base.id,
      hatId: BigInt(hatId),
      props: {
        prettyId: true,
        status: true,
        createdAt: true,
        details: true,
        maxSupply: true,
        currentSupply: true,
        mutable: true,
        imageUri: true,
        admin: {
          prettyId: true
        },
        eligibility: true,
        toggle: true,
        wearers: {
          props: {
            currentHats: {
              props: {
                prettyId: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Get all hats worn by an address
   */
  async getWearerHats(wearerAddress: string) {
    this.ensureInitialized();
    
    return await this.subgraphClient!.getWearer({
      chainId: this.publicClient.chain?.id || base.id,
      wearerAddress: wearerAddress.toLowerCase() as `0x${string}`,
      props: {
        currentHats: {
          props: {
            prettyId: true,
            status: true,
            details: true,
            imageUri: true,
            admin: {
              prettyId: true
            }
          }
        }
      }
    });
  }

  /**
   * Get all wearers of a specific hat
   */
  async getHatWearers(hatId: string) {
    this.ensureInitialized();
    
    const hat = await this.getHat(hatId);
    return hat?.wearers || [];
  }

  /**
   * Check if an address is wearing a specific hat
   */
  async isWearingHat(wearerAddress: string, hatId: string): Promise<boolean> {
    this.ensureInitialized();
    
    return await this.coreClient!.isWearerOfHat({
      wearer: wearerAddress as `0x${string}`,
      hatId: BigInt(hatId)
    });
  }

  /**
   * Get hat tree starting from a top hat
   */
  async getHatTree(topHatId: string) {
    this.ensureInitialized();
    
    return await this.subgraphClient!.getTree({
      chainId: this.publicClient.chain?.id || base.id,
      treeId: Number.parseInt(topHatId),
      props: {
        hats: {
          props: {
            prettyId: true,
            status: true,
            details: true,
            maxSupply: true,
            currentSupply: true,
            imageUri: true,
            admin: {
              prettyId: true
            },
            wearers: {
              props: {}
            }
          }
        }
      }
    });
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Check if a hat exists by querying its status
   */
  async hatExists(hatId: string): Promise<boolean> {
    try {
      this.ensureInitialized();
      const hat = await this.getHat(hatId);
      return hat !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get hat level in tree (0 = tophat, 1 = first level, etc.)
   */
  getHatLevel(hatId: string): number {
    // This would typically be calculated from the hat ID structure
    // For now, return a default level
    return 1;
  }

  /**
   * Get admin hat ID for a given hat
   */
  getAdminHatId(hatId: string): string {
    // This would typically be calculated from the hat tree structure
    // For now, return the parent hat ID based on the hat ID structure
    const baseId = BigInt(hatId);
    return (baseId - BigInt(1)).toString();
  }

  /**
   * Check if hat is active
   */
  async isHatActive(hatId: string): Promise<boolean> {
    this.ensureInitialized();
    
    return await this.coreClient!.isActive(BigInt(hatId));
  }

  /**
   * Get local admin (direct parent) of a hat
   */
  getLocalAdmin(hatId: string): string {
    // Calculate parent hat ID from the hat structure
    return this.getAdminHatId(hatId);
  }

  /**
   * Generate image URL for a hat
   */
  generateHatImageUrl(hatName: string, isManagement = false): string {
    const backgroundColor = isManagement ? 'bfe7c6' : 'c6e7ff';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(hatName)}&size=400&background=${backgroundColor}&color=000&bold=true`;
  }
}

// Export singleton instance
let hatsCoreService: HatsCoreService | null = null;

export const getHatsCoreService = (
  publicClient: PublicClient,
  walletClient?: WalletClient
): HatsCoreService => {
  if (!hatsCoreService) {
    hatsCoreService = new HatsCoreService(publicClient, walletClient);
  }
  
  return hatsCoreService;
};

export default HatsCoreService;