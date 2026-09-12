import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  encodePacked,
} from 'viem';
import { base } from 'viem/chains';
import type { EligibilityCriteria } from '@/features/pods/services/EligibilityService';
import { supabase } from '@/utils/supabaseClient';

/**
 * Enhanced service for interacting with Hats Protocol Eligibility Modules
 * Provides on-chain enforcement of eligibility criteria for HAT tokens
 *
 * Architecture:
 * - Database stores criteria configuration (fast, free reads)
 * - On-chain module enforces criteria (secure, costs gas)
 * - Hybrid approach: Database for UI, on-chain for critical operations
 * - Calls are routed through PodAuthProxy for proper authorization
 */
export class EligibilityModuleService {
  private static readonly ELIGIBILITY_MODULE_ADDRESS = process.env
    .NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS as `0x${string}`;

  // Allowed community tokens - ONLY $SELF and $SYSTEM
  private static readonly ALLOWED_TOKENS = {
    SELF: (
      process.env.NEXT_PUBLIC_SELF_TOKEN ||
      '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21'
    ).toLowerCase(),
    SYSTEM: (
      process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
      '0x1317Ae277266D38C4E492558f8693F14143a6A65'
    ).toLowerCase(),
  } as const;

  // Extended ABI with support for multiple criterion types
  private static readonly ABI = parseAbi([
    // IHatsEligibility interface - required by Hats Protocol
    'function getWearerStatus(address _wearer, uint256 _hatId) external view returns (bool eligible, bool standing)',

    // Time-based criteria
    'function addTimeCriterion(uint256 _hatId, uint256 _validFrom, uint256 _validUntil, bool _requireAll) external',

    // Token balance criteria
    'function addTokenBalanceCriterion(uint256 _hatId, address _tokenContract, uint256 _minimumAmount, bool _requireAll) external',

    // Agreement criteria
    'function addAgreementCriterion(uint256 _hatId, bytes32 _agreementHash, bool _requireAll) external',
    'function signAgreement(bytes32 _agreementHash) external',
    'function hasSignedAgreement(bytes32 _agreementHash, address _user) external view returns (bool)',

    // Credential/NFT ownership criteria
    'function addCredentialCriterion(uint256 _hatId, address _credentialContract, uint256 _tokenId, bool _requireAll) external',

    // General criterion management
    'function removeCriterion(uint256 _hatId, uint8 _criterionType, bytes32 _criterionHash) external',
    'function getHatCriteria(uint256 _hatId) external view returns (bytes32[] memory)',
    'function clearAllCriteria(uint256 _hatId) external',

    // Events
    'event CriterionAdded(uint256 indexed hatId, uint8 criterionType, bytes32 criterionHash)',
    'event CriterionRemoved(uint256 indexed hatId, bytes32 criterionHash)',
    'event EligibilityChecked(uint256 indexed hatId, address indexed wearer, bool eligible)',
    'event AgreementSigned(bytes32 indexed agreementHash, address indexed signer, uint256 timestamp)',
  ]);

