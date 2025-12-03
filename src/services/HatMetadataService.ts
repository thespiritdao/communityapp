import { supabase } from '@/utils/supabaseClient';
import { encodeFunctionData } from 'viem';
import type { HatPermissions } from './hatPermissionsService';
import type { EligibilityCriteria } from '@/features/pods/services/EligibilityService';

/**
 * Service for managing HAT metadata with permissions and eligibility criteria
 * Stores comprehensive pod role data in IPFS for onchain reference
 */

export interface HatMetadata {
  // Standard HAT metadata fields
  name: string;
  description: string;
  image?: string;

  // Version control
  version: '1.0.0';
  updatedAt: string;

  // Custom SpiritDAO permissions (our 12 permissions)
  permissions: HatPermissions;

  // Eligibility configuration
  eligibility: {
    criteria: EligibilityCriteria[];
    requireAll: boolean;
    modules?: string[]; // Deployed module addresses
  };

  // Pod-specific data
  podContext: {
    podId: string;
    podName: string;
    roleType: 'leader' | 'member';
    maxSupply?: number;
  };

  // Verification endpoints
  verification: {
    databaseEndpoint?: string;
    onchainModule?: string;
    ipfsHash?: string;
  };

  // Custom extensions
  customData?: Record<string, any>;
}

export class HatMetadataService {
  private static ipfsClient: any = null;