  private static publicClient = createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
    ),
  });

  // 🚀 V3 PodAuthorizationFactory ABI - ERC-4337 Compatible
  // All functions now accept actualUser parameter for proper authorization with smart wallets
  private static readonly FACTORY_ABI = parseAbi([
    'function addTokenBalanceCriterionViaFactory(string calldata podId, address eligibilityModule, uint256 hatId, address tokenContract, uint256 minimumAmount, bool requireAll, address actualUser) external',
    'function addTimeLimitCriterionViaFactory(string calldata podId, address eligibilityModule, uint256 hatId, uint256 afterTimestamp, uint256 beforeTimestamp, bool requireAll, address actualUser) external',
    'function addAgreementCriterionViaFactory(string calldata podId, address eligibilityModule, uint256 hatId, string calldata agreementCid, bool requireAll, address actualUser) external',
    'function addHatsWornCriterionViaFactory(string calldata podId, address eligibilityModule, uint256 hatId, uint256[] calldata hatsRequired, bool requireAll, address actualUser) external',
    'function clearAllCriteriaViaFactory(string calldata podId, address eligibilityModule, uint256 hatId, address actualUser) external',
  ]);

  private static readonly FACTORY_ADDRESS = process.env
    .NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`;

  // Criterion type enum (matches Solidity contract)
  static readonly CriterionType = {
    TOKEN_BALANCE: 0,
    TIME_BASED: 1,
    AGREEMENT_SIGNED: 2,
    CREDENTIAL_OWNERSHIP: 3,
    REPUTATION_SCORE: 4,
    STAKING: 5,
  } as const;

  /**
   * Add time-based criterion to a HAT
   */
  static async addTimeBoundCriterion(
    hatId: bigint,
    validFrom: Date | null,
    validUntil: Date | null,
    requireAll = true,
    walletClient: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        throw new Error('EligibilityModule address not configured');
      }

      // Convert dates to timestamps (0 means no restriction)
      const validFromTimestamp = validFrom
        ? BigInt(Math.floor(validFrom.getTime() / 1000))
        : 0n;
      const validUntilTimestamp = validUntil
        ? BigInt(Math.floor(validUntil.getTime() / 1000))
        : 0n;

      console.log('🕐 Adding time-bound criterion:', {
        hatId: hatId.toString(),
        validFrom: validFrom?.toISOString(),
        validUntil: validUntil?.toISOString(),
        validFromTimestamp: validFromTimestamp.toString(),
        validUntilTimestamp: validUntilTimestamp.toString(),
        requireAll,
      });

      const txHash = await walletClient.writeContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'addTimeCriterion',
        args: [hatId, validFromTimestamp, validUntilTimestamp, requireAll],
      });

      console.log('✅ Time-bound criterion added:', txHash);

      return { success: true, txHash };
    } catch (error: any) {
      console.error('❌ Failed to add time-bound criterion:', error);
      return {
        success: false,
        error: error.message || 'Failed to add time-bound criterion',
      };
    }
  }

  /**
   * Check if an address is eligible for a HAT
   */
  static async checkEligibility(
    wearerAddress: `0x${string}`,
    hatId: bigint,
  ): Promise<{ eligible: boolean; standing: boolean; error?: string }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        throw new Error('EligibilityModule address not configured');
      }

      const result = await this.publicClient.readContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'getWearerStatus',
        args: [wearerAddress, hatId],
      });

      return {
        eligible: result[0],
        standing: result[1],
      };
    } catch (error: any) {
      console.error('❌ Failed to check eligibility:', error);
      return {
        eligible: false,
        standing: false,
        error: error.message || 'Failed to check eligibility',
      };
    }
  }

  /**
   * Get all criteria for a HAT
   */
  static async getHatCriteria(hatId: bigint): Promise<string[]> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        return [];
      }

      const criteria = await this.publicClient.readContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'getHatCriteria',
        args: [hatId],
      });

      return criteria.map((c) => c.toString());
    } catch (error: any) {
      console.error('❌ Failed to get HAT criteria:', error);
      return [];
    }
  }

  /**
   * Remove a criterion from a HAT
   */
  static async removeCriterion(
    hatId: bigint,
    criterionType: number,
    criterionHash: `0x${string}`,
    walletClient: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        throw new Error('EligibilityModule address not configured');
      }

      const txHash = await walletClient.writeContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'removeCriterion',
        args: [hatId, criterionType, criterionHash],
      });

      console.log('✅ Criterion removed:', txHash);

      return { success: true, txHash };
    } catch (error: any) {
      console.error('❌ Failed to remove criterion:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove criterion',
      };
    }
  }

  /**
   * Sign an agreement (for agreement-based criteria)
   */
  static async signAgreement(
    agreementHash: `0x${string}`,
    walletClient: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        throw new Error('EligibilityModule address not configured');
      }

      const txHash = await walletClient.writeContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'signAgreement',
        args: [agreementHash],
      });

      console.log('✅ Agreement signed:', txHash);

      return { success: true, txHash };
    } catch (error: any) {
      console.error('❌ Failed to sign agreement:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign agreement',
      };
    }
  }

  /**
   * Check if user has signed an agreement
   */
  static async hasSignedAgreement(
    agreementHash: `0x${string}`,
    userAddress: `0x${string}`,
  ): Promise<boolean> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        return false;
      }

      const result = await this.publicClient.readContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'hasSignedAgreement',
        args: [agreementHash, userAddress],
      });

      return result;
    } catch (error: any) {
      console.error('❌ Failed to check agreement signature:', error);
      return false;
    }
  }

  /**
   * Generate criterion hash for time-based criteria
   * Matches the Solidity implementation: keccak256(abi.encodePacked(_validFrom, _validUntil))
   */
  static generateTimeCriterionHash(
    validFrom: Date | null,
    validUntil: Date | null,
  ): `0x${string}` {
    const validFromTimestamp = validFrom
      ? BigInt(Math.floor(validFrom.getTime() / 1000))
      : 0n;
    const validUntilTimestamp = validUntil
      ? BigInt(Math.floor(validUntil.getTime() / 1000))
      : 0n;

    return keccak256(
      encodePacked(
        ['uint256', 'uint256'],
        [validFromTimestamp, validUntilTimestamp],
      ),
    );
  }

  /**
   * Generate hash for agreement criterion
   */
  static generateAgreementHash(agreementText: string): `0x${string}` {
    return keccak256(encodePacked(['string'], [agreementText]));
  }

  /**
   * Generate hash for token balance criterion
   */
  static generateTokenBalanceHash(
    tokenContract: string,
    minimumAmount: string,
  ): `0x${string}` {
    return keccak256(
      encodePacked(
        ['address', 'uint256'],
        [tokenContract as `0x${string}`, BigInt(minimumAmount)],
      ),
    );
  }

  /**
   * Generate hash for credential criterion
   */
  static generateCredentialHash(
    credentialContract: string,
    tokenId: string,
  ): `0x${string}` {
    return keccak256(
      encodePacked(
        ['address', 'uint256'],
        [credentialContract as `0x${string}`, BigInt(tokenId || '0')],
      ),
    );
  }

  /**
   * Validate token address - ONLY $SELF and $SYSTEM allowed
   * @throws Error if token is not allowed
   */
  static validateTokenAddress(tokenAddress: string): void {
    const normalizedAddress = tokenAddress.toLowerCase();
    const isAllowed =
      normalizedAddress === this.ALLOWED_TOKENS.SELF ||
      normalizedAddress === this.ALLOWED_TOKENS.SYSTEM;

    if (!isAllowed) {
      const allowedNames = `$SELF (${this.ALLOWED_TOKENS.SELF}) or $SYSTEM (${this.ALLOWED_TOKENS.SYSTEM})`;
      throw new Error(
        `Invalid token address: ${tokenAddress}. Only community tokens are allowed: ${allowedNames}`,
      );
    }
  }

  /**
   * Get token name from address
   */
  static getTokenName(tokenAddress: string): '$SELF' | '$SYSTEM' | 'UNKNOWN' {
    const normalized = tokenAddress.toLowerCase();
    if (normalized === this.ALLOWED_TOKENS.SELF) return '$SELF';
    if (normalized === this.ALLOWED_TOKENS.SYSTEM) return '$SYSTEM';
    return 'UNKNOWN';
  }

  /**
   * Parse token amount from human-readable format to Wei
   * Converts decimal amounts like "99.998" to "99998000000000000000"
   * @param amount Human-readable token amount (e.g., "99.998", "1.5", "100")
   * @returns BigInt amount in Wei (10^18 smallest units)
   */
  static parseTokenAmount(amount: string | number): bigint {
    const amountStr = String(amount);

    // Split on decimal point
    const [whole, decimal = ''] = amountStr.split('.');

    // Pad decimal part to 18 digits (Wei has 18 decimals)
    const paddedDecimal = decimal.padEnd(18, '0');

    // Combine whole and decimal parts
    const weiString = whole + paddedDecimal;

    // Convert to BigInt
    return BigInt(weiString);
  }

  /**
   * Get pod ID for a given HAT ID
   * Criteria management MUST be routed through the factory (which uses podId)
   * IMPORTANT: Returns blockchain_pod_id (format: "pod-{timestamp}-{random}"), NOT the database UUID
   */
  private static async getPodId(hatId: bigint): Promise<string | null> {
    try {
      console.log(
        '🔍 Looking up blockchain pod ID for HAT ID:',
        hatId.toString(),
      );

      // management_hat_id is stored inconsistently: most pods hold the padded
      // hex form ("0x00000749…"), one holds the decimal. Matching only the
      // decimal missed every hex pod and returned a 406 from PostgREST, which
      // surfaced as "no pod found" for pods that plainly exist. Match either.
      const asDecimal = hatId.toString();
      const asHex = `0x${hatId.toString(16).padStart(64, '0')}`;

      const { data: rows, error } = await supabase
        .from('pods')
        .select('blockchain_pod_id, name, proxy_contract_address')
        .or(
          `management_hat_id.eq.${asDecimal},management_hat_id.eq.${asHex}`,
        )
        .limit(1);

      if (error) {
        console.error('❌ Database query error:', error);
        return null;
      }

      const data = rows?.[0];

      if (!data) {
        console.warn(
          `⚠️ No pod is registered against HAT ${asDecimal} (${asHex}).`,
        );
        return null;
      }

      if (!data?.blockchain_pod_id) {
        console.error(
          '❌ No blockchain_pod_id found for HAT:',
          hatId.toString(),
        );
        console.error(
          '   This pod may have been created before the blockchain_pod_id migration.',
        );
        console.error(
          '   Solution: Recreate this pod using the latest pod creation flow.',
        );
        return null;
      }

      if (
        !data.proxy_contract_address ||
        data.proxy_contract_address === 'pending' ||
        data.proxy_contract_address === 'pending_creation'
      ) {
        console.warn('⚠️ Pod proxy is still pending deployment:', data.name);
        return null;
      }

      console.log(
        `✅ Found blockchain pod ID for pod "${data.name}":`,
        data.blockchain_pod_id,
      );
      console.log('🔍 TRACE: getPodId() returning:', {
        blockchain_pod_id: data.blockchain_pod_id,
        pod_name: data.name,
        proxy_address: data.proxy_contract_address,
        query_hat_id: hatId.toString(),
      });
      return data.blockchain_pod_id;
    } catch (error) {
      console.error('❌ Failed to get blockchain pod ID:', error);
      return null;
    }
  }

  /**
   * 🔥 MAIN SYNC METHOD - Synchronize all eligibility criteria to on-chain module
   * This is the bridge between database configuration and on-chain enforcement
   *
   * IMPORTANT: All calls are routed through PodAuthProxy for proper authorization
   * - User calls proxy (as pod leader)
   * - Proxy forwards to eligibility module (as admin)
   * - This is the ONLY way to manage criteria on-chain
   */
  static async syncAllCriteriaToModule(
    hatId: string | bigint,
    criteria: EligibilityCriteria[],
    walletClient: any,
    clearExisting = true,
  ): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
    txHashes: string[];
  }> {
    const result = {
      success: false,
      syncedCount: 0,
      errors: [] as string[],
      txHashes: [] as string[],
    };

    try {
      // Pre-validate all criteria BEFORE checking module address
      // This allows us to see validation errors even without module deployed
      console.log('🔍 Pre-validating criteria before sync...');
      let validationErrors: string[] = [];

      for (const criterion of criteria) {
        if (criterion.type === 'token_balance' && criterion.contract_address) {
          try {
            this.validateTokenAddress(criterion.contract_address);
            const tokenName = this.getTokenName(criterion.contract_address);
            console.log(
              `  ✅ ${tokenName} token validated: ${criterion.contract_address}`,
            );
          } catch (validationError) {
            const error = validationError as Error;
            console.error(`  ❌ Token validation failed:`, error.message);
            validationErrors.push(`Token validation failed: ${error.message}`);
          }
        }
      }

      // If validation errors exist, return early
      if (validationErrors.length > 0) {
        result.errors = validationErrors;
        console.log('❌ Validation failed, aborting sync');
        return result;
      }

      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        result.errors.push('Eligibility module address not configured');
        console.log(
          '⚠️ Module address not configured - validation passed but cannot sync on-chain',
        );
        return result;
      }

      const hatIdBigInt = typeof hatId === 'string' ? BigInt(hatId) : hatId;

      // 🔥 CRITICAL: Get pod ID to route calls through factory (for sponsored transactions)
      const podId = await this.getPodId(hatIdBigInt);

      if (!podId) {
        // Not a save failure: the criteria are already written to the database
        // and the app enforces them. Only on-chain publication is unavailable,
        // which is the normal state for a pod whose proxy was never deployed.
        result.errors.push(
          'Requirements saved. They cannot be published on-chain because this pod has no deployed proxy contract, so they are enforced in the app only.',
        );
        console.warn(
          '⚠️ Skipping on-chain eligibility sync: no pod with a deployed proxy contract for this HAT.',
        );
        return result;
      }

      if (!this.FACTORY_ADDRESS) {
        result.errors.push(
          'Factory address not configured (NEXT_PUBLIC_POD_AUTH_FACTORY)',
        );
        return result;
      }

      console.log('🔄 Syncing eligibility criteria to on-chain module:', {
        podId,
        hatId: hatIdBigInt.toString(),
        criteriaCount: criteria.length,
        clearExisting,
        moduleAddress: this.ELIGIBILITY_MODULE_ADDRESS,
        routingViaFactory: this.FACTORY_ADDRESS,
      });

      // Step 1: Optionally clear existing criteria (via factory - SPONSORED)
      if (clearExisting) {
        try {
          console.log(
            '🧹 Clearing existing criteria via factory (sponsored)...',
          );
          const actualUser = await walletClient.account.address;
          const clearTx = await walletClient.writeContract({
            address: this.FACTORY_ADDRESS, // ← Route through factory (sponsored)
            abi: this.FACTORY_ABI,
            functionName: 'clearAllCriteriaViaFactory',
            args: [
              podId,
              this.ELIGIBILITY_MODULE_ADDRESS,
              hatIdBigInt,
              actualUser,
            ], // ✅ FIXED: Added actualUser
          });
          result.txHashes.push(clearTx);
          console.log('✅ Cleared existing criteria via factory:', clearTx);
        } catch (error: any) {
          console.warn(
            '⚠️ Could not clear existing criteria (may not exist):',
            error.message,
          );
        }
      }

      // Step 2: Add each criterion to the module
      for (const criterion of criteria) {
        try {
          let txHash: string | null = null;

          switch (criterion.type) {
            case 'token_balance':
              if (criterion.contract_address && criterion.minimum_amount) {
                // Token already validated in pre-validation step
                const tokenName = this.getTokenName(criterion.contract_address);
                console.log(
                  `🎫 Syncing ${tokenName} token balance requirement: ${criterion.minimum_amount} (SPONSORED)`,
                );

                const actualUser = await walletClient.account.address;
                txHash = await walletClient.writeContract({
                  address: this.FACTORY_ADDRESS, // ← Route through factory (sponsored)
                  abi: this.FACTORY_ABI,
                  functionName: 'addTokenBalanceCriterionViaFactory',
                  args: [
                    podId, // ← Pod ID required for factory routing
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    criterion.contract_address as `0x${string}`,
                    BigInt(criterion.minimum_amount),
                    criterion.required !== false, // Default to required
                    actualUser, // ✅ FIXED: Added actualUser
                  ],
                });
                console.log(
                  `✅ Added token balance criterion via factory (sponsored): ${txHash}`,
                );
              }
              break;

            case 'time_based':
              if (criterion.valid_until) {
                // At least expiration is required
                const validFrom = criterion.valid_from
                  ? new Date(criterion.valid_from)
                  : null;
                const validUntil = new Date(criterion.valid_until);

                const actualUser = await walletClient.account.address;
                txHash = await walletClient.writeContract({
                  address: this.FACTORY_ADDRESS, // ← Route through factory (sponsored)
                  abi: this.FACTORY_ABI,
                  functionName: 'addTimeLimitCriterionViaFactory',
                  args: [
                    podId, // ← Pod ID required for factory routing
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    validFrom
                      ? BigInt(Math.floor(validFrom.getTime() / 1000))
                      : 0n,
                    BigInt(Math.floor(validUntil.getTime() / 1000)),
                    criterion.required !== false,
                    actualUser, // ✅ FIXED: Added actualUser
                  ],
                });
                console.log(
                  `✅ Added time-based criterion via factory (sponsored): ${txHash}`,
                );
              }
              break;

            case 'agreement_signed':
              if (criterion.agreement_text) {
                // Note: Factory expects agreementCid (string) not hash (bytes32)
                // This will need to be adjusted based on your actual implementation
                result.errors.push(
                  'Agreement criteria not yet supported via factory - requires IPFS CID format',
                );
                console.warn(
                  '⚠️ Agreement criteria requires IPFS CID format for factory routing',
                );
              }
              break;

            case 'credential_ownership':
            case 'nft_ownership':
              // Note: Credential/NFT criteria use addHatsWornCriterionViaFactory in the factory
              // But requires different argument structure (array of hat IDs)
              result.errors.push(
                'Credential/NFT criteria not yet supported via factory - requires implementation update',
              );
              console.warn(
                '⚠️ Credential criteria requires factory implementation update',
              );
              break;

            case 'staking':
              result.errors.push(
                `Staking criteria not yet supported on-chain: ${criterion.name}`,
              );
              break;

            default:
              result.errors.push(`Unknown criterion type: ${criterion.type}`);
          }

          if (txHash) {
            result.txHashes.push(txHash);
            result.syncedCount++;
          }
        } catch (error: any) {
          const errorMsg = `Failed to sync criterion ${criterion.name || criterion.type}: ${error.message}`;
          console.error('❌', errorMsg);
          result.errors.push(errorMsg);
        }
      }

      result.success = result.syncedCount > 0 || criteria.length === 0;

      console.log('✅ Criteria sync complete:', {
        syncedCount: result.syncedCount,
        totalCriteria: criteria.length,
        errors: result.errors.length,
        txHashes: result.txHashes.length,
      });

      return result;
    } catch (error: any) {
      console.error('❌ Criteria sync failed:', error);
      result.errors.push(error.message || 'Unknown error during sync');
      return result;
    }
  }

  /**
   * 🚀 NEW: Build eligibility criteria sync transaction calls for OnchainKit
   * This is the PROPER way to sync criteria with Coinbase Smart Wallets
   *
   * Returns call objects that can be passed to OnchainKit <Transaction> component
   * for proper account abstraction and sponsored transaction handling
   *
   * @param hatId HAT ID to sync criteria for
   * @param criteria Array of eligibility criteria to sync
   * @param clearExisting Whether to clear existing criteria first (default: true)
   * @returns Object with call objects and metadata
   */
  static async buildSyncCriteriaCalls(
    hatId: string | bigint,
    criteria: EligibilityCriteria[],
    clearExisting = true,
  ): Promise<{
    success: boolean;
    calls: any[];
    criteriaCount: number;
    errors: string[];
    podId?: string;
  }> {
    const result = {
      success: false,
      calls: [] as any[],
      criteriaCount: 0,
      errors: [] as string[],
      podId: undefined as string | undefined,
    };

    try {
      // Step 1: Pre-validate all criteria
      console.log('🔍 Pre-validating criteria before building calls...');

      for (const criterion of criteria) {
        if (criterion.type === 'token_balance' && criterion.contract_address) {
          try {
            this.validateTokenAddress(criterion.contract_address);
            const tokenName = this.getTokenName(criterion.contract_address);
            console.log(
              `  ✅ ${tokenName} token validated: ${criterion.contract_address}`,
            );
          } catch (validationError) {
            const error = validationError as Error;
            console.error(`  ❌ Token validation failed:`, error.message);
            result.errors.push(`Token validation failed: ${error.message}`);
          }
        }
      }

      // If validation errors exist, return early
      if (result.errors.length > 0) {
        console.log('❌ Validation failed, aborting call building');
        return result;
      }

      // Step 2: Check module configuration
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        result.errors.push('Eligibility module address not configured');
        console.log('⚠️ Module address not configured');
        return result;
      }

      const hatIdBigInt = typeof hatId === 'string' ? BigInt(hatId) : hatId;

      // Step 3: Get pod ID for factory routing
      const podId = await this.getPodId(hatIdBigInt);

      if (!podId) {
        result.errors.push(
          'No pod found for this HAT - cannot manage criteria',
        );
        console.error(
          '❌ Pod must exist with a deployed proxy contract to manage eligibility criteria',
        );
        return result;
      }

      result.podId = podId;

      if (!this.FACTORY_ADDRESS) {
        result.errors.push(
          'Factory address not configured (NEXT_PUBLIC_POD_AUTH_FACTORY)',
        );
        return result;
      }

      console.log('🔨 Building eligibility criteria sync calls:', {
        podId,
        hatId: hatIdBigInt.toString(),
        criteriaCount: criteria.length,
        clearExisting,
        moduleAddress: this.ELIGIBILITY_MODULE_ADDRESS,
        routingViaFactory: this.FACTORY_ADDRESS,
      });

      console.log('🔍 TRACE: buildSyncCriteriaCalls received podId:', podId);
      console.log('🔍 TRACE: podId type:', typeof podId);
      console.log('🔍 TRACE: podId length:', podId?.length);

      // Step 4: Build clear call if needed
      if (clearExisting) {
        console.log('🧹 Adding clear criteria call...');

        const clearCallArgs = [
          podId,
          this.ELIGIBILITY_MODULE_ADDRESS,
          hatIdBigInt,
          '__USER_ADDRESS__',
        ];

        console.log('🔍 TRACE: clearAllCriteriaViaFactory args:', {
          arg0_podId: clearCallArgs[0],
          arg1_moduleAddress: clearCallArgs[1],
          arg2_hatId: clearCallArgs[2].toString(),
          arg3_userPlaceholder: clearCallArgs[3],
        });

        // Get user's wallet address for authorization
        // NOTE: actualUser parameter will be injected by buildSyncCallsForRole
        result.calls.push({
          address: this.FACTORY_ADDRESS,
          abi: this.FACTORY_ABI,
          functionName: 'clearAllCriteriaViaFactory',
          args: clearCallArgs,
        });
      }

      // Step 5: Build calls for each criterion
      for (const criterion of criteria) {
        try {
          switch (criterion.type) {
            case 'token_balance':
              if (criterion.contract_address && criterion.minimum_amount) {
                const tokenName = this.getTokenName(criterion.contract_address);
                console.log(
                  `🎫 Adding ${tokenName} token balance call: ${criterion.minimum_amount}`,
                );

                // Convert human-readable amount to Wei (multiply by 10^18)
                // e.g., "99.998" → "99998000000000000000"
                const amountInWei = this.parseTokenAmount(
                  criterion.minimum_amount,
                );

                result.calls.push({
                  address: this.FACTORY_ADDRESS,
                  abi: this.FACTORY_ABI,
                  functionName: 'addTokenBalanceCriterionViaFactory',
                  args: [
                    podId,
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    criterion.contract_address as `0x${string}`,
                    amountInWei, // ✅ FIXED: Use Wei amount
                    criterion.required !== false,
                    '__USER_ADDRESS__', // ← Placeholder for user's wallet
                  ],
                });
                result.criteriaCount++;
              }
              break;

            case 'time_based':
              if (criterion.valid_until) {
                const validFrom = criterion.valid_from
                  ? new Date(criterion.valid_from)
                  : null;
                const validUntil = new Date(criterion.valid_until);

                console.log(
                  `⏰ Adding time-based call: ${validFrom ? validFrom.toISOString() : 'no start'} to ${validUntil.toISOString()}`,
                );

                result.calls.push({
                  address: this.FACTORY_ADDRESS,
                  abi: this.FACTORY_ABI,
                  functionName: 'addTimeLimitCriterionViaFactory',
                  args: [
                    podId,
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    validFrom
                      ? BigInt(Math.floor(validFrom.getTime() / 1000))
                      : 0n,
                    BigInt(Math.floor(validUntil.getTime() / 1000)),
                    criterion.required !== false,
                    '__USER_ADDRESS__', // ← Placeholder for user's wallet
                  ],
                });
                result.criteriaCount++;
              }
              break;

            case 'agreement_signed':
              if (criterion.agreement_cid) {
                console.log(
                  `📜 Adding agreement criterion with CID: ${criterion.agreement_cid}`,
                );

                result.calls.push({
                  address: this.FACTORY_ADDRESS,
                  abi: this.FACTORY_ABI,
                  functionName: 'addAgreementCriterionViaFactory',
                  args: [
                    podId,
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    criterion.agreement_cid, // IPFS CID (e.g., "QmXk7...abc123")
                    criterion.required !== false,
                    '__USER_ADDRESS__', // ← Placeholder for user's wallet
                  ],
                });
                result.criteriaCount++;
              } else {
                result.errors.push(
                  'Agreement criteria requires IPFS CID - please upload agreement text to IPFS first',
                );
                console.warn('⚠️ Agreement missing IPFS CID');
              }
              break;

            case 'credential_ownership':
              // HAT-based credentials (multiple HAT IDs required)
              if (
                criterion.required_hat_ids &&
                criterion.required_hat_ids.length > 0
              ) {
                console.log(
                  `🎩 Adding HAT-worn criterion: ${criterion.required_hat_ids.length} HATs required`,
                );

                const requiredHatsBigInt = criterion.required_hat_ids.map(
                  (id) => BigInt(id),
                );

                result.calls.push({
                  address: this.FACTORY_ADDRESS,
                  abi: this.FACTORY_ABI,
                  functionName: 'addHatsWornCriterionViaFactory',
                  args: [
                    podId,
                    this.ELIGIBILITY_MODULE_ADDRESS,
                    hatIdBigInt,
                    requiredHatsBigInt, // Array of required HAT IDs
                    criterion.required !== false,
                    '__USER_ADDRESS__', // ← Placeholder for user's wallet
                  ],
                });
                result.criteriaCount++;
              } else {
                result.errors.push(
                  'Credential criteria requires either required_hat_ids (HAT-based) or contract_address (NFT-based)',
                );
                console.warn('⚠️ Credential criteria missing required fields');
              }
              break;

            case 'nft_ownership':
              result.errors.push(
                'NFT ownership criteria not yet supported via factory - use HAT-based credentials instead',
              );
              console.warn(
                '⚠️ NFT criteria requires factory implementation update',
              );
              break;

            case 'staking':
              result.errors.push(
                `Staking criteria not yet supported on-chain: ${criterion.name}`,
              );
              break;

            default:
              result.errors.push(`Unknown criterion type: ${criterion.type}`);
          }
        } catch (error: any) {
          const errorMsg = `Failed to build call for criterion ${criterion.name || criterion.type}: ${error.message}`;
          console.error('❌', errorMsg);
          result.errors.push(errorMsg);
        }
      }

      result.success = result.calls.length > 0;

      console.log('✅ Criteria sync calls built:', {
        totalCalls: result.calls.length,
        criteriaCount: result.criteriaCount,
        errors: result.errors.length,
      });

      return result;
    } catch (error: any) {
      console.error('❌ Failed to build criteria sync calls:', error);
      result.errors.push(error.message || 'Unknown error during call building');
      return result;
    }
  }

  /**
   * Check if Phase 7 (setHatAdmin) has been executed for a given HAT
   * Returns true if the proxy is set as admin for the HAT on the eligibility module
   */
  static async checkIfProxyIsAdmin(
    hatId: bigint,
    proxyAddress: `0x${string}`,
  ): Promise<{
    isAdmin: boolean;
    currentAdmin?: string;
    error?: string;
  }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        return {
          isAdmin: false,
          error: 'Eligibility module address not configured',
        };
      }

      console.log('🔍 Checking if proxy is admin for HAT:', {
        hatId: hatId.toString(),
        proxyAddress,
        moduleAddress: this.ELIGIBILITY_MODULE_ADDRESS,
      });

      // Read hatAdmins[hatId] from eligibility module
      const hatAdminAbi = parseAbi([
        'function hatAdmins(uint256) external view returns (address)',
      ]);

      const currentAdmin = (await this.publicClient.readContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: hatAdminAbi,
        functionName: 'hatAdmins',
        args: [hatId],
      })) as `0x${string}`;

      console.log('📋 Current eligibility admin for HAT:', {
        hatId: hatId.toString(),
        currentAdmin,
        expectedProxy: proxyAddress,
        isMatch: currentAdmin.toLowerCase() === proxyAddress.toLowerCase(),
      });

      const isAdmin = currentAdmin.toLowerCase() === proxyAddress.toLowerCase();
      const isZeroAddress =
        currentAdmin === '0x0000000000000000000000000000000000000000';

      if (isZeroAddress) {
        console.log('⚠️ Phase 7 was never executed - no admin set');
      } else if (!isAdmin) {
        console.log(
          '⚠️ Phase 7 was executed, but with different admin:',
          currentAdmin,
        );
      } else {
        console.log('✅ Phase 7 completed - proxy is correctly set as admin');
      }

      return {
        isAdmin,
        currentAdmin,
      };
    } catch (error: any) {
      console.error('❌ Failed to check if proxy is admin:', error);
      return {
        isAdmin: false,
        error: error.message || 'Failed to read hatAdmins mapping',
      };
    }
  }

  /**
   * Build Phase 7 setHatAdmin call for OnchainKit Transaction
   * This call authorizes the proxy to manage eligibility criteria for a HAT
   */
  static buildPhase7SetAdminCall(
    hatId: bigint,
    proxyAddress: `0x${string}`,
  ): {
    address: `0x${string}`;
    abi: any[];
    functionName: string;
    args: any[];
  } {
    if (!this.ELIGIBILITY_MODULE_ADDRESS) {
      throw new Error('Eligibility module address not configured');
    }

    console.log('🔨 Building Phase 7 setHatAdmin call:', {
      hatId: hatId.toString(),
      proxyAddress,
      moduleAddress: this.ELIGIBILITY_MODULE_ADDRESS,
    });

    return {
      address: this.ELIGIBILITY_MODULE_ADDRESS,
      abi: [
        {
          name: 'setHatAdmin',
          type: 'function',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_admin', type: 'address' },
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'setHatAdmin',
      args: [hatId, proxyAddress],
    };
  }

  /**
   * Get pod proxy address for a given HAT ID
   * Public helper for Phase 7 detection
   */
  static async getProxyAddressForHat(hatId: bigint): Promise<{
    proxyAddress: `0x${string}` | null;
    podId: string | null;
    error?: string;
  }> {
    try {
      console.log('🔍 Fetching proxy address for HAT:', hatId.toString());

      const { data, error } = await supabase
        .from('pods')
        .select('blockchain_pod_id, proxy_contract_address')
        .eq('management_hat_id', hatId.toString())
        .single();

      if (error) {
        console.error('❌ Database query error:', error);
        return {
          proxyAddress: null,
          podId: null,
          error: error.message,
        };
      }

      if (
        !data?.proxy_contract_address ||
        data.proxy_contract_address === 'pending' ||
        data.proxy_contract_address === 'pending_creation'
      ) {
        console.warn(
          '⚠️ Proxy address not available for HAT:',
          hatId.toString(),
        );
        return {
          proxyAddress: null,
          podId: data?.blockchain_pod_id || null,
          error: 'Proxy address not yet deployed',
        };
      }

      console.log('✅ Found proxy address:', {
        hatId: hatId.toString(),
        proxyAddress: data.proxy_contract_address,
        podId: data.blockchain_pod_id,
      });

      return {
        proxyAddress: data.proxy_contract_address as `0x${string}`,
        podId: data.blockchain_pod_id,
      };
    } catch (error: any) {
      console.error('❌ Failed to get proxy address:', error);
      return {
        proxyAddress: null,
        podId: null,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Check if module is configured and accessible
   */
  static async checkModuleStatus(): Promise<{
    configured: boolean;
    accessible: boolean;
    address?: string;
    error?: string;
  }> {
    try {
      if (!this.ELIGIBILITY_MODULE_ADDRESS) {
        return {
          configured: false,
          accessible: false,
          error:
            'NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS not set in environment',
        };
      }

      // Try to read a simple value to check if contract exists
      const testHatId = 1n;
      await this.publicClient.readContract({
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        abi: this.ABI,
        functionName: 'getHatCriteria',
        args: [testHatId],
      });

      return {
        configured: true,
        accessible: true,
        address: this.ELIGIBILITY_MODULE_ADDRESS,
      };
    } catch (error: any) {
      return {
        configured: true,
        accessible: false,
        address: this.ELIGIBILITY_MODULE_ADDRESS,
        error: error.message || 'Module contract not accessible',
      };
    }
  }

  /**
   * Get module address for use in HAT creation
   */
  static getModuleAddress(): `0x${string}` | null {
    return this.ELIGIBILITY_MODULE_ADDRESS || null;
  }

  /**
   * Validate time range
   */
  static validateTimeRange(
    validFrom: Date | null,
    validUntil: Date | null,
  ): { valid: boolean; error?: string } {
    if (validFrom && validUntil && validFrom >= validUntil) {
      return {
        valid: false,
        error: 'Valid from date must be before valid until date',
      };
    }

    if (validFrom && validFrom < new Date()) {
      return { valid: false, error: 'Valid from date cannot be in the past' };
    }

    return { valid: true };
  }

  /**
   * Format time criterion for display
   */
  static formatTimeCriterion(
    validFrom: Date | null,
    validUntil: Date | null,
  ): string {
    if (!validFrom && !validUntil) {
      return 'No time restrictions';
    }

    const fromStr = validFrom
      ? validFrom.toLocaleDateString()
      : 'No start date';
    const untilStr = validUntil
      ? validUntil.toLocaleDateString()
      : 'No end date';

    if (validFrom && validUntil) {
      const duration = Math.ceil(
        (validUntil.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24),
      );
      return `${fromStr} to ${untilStr} (${duration} days)`;
    }

    return `From: ${fromStr}, Until: ${untilStr}`;
  }
}

export default EligibilityModuleService;