  /**
   * Initialize IPFS client (can use Pinata, Infura, or local)
   */
  static initializeIPFS() {
    if (!this.ipfsClient) {
      // Option 1: Pinata (recommended for production)
      if (process.env.NEXT_PUBLIC_PINATA_JWT) {
        console.log('🎯 Initializing Pinata IPFS client');
        this.ipfsClient = {
          add: async (data: any) => {
            try {
              console.log('📤 Uploading to Pinata IPFS...');

              // Debug token availability
              const token = process.env.NEXT_PUBLIC_PINATA_JWT;
              console.log('🔑 Token available:', !!token);
              console.log(
                '🔑 Token prefix:',
                token ? token.substring(0, 10) + '...' : 'undefined',
              );

              const response = await fetch(
                'https://api.pinata.cloud/pinning/pinJSONToIPFS',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    pinataContent: data,
                    pinataMetadata: {
                      name: `hat-metadata-${Date.now()}`,
                      keyvalues: {
                        type: 'hat-metadata',
                        version: data.version || '1.0.0',
                        podId: data.podContext?.podId,
                        roleName: data.podContext?.roleName,
                      },
                    },
                    pinataOptions: {
                      cidVersion: 1,
                    },
                  }),
                },
              );

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `Pinata API error: ${response.status} - ${errorText}`,
                );
              }

              const result = await response.json();
              console.log(
                '✅ Successfully uploaded to Pinata, IPFS hash:',
                result.IpfsHash,
              );
              return { cid: { toString: () => result.IpfsHash } };
            } catch (error) {
              console.error('❌ Pinata upload failed:', error);
              throw error;
            }
          },
          cat: async (hash: string) => {
            try {
              // Use Pinata's dedicated gateway for better reliability
              const response = await fetch(
                `https://gateway.pinata.cloud/ipfs/${hash}`,
              );
              if (!response.ok) {
                throw new Error(
                  `Failed to fetch from IPFS: ${response.status}`,
                );
              }
              return response.json();
            } catch (error) {
              // Fallback to public gateway if Pinata gateway fails
              console.warn(
                '⚠️ Pinata gateway failed, trying public IPFS gateway',
              );
              const response = await fetch(`https://ipfs.io/ipfs/${hash}`);
              return response.json();
            }
          },
        };
      }
      // Option 2: Infura IPFS (simplified for now - requires proper FormData setup)
      else if (process.env.NEXT_PUBLIC_INFURA_PROJECT_ID) {
        console.warn(
          '⚠️ Infura IPFS requires additional setup - falling back to database storage',
        );
        this.ipfsClient = {
          add: async (data: any) => {
            // Fallback to database for now
            const { data: stored, error } = await supabase
              .from('hat_metadata_cache')
              .insert({
                metadata: data,
                created_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (error) throw error;
            return { cid: { toString: () => `db:${stored.id}` } };
          },
          cat: async (hash: string) => {
            if (hash.startsWith('db:')) {
              const id = hash.replace('db:', '');
              const { data, error } = await supabase
                .from('hat_metadata_cache')
                .select('metadata')
                .eq('id', id)
                .single();

              if (error) throw error;
              return data.metadata;
            }
            // Try to fetch from public gateway
            const response = await fetch(`https://ipfs.io/ipfs/${hash}`);
            return response.json();
          },
        };
      }
      // Option 3: Public IPFS (not recommended for production)
      else {
        console.warn(
          '⚠️ Using public IPFS gateway - not recommended for production',
        );
        this.ipfsClient = {
          add: async (data: any) => {
            // Fallback to storing in database
            const { data: stored, error } = await supabase
              .from('hat_metadata_cache')
              .insert({
                metadata: data,
                created_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (error) throw error;
            return { cid: { toString: () => `db:${stored.id}` } };
          },
          cat: async (hash: string) => {
            if (hash.startsWith('db:')) {
              const id = hash.replace('db:', '');
              const { data, error } = await supabase
                .from('hat_metadata_cache')
                .select('metadata')
                .eq('id', id)
                .single();

              if (error) throw error;
              return data.metadata;
            }
            // Try to fetch from public gateway
            const response = await fetch(`https://ipfs.io/ipfs/${hash}`);
            return response.json();
          },
        };
      }
    }
    return this.ipfsClient;
  }

  /**
   * Build comprehensive metadata object from role permissions and criteria
   */
  static buildMetadata(params: {
    roleId: string;
    roleName: string;
    roleType: 'leader' | 'member';
    permissions: HatPermissions;
    eligibilityCriteria: EligibilityCriteria[];
    podId: string;
    podName: string;
    moduleAddresses?: string[];
  }): HatMetadata {
    return {
      // Standard fields
      name: params.roleName,
      description: `${params.roleType === 'leader' ? 'Leadership' : 'Membership'} role for ${params.podName}`,

      // Version
      version: '1.0.0',
      updatedAt: new Date().toISOString(),

      // Permissions (our 12 custom permissions)
      permissions: params.permissions,

      // Eligibility
      eligibility: {
        criteria: params.eligibilityCriteria,
        requireAll: params.eligibilityCriteria.every(
          (c) => c.required !== false,
        ),
        modules: params.moduleAddresses,
      },

      // Pod context
      podContext: {
        podId: params.podId,
        podName: params.podName,
        roleType: params.roleType,
        maxSupply: params.roleType === 'leader' ? 10 : 100,
      },

      // Verification endpoints
      verification: {
        databaseEndpoint: `/api/pods/${params.podId}/eligibility`,
        onchainModule: params.moduleAddresses?.[0],
      },
    };
  }

  /**
   * Upload metadata to IPFS and return hash
   */
  static async uploadToIPFS(metadata: HatMetadata): Promise<string> {
    try {
      const ipfs = this.initializeIPFS();

      console.log('📤 Uploading HAT metadata to IPFS:', {
        name: metadata.name,
        permissionsCount: Object.keys(metadata.permissions).length,
        criteriaCount: metadata.eligibility.criteria.length,
      });

      // Convert metadata to JSON
      const metadataJson = JSON.stringify(metadata, null, 2);

      // Upload to IPFS
      const result = await ipfs.add(metadataJson);
      const ipfsHash = result.cid.toString();

      console.log('✅ Metadata uploaded to IPFS:', ipfsHash);

      // Cache in database for faster retrieval
      await this.cacheMetadata(ipfsHash, metadata);

      return ipfsHash;
    } catch (error) {
      console.error('❌ Failed to upload metadata to IPFS:', error);

      // Fallback: Store in database and return database ID
      console.log('📁 Falling back to database storage...');

      // Use regular supabase client - RLS policies now allow public inserts
      const { data, error: dbError } = await supabase
        .from('hat_metadata_cache')
        .insert({
          metadata,
          pod_id: metadata.podContext?.podId,
          role_name: metadata.name,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database fallback also failed:', dbError);
        throw new Error(
          `Failed to store metadata: IPFS error: ${(error as Error)?.message || 'Unknown'}, Database error: ${(dbError as Error).message}`,
        );
      }

      console.log('✅ Metadata stored in database fallback:', data.id);
      return `db:${data.id}`;
    }
  }

  /**
   * Retrieve metadata from IPFS hash
   */
  static async getFromIPFS(ipfsHash: string): Promise<HatMetadata | null> {
    try {
      // Check cache first
      const cached = await this.getCachedMetadata(ipfsHash);
      if (cached) {
        console.log('📦 Retrieved metadata from cache');
        return cached;
      }

      const ipfs = this.initializeIPFS();

      console.log('📥 Fetching HAT metadata from IPFS:', ipfsHash);

      const metadata = await ipfs.cat(ipfsHash);

      // Parse if it's a string
      const parsed =
        typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

      console.log('✅ Metadata retrieved from IPFS');

      // Cache for future use
      await this.cacheMetadata(ipfsHash, parsed);

      return parsed;
    } catch (error) {
      console.error('❌ Failed to retrieve metadata from IPFS:', error);
      return null;
    }
  }

  /**
   * Cache metadata in database for faster retrieval
   * Uses regular supabase client - RLS policies allow public inserts
   */
  private static async cacheMetadata(
    ipfsHash: string,
    metadata: HatMetadata,
  ): Promise<void> {
    try {
      await supabase.from('hat_metadata_cache').upsert({
        ipfs_hash: ipfsHash,
        metadata,
        pod_id: metadata.podContext.podId,
        role_name: metadata.name,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('⚠️ Failed to cache metadata:', error);
    }
  }

  /**
   * Get cached metadata from database
   */
  private static async getCachedMetadata(
    ipfsHash: string,
  ): Promise<HatMetadata | null> {
    try {
      const { data, error } = await supabase
        .from('hat_metadata_cache')
        .select('metadata')
        .eq('ipfs_hash', ipfsHash)
        .single();

      if (error || !data) return null;

      return data.metadata as HatMetadata;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update existing metadata and upload new version
   */
  static async updateMetadata(
    currentHash: string,
    updates: Partial<HatMetadata>,
  ): Promise<string> {
    // Get current metadata
    const current = await this.getFromIPFS(currentHash);
    if (!current) {
      throw new Error('Current metadata not found');
    }

    // Merge updates
    const updated: HatMetadata = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Upload new version
    return this.uploadToIPFS(updated);
  }

  /**
   * Check if user has permission to modify a hat
   */
  private static async checkHatModificationPermission(
    hatId: string,
    userAddress: string | undefined,
    walletClient: any,
  ): Promise<boolean> {
    if (!userAddress) {
      console.log('❌ No user address provided');
      return false;
    }

    try {
      const HATS_PROTOCOL_ADDRESS =
        process.env.NEXT_PUBLIC_HATS_PROTOCOL_ADDRESS ||
        '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

      // Use the centralized RPC client to avoid Infura rate limiting
      const { createConfiguredPublicClient } = await import(
        '../utils/rpcClient'
      );
      const publicClient = createConfiguredPublicClient();

      // Import the viem compatibility fix for your specific hat ID
      const { convertHatIdForViem, safeIsWearerOfHat, safeViewHat } =
        await import('../features/pods/utils/viemHatIdFix');

      // Convert hat ID with viem compatibility
      const hatIdBigInt = convertHatIdForViem(hatId);
      console.log('🔧 Converting HAT ID with viem fix:', {
        hatId,
        hatIdBigInt: hatIdBigInt.toString(),
      });

      // Use the comprehensive admin checker instead of basic wearing check
      const { checkHatModificationPermission } = await import(
        '../features/pods/utils/hatAdminChecker'
      );

      const permissionInfo = await checkHatModificationPermission(
        publicClient as any,
        HATS_PROTOCOL_ADDRESS as `0x${string}`,
        hatId,
        userAddress,
      );

      if (permissionInfo.canModifyHat) {
        console.log(
          `✅ User has modification permission via ${permissionInfo.adminCheck}`,
        );
        return true;
      } else {
        console.log(
          '❌ User does not have modification permission:',
          permissionInfo,
        );
        return false;
      }

      // Fetch HAT details
      const hatDetails = await safeViewHat(
        publicClient as any,
        HATS_PROTOCOL_ADDRESS as `0x${string}`,
        hatId,
      );

      // Check if user is wearing this hat
      const isWearer = await publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'isWearerOfHat',
            type: 'function',
            inputs: [
              { name: '_user', type: 'address' },
              { name: '_hatId', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'isWearerOfHat',
        args: [userAddress as `0x${string}`, hatIdBigInt],
      });

      // Check if this is a top hat (special case)
      const isTopHat = await publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'isTopHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'isTopHat',
        args: [hatIdBigInt],
      });

      console.log('🔍 Permission check results:', {
        hatId,
        userAddress,
        isWearer,
        isTopHat,
        hatMutable: hatDetails.mutable,
      });

      // Top hats can modify their own details even if immutable
      if (isTopHat && isWearer) {
        console.log('✅ User is wearing the top hat, can modify details');
        return true;
      }

      // For non-top hats, check if user is an admin
      // For now, we allow wearers to modify their own mutable hats
      // In production, should check full admin hierarchy
      if (isWearer && hatDetails.mutable) {
        console.log('✅ User is wearing a mutable hat, allowing modification');
        return true;
      }

      console.log('❌ User does not have permission to modify this hat');
      return false;
    } catch (error) {
      console.error('❌ Error checking hat modification permission:', error);
      return false;
    }
  }

  /**
   * Sync role permissions and criteria to HAT metadata
   */
  static async syncRoleToHatMetadata(params: {
    roleId: string;
    podId: string;
    hatId: string;
    walletClient?: any;
    updateOnChain?: boolean;
  }): Promise<{
    success: boolean;
    ipfsHash?: string;
    txHash?: string;
    txCall?: {
      to: string;
      data: string;
      value: bigint;
    };
    message?: string;
    error?: string;
  }> {
    try {
      console.log('🔄 Syncing role to HAT metadata:', params);

      // Fetch role data from database
      const { data: role, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', params.roleId)
        .single();

      if (roleError || !role) {
        throw new Error('Role not found');
      }

      // Fetch pod data
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('name')
        .eq('id', params.podId)
        .single();

      if (podError || !pod) {
        throw new Error('Pod not found');
      }

      // Build metadata
      const metadata = this.buildMetadata({
        roleId: role.id,
        roleName: role.role_name,
        roleType: role.role_name.toLowerCase().includes('leader')
          ? 'leader'
          : 'member',
        permissions: role.permissions,
        eligibilityCriteria: role.eligibility_criteria || [],
        podId: params.podId,
        podName: pod.name,
        moduleAddresses: role.module_addresses,
      });

      // Upload to IPFS
      const ipfsHash = await this.uploadToIPFS(metadata);

      // Update database with IPFS hash
      await supabase
        .from('pod_role_permissions')
        .update({
          metadata_hash: ipfsHash,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', params.roleId);

      console.log('✅ Role synced to HAT metadata:', ipfsHash);

      // Update on-chain if requested and wallet client is available
      let txHash: string | undefined;
      if (params.updateOnChain && params.walletClient && role.token_address) {
        try {
          console.log('🔗 Updating HAT details URI on-chain...');

          // Format the IPFS URI
          const ipfsUri = `ipfs://${ipfsHash}`;

          // Import the HATS contract address
          const HATS_PROTOCOL_ADDRESS =
            process.env.NEXT_PUBLIC_HATS_PROTOCOL_ADDRESS ||
            '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

          // Use the actual token address from the role data (not the UUID)
          const hatId = role.token_address;
          console.log('📋 Using token address from database:', hatId);

          // Import the viem compatibility fix
          const { convertHatIdForViem } = await import(
            '../features/pods/utils/viemHatIdFix'
          );

          const hatIdBigInt = convertHatIdForViem(hatId);
          console.log('🔧 Converting HAT ID for transaction:', {
            hatId,
            hatIdBigInt: hatIdBigInt.toString(),
          });

          // CRITICAL: Route through PodAuthProxy for pod leader autonomy
          // The proxy is the admin of pod HATs, not the parent pod

          const userAddress = params.walletClient.account?.address;
          console.log('👤 User address:', userAddress);

          // ✅ FIX: Get the pod proxy address from DATABASE (not blockchain contract)
          // The proxy was just created and saved to DB, but not yet registered on-chain
          const { supabase } = await import('../utils/supabaseClient');
          const { data: podData, error: podError } = await supabase
            .from('pods')
            .select('proxy_contract_address')
            .eq('id', params.podId)
            .single();

          if (podError || !podData) {
            throw new Error(`Pod not found in database: ${params.podId}`);
          }

          const podProxyAddress = podData.proxy_contract_address;

          console.log('🎯 Routing HAT modification through PodAuthProxy:', {
            podId: params.podId,
            proxyAddress: podProxyAddress,
            hatId,
          });

          // Verify proxy address is valid
          if (
            !podProxyAddress ||
            podProxyAddress === '0x0000000000000000000000000000000000000000'
          ) {
            throw new Error(
              `Pod proxy not found for pod ${params.podId}. ` +
                `Pod must be registered via PodAuthorizationFactory first.`,
            );
          }

          // Check if user is a pod leader (can manage through proxy)
          const { createConfiguredPublicClient } = await import(
            '../utils/rpcClient'
          );
          const publicClient = createConfiguredPublicClient();

          const PodAuthProxyABI = await import('../abis/PodAuthProxy.json');

          const canManagePod = await publicClient.readContract({
            address: podProxyAddress as `0x${string}`,
            abi: PodAuthProxyABI.default,
            functionName: 'canManage',
            args: [userAddress as `0x${string}`],
          });

          console.log('🔐 Permission check result:', {
            canManagePod,
            userAddress,
            podId: params.podId,
            proxyAddress: podProxyAddress,
          });

          if (!canManagePod) {
            throw new Error(
              `Permission denied: User ${userAddress} is not a leader of pod ${params.podId}. ` +
                `Only pod leaders can modify HAT details.`,
            );
          }

          console.log(
            '✅ Permission validated - user is pod leader and can modify HAT via proxy',
          );

          // Verify proxy is admin of the HAT
          const isProxyAdmin = await publicClient.readContract({
            address: podProxyAddress as `0x${string}`,
            abi: PodAuthProxyABI.default,
            functionName: 'isProxyAdminOfHat',
            args: [hatIdBigInt],
          });

          if (!isProxyAdmin) {
            console.warn(
              '⚠️ Proxy is not admin of this HAT - transaction will fail',
            );
            throw new Error(
              `Pod proxy is not admin of HAT ${hatId}. ` +
                `This pod may have been created before proxy-admin architecture. ` +
                `Contact support for migration.`,
            );
          }

          console.log(
            '✅ Proxy is admin of HAT - can proceed with modification',
          );

          // Prepare transaction to call proxy's changeHatDetailsViaProxy function
          console.log('🎯 Preparing sponsored transaction via PodAuthProxy');

          // Call proxy instead of direct Hats Protocol
          const txRequest = {
            to: podProxyAddress as `0x${string}`,
            data: encodeFunctionData({
              abi: PodAuthProxyABI.default,
              functionName: 'changeHatDetailsViaProxy',
              args: [hatIdBigInt, ipfsUri],
            }),
            value: 0n,
          };

          console.log('📋 Transaction request:', {
            to: txRequest.to,
            dataLength: txRequest.data.length,
            hatId,
            hatIdBigInt: hatIdBigInt.toString(),
            ipfsUri,
          });

          // IMPORTANT: For sponsored transactions, we need to return the transaction call
          // instead of executing it directly. The calling component should handle
          // the transaction with OnchainKit's Transaction component.

          console.log(
            '⚠️ SPONSORSHIP NOTICE: Transaction prepared but not executed.',
          );
          console.log(
            '💡 The calling component should use OnchainKit Transaction with isSponsored: true',
          );

          // Return the transaction call configuration for OnchainKit
          return {
            success: true,
            ipfsHash,
            txCall: {
              to: txRequest.to,
              data: txRequest.data,
              value: txRequest.value,
            },
            message: 'Transaction prepared for sponsored execution',
          };
        } catch (onChainError) {
          console.error(
            '⚠️ Failed to update on-chain (metadata still saved to IPFS):',
            onChainError,
          );
          // Don't fail the whole operation if on-chain update fails
          // The IPFS upload was successful, so we consider this a partial success
        }
      }

      return { success: true, ipfsHash, txHash };
    } catch (error: any) {
      console.error('❌ Failed to sync role to HAT metadata:', error);
      return {
        success: false,
        error: error?.message || error?.toString() || 'Failed to sync metadata',
      };
    }
  }

  /**
   * Verify permissions from HAT metadata
   */
  static async verifyPermissions(
    ipfsHash: string,
    userAddress: string,
  ): Promise<{
    hasPermission: Record<keyof HatPermissions, boolean>;
    metadata: HatMetadata | null;
  }> {
    const metadata = await this.getFromIPFS(ipfsHash);

    if (!metadata) {
      console.warn('No metadata found for verification');
      return {
        hasPermission: {
          chatAccess: false,
          chatModeration: false,
          forumAccess: false,
          forumModeration: false,
          governanceParticipation: false,
          eventCreation: false,
          treasuryViewing: false,
          treasuryManagement: false,
          memberManagement: false,
          subPodCreation: false,
          roleAssignment: false,
          bountyManagement: false,
          marketplaceAccess: false,
          marketplaceManage: false,
        },
        metadata: null,
      };
    }

    // Return the permissions from metadata
    // Actual eligibility check would be done separately
    return {
      hasPermission: metadata.permissions,
      metadata,
    };
  }
}

export default HatMetadataService;
