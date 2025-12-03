import { ethers, AbiCoder, keccak256 } from 'ethers';
import { supabase } from '@/utils/supabaseClient';
import type { EligibilityCriteria } from './EligibilityService';

// ABI for our EligibilityModule contract
const ELIGIBILITY_MODULE_ABI = [
  {
    type: 'function',
    name: 'initialize',
    inputs: [{ name: '_hats', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addTokenBalanceCriterion',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_contractAddress', type: 'address' },
      { name: '_minimumAmount', type: 'uint256' },
      { name: '_requireAll', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addNFTOwnershipCriterion',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_contractAddress', type: 'address' },
      { name: '_tokenId', type: 'uint256' },
      { name: '_isERC1155', type: 'bool' },
      { name: '_requireAll', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addAgreementCriterion',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_requireAll', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeCriterion',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_criterionType', type: 'uint8' },
      { name: '_criterionHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getWearerStatus',
    inputs: [
      { name: '_wearer', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    outputs: [
      { name: 'eligible', type: 'bool' },
      { name: 'standing', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getHatCriteria',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'signAgreement',
    inputs: [{ name: '_agreementHash', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'hasSignedAgreement',
    inputs: [
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// HATS Module Factory ABI (simplified)
const HATS_MODULE_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createHatsModule',
    inputs: [
      { name: 'implementation', type: 'address' },
      { name: 'hatId', type: 'uint256' },
      { name: 'otherImmutableArgs', type: 'bytes' },
      { name: 'initData', type: 'bytes' },
    ],
    outputs: [{ name: 'instance', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getHatsModuleAddress',
    inputs: [
      { name: 'implementation', type: 'address' },
      { name: 'hatId', type: 'uint256' },
      { name: 'otherImmutableArgs', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

export interface HatsModuleDeployment {
  id: string;
  pod_id: string;
  token_address: string; // ERC-1155 token ID (formerly hat_id)
  module_address: string;
  implementation_address: string;
  criteria_hash: string;
  deployment_tx: string;
  deployment_block: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'error';
  last_synced_at?: string;
  sync_error?: string;
}

export interface DeploymentConfig {
  hatId: string;
  podId: string;
  criteria: EligibilityCriteria[];
  requireAllCriteria: boolean;
  deployer: string;
}

export class HatsModuleDeploymentService {
  private static readonly HATS_ADDRESS = process.env
    .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
  private static readonly MODULE_FACTORY_ADDRESS = process.env
    .NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS as `0x${string}`;
  private static readonly ELIGIBILITY_MODULE_IMPLEMENTATION = process.env
    .NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS as `0x${string}`;

  /**
   * Validate required environment variables
   */
  private static validateEnvironment(): void {
    const missingVars: string[] = [];

    if (!this.HATS_ADDRESS) missingVars.push('NEXT_PUBLIC_HATS_CONTRACT');
    if (!this.MODULE_FACTORY_ADDRESS)
      missingVars.push('NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS');
    if (!this.ELIGIBILITY_MODULE_IMPLEMENTATION)
      missingVars.push('NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS');

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}\n\nPlease configure these in your .env file.`,
      );
    }
  }

  /**
   * Deploy a new HATS eligibility module for a pod role
   */
  static async deployEligibilityModule(
    config: DeploymentConfig,
    walletClient: any,
    publicClient: any,
  ): Promise<HatsModuleDeployment> {
    try {
      console.log('🚀 Starting HATS module deployment:', config);

      // Validate environment variables first
      this.validateEnvironment();

      // Validate configuration
      this.validateDeploymentConfig(config);

      // Create deployment record in database first
      const deployment = await this.createDeploymentRecord(config);

      try {
        // Deploy the module via factory
        const moduleAddress = await this.deployModuleContract(
          config,
          walletClient,
          publicClient,
        );

        // Update deployment record with contract address
        await this.updateDeploymentRecord(deployment.id, {
          module_address: moduleAddress,
          sync_status: 'pending',
        });

        // Sync criteria to the deployed module
        await this.syncCriteriaToModule(moduleAddress, config, walletClient);

        // Mark as successfully synced
        await this.updateDeploymentRecord(deployment.id, {
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
        });

        console.log('✅ HATS module deployment completed:', moduleAddress);

        return {
          ...deployment,
          module_address: moduleAddress,
          sync_status: 'synced' as const,
          last_synced_at: new Date().toISOString(),
        };
      } catch (deployError) {
        // Update deployment record with error status
        await this.updateDeploymentRecord(deployment.id, {
          sync_status: 'error',
          sync_error:
            deployError instanceof Error
              ? deployError.message
              : 'Deployment failed',
        });
        throw deployError;
      }
    } catch (error) {
      console.error('❌ HATS module deployment failed:', error);
      throw error;
    }
  }

  /**
   * Deploy the actual module contract through the factory
   */
  private static async deployModuleContract(
    config: DeploymentConfig,
    walletClient: any,
    publicClient: any,
  ): Promise<string> {
    if (!walletClient || !publicClient) {
      throw new Error('Wallet client not available');
    }

    // Prepare initialization data
    const abiCoder = new AbiCoder();
    const initData = abiCoder.encode(['address'], [this.HATS_ADDRESS]);

    // Other immutable args (empty for our module)
    const otherImmutableArgs = '0x';

    // Deploy through factory
    const deployTx = await walletClient.writeContract({
      address: this.MODULE_FACTORY_ADDRESS,
      abi: HATS_MODULE_FACTORY_ABI,
      functionName: 'createHatsModule',
      args: [
        this.ELIGIBILITY_MODULE_IMPLEMENTATION,
        BigInt(config.hatId),
        otherImmutableArgs,
        initData,
      ],
    });

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployTx,
    });

    if (receipt.status !== 'success') {
      throw new Error('Module deployment transaction failed');
    }

    // Get the deployed module address from the factory
    const moduleAddress = await publicClient.readContract({
      address: this.MODULE_FACTORY_ADDRESS,
      abi: HATS_MODULE_FACTORY_ABI,
      functionName: 'getHatsModuleAddress',
      args: [
        this.ELIGIBILITY_MODULE_IMPLEMENTATION,
        BigInt(config.hatId),
        otherImmutableArgs,
      ],
    });

    return moduleAddress as string;
  }

  /**
   * Sync eligibility criteria to the deployed module
   */
  static async syncCriteriaToModule(
    moduleAddress: string,
    config: DeploymentConfig,
    walletClient: any,
  ): Promise<void> {
    if (!walletClient) {
      throw new Error('Wallet client not available');
    }

    console.log(
      '🔄 FIXED VERSION: Syncing criteria to module using new implementation:',
      moduleAddress,
    );

    // Prepare all transaction calls using the existing method
    const transactionCalls = this.prepareCriteriaTransactions(
      moduleAddress,
      config,
    );

    if (transactionCalls.length === 0) {
      console.log('⚠️ No valid criteria to sync');
      return;
    }

    console.log('📦 Prepared transaction calls:', {
      moduleAddress,
      callCount: transactionCalls.length,
      calls: transactionCalls.map((call, index) => ({
        callIndex: index,
        functionName: call.functionName,
        contractAddress: call.address,
      })),
    });

    // Execute each transaction call using the wallet client
    for (let i = 0; i < transactionCalls.length; i++) {
      const call = transactionCalls[i];
      try {
        console.log(`📞 Executing call ${i + 1}/${transactionCalls.length}:`, {
          contract: call.address,
          function: call.functionName,
          args: call.args,
        });

        const hash = await walletClient.writeContract(call);
        console.log(`✅ Transaction ${i + 1} submitted:`, hash);

        // Wait for confirmation
        const receipt = await walletClient.waitForTransactionReceipt({ hash });
        console.log(`✅ Transaction ${i + 1} confirmed:`, receipt);
      } catch (error) {
        console.error(`❌ Failed to execute call ${i + 1}:`, error);
        throw new Error(`Failed to sync criterion ${i + 1}: ${error}`);
      }
    }

    console.log(
      '✅ All criteria synced successfully to module:',
      moduleAddress,
    );
  }

  /**
   * Validate Ethereum address format
   */
  private static isValidAddress(address: string): boolean {
    // Check if it's a valid hex string with 0x prefix and exactly 40 characters (20 bytes)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return addressRegex.test(address);
  }

  /**
   * Prepare transaction call for adding a criterion to the module
   */
  static prepareCriterionTransaction(
    moduleAddress: string,
    hatId: string,
    criterion: EligibilityCriteria,
    requireAll: boolean,
  ): any {
    const hatIdBigInt = BigInt(hatId);

    switch (criterion.type) {
      case 'token_balance':
        if (!criterion.contract_address || !criterion.minimum_amount) {
          throw new Error('Token balance criterion missing required fields');
        }

        if (!this.isValidAddress(criterion.contract_address)) {
          throw new Error(
            `Invalid contract address for token balance criterion: ${criterion.contract_address}`,
          );
        }

        return {
          address: moduleAddress as `0x${string}`,
          abi: ELIGIBILITY_MODULE_ABI,
          functionName: 'addTokenBalanceCriterion',
          args: [
            hatIdBigInt,
            criterion.contract_address as `0x${string}`,
            BigInt(criterion.minimum_amount),
            requireAll,
          ],
        };

      case 'nft_ownership':
        if (!criterion.contract_address) {
          throw new Error('NFT ownership criterion missing contract address');
        }

        if (!this.isValidAddress(criterion.contract_address)) {
          throw new Error(
            `Invalid contract address for NFT ownership criterion: ${criterion.contract_address}`,
          );
        }

        const tokenId = criterion.token_id ? BigInt(criterion.token_id) : 0n;
        const isERC1155 = criterion.token_type === 'ERC1155';

        return {
          address: moduleAddress as `0x${string}`,
          abi: ELIGIBILITY_MODULE_ABI,
          functionName: 'addNFTOwnershipCriterion',
          args: [
            hatIdBigInt,
            criterion.contract_address as `0x${string}`,
            tokenId,
            isERC1155,
            requireAll,
          ],
        };

      case 'agreement_signed':
        if (!criterion.agreement_hash) {
          throw new Error('Agreement criterion missing agreement hash');
        }

        const agreementHashBytes32 = ethers.encodeBytes32String(
          criterion.agreement_hash,
        );

        return {
          address: moduleAddress as `0x${string}`,
          abi: ELIGIBILITY_MODULE_ABI,
          functionName: 'addAgreementCriterion',
          args: [hatIdBigInt, agreementHashBytes32, requireAll],
        };

      case 'credential_ownership':
        // For credential ownership, we might be using a HAT ID instead of a contract address
        // HAT IDs are 64 characters (32 bytes) while contract addresses are 40 characters (20 bytes)
        if (!criterion.contract_address) {
          throw new Error(
            'Credential ownership criterion missing contract address or HAT ID',
          );
        }

        // Check if this is a HAT ID (64 chars) or contract address (40 chars)
        const isHatId = criterion.contract_address.length === 66; // 0x + 64 chars
        const isContractAddress = this.isValidAddress(
          criterion.contract_address,
        );

        if (!isHatId && !isContractAddress) {
          throw new Error(
            `Invalid credential identifier: ${criterion.contract_address}. Must be either a HAT ID (64 chars) or contract address (40 chars)`,
          );
        }

        if (isHatId) {
          // For HAT-based credentials, we need to use the HATS contract address
          const credentialTokenId = BigInt(criterion.contract_address);

          return {
            address: moduleAddress as `0x${string}`,
            abi: ELIGIBILITY_MODULE_ABI,
            functionName: 'addNFTOwnershipCriterion',
            args: [
              hatIdBigInt,
              this.HATS_ADDRESS, // Use HATS contract address
              credentialTokenId, // HAT ID as token ID
              false, // HATS are ERC721-like, not ERC1155
              requireAll,
            ],
          };
        } else {
          // For contract-based credentials (NFTs)
          const credentialTokenId = criterion.token_id
            ? BigInt(criterion.token_id)
            : 0n;
          const isCredentialERC1155 = criterion.token_type === 'ERC1155';

          return {
            address: moduleAddress as `0x${string}`,
            abi: ELIGIBILITY_MODULE_ABI,
            functionName: 'addNFTOwnershipCriterion',
            args: [
              hatIdBigInt,
              criterion.contract_address as `0x${string}`,
              credentialTokenId,
              isCredentialERC1155,
              requireAll,
            ],
          };
        }

      case 'time_based':
      case 'staking':
        // These would require additional contract methods
        // TODO: Add 'reputation_score' case when it's added to EligibilityCriteria type
        throw new Error(
          `Criterion type ${criterion.type} not yet implemented in module`,
        );

      default:
        throw new Error(`Unknown criterion type: ${criterion.type}`);
    }
  }

  /**
   * Prepare all criterion transactions for a role
   */
  static prepareCriteriaTransactions(
    moduleAddress: string,
    config: DeploymentConfig,
  ): any[] {
    console.log(
      '🔄 Preparing criteria transactions for module:',
      moduleAddress,
    );

    const transactions: any[] = [];

    for (const criterion of config.criteria) {
      try {
        const transaction = this.prepareCriterionTransaction(
          moduleAddress,
          config.hatId,
          criterion,
          config.requireAllCriteria,
        );
        transactions.push(transaction);
        console.log('✅ Prepared transaction for criterion:', {
          type: criterion.type,
          address: transaction.address,
          functionName: transaction.functionName,
          args: transaction.args.map((arg: any) =>
            typeof arg === 'bigint' ? arg.toString() : arg,
          ),
        });
      } catch (error) {
        console.error(
          '❌ Failed to prepare transaction for criterion:',
          criterion.type,
          error,
        );
        throw new Error(
          `Failed to prepare ${criterion.type} criterion: ${error}`,
        );
      }
    }

    return transactions;
  }

  /**
   * Create deployment record in database
   */
  private static async createDeploymentRecord(
    config: DeploymentConfig,
  ): Promise<HatsModuleDeployment> {
    const abiCoder = new AbiCoder();
    const criteriaHash = keccak256(
      abiCoder.encode(['string'], [JSON.stringify(config.criteria)]),
    );

    const { data, error } = await supabase
      .from('hats_module_deployments')
      .insert({
        pod_id: config.podId,
        token_address: config.hatId,
        module_address: '', // Will be filled after deployment
        implementation_address: this.ELIGIBILITY_MODULE_IMPLEMENTATION,
        criteria_hash: criteriaHash,
        deployment_tx: '',
        deployment_block: 0,
        is_active: true,
        sync_status: 'pending',
        created_by: config.deployer,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create deployment record: ${error.message}`);
    }

    return data as HatsModuleDeployment;
  }

  /**
   * Update deployment record
   */
  private static async updateDeploymentRecord(
    deploymentId: string,
    updates: Partial<HatsModuleDeployment>,
  ): Promise<void> {
    const { error } = await supabase
      .from('hats_module_deployments')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deploymentId);

    if (error) {
      throw new Error(`Failed to update deployment record: ${error.message}`);
    }
  }

  /**
   * Get deployment by pod and hat ID
   */
  static async getDeploymentByHat(
    podId: string,
    hatId: string,
  ): Promise<HatsModuleDeployment | null> {
    const { data, error } = await supabase
      .from('hats_module_deployments')
      .select('*')
      .eq('pod_id', podId)
      .eq('token_address', hatId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      // Handle missing table gracefully
      if (
        error.message.includes('does not exist') ||
        error.message.includes('relation')
      ) {
        console.warn(
          '⚠️ HATS module deployments table does not exist. Please run the database migration.',
        );
        return null;
      }
      throw new Error(`Failed to get deployment: ${error.message}`);
    }

    return data as HatsModuleDeployment;
  }

  /**
   * Get all deployments for a pod
   */
  static async getPodDeployments(
    podId: string,
  ): Promise<HatsModuleDeployment[]> {
    const { data, error } = await supabase
      .from('hats_module_deployments')
      .select('*')
      .eq('pod_id', podId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get pod deployments: ${error.message}`);
    }

    return data as HatsModuleDeployment[];
  }

  /**
   * Check eligibility onchain
   */
  static async checkOnchainEligibility(
    moduleAddress: string,
    hatId: string,
    userAddress: string,
    publicClient: any,
  ): Promise<{ eligible: boolean; standing: boolean }> {
    if (!publicClient) {
      throw new Error('Public client not available');
    }

    const result = await publicClient.readContract({
      address: moduleAddress as `0x${string}`,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'getWearerStatus',
      args: [userAddress as `0x${string}`, BigInt(hatId)],
    });

    return {
      eligible: result[0] as boolean,
      standing: result[1] as boolean,
    };
  }

  /**
   * Sign agreement onchain
   */
  static async signAgreementOnchain(
    moduleAddress: string,
    agreementHash: string,
    walletClient: any,
  ): Promise<string> {
    if (!walletClient) {
      throw new Error('Wallet client not available');
    }

    const agreementHashBytes32 = ethers.encodeBytes32String(agreementHash);

    const txHash = await walletClient.writeContract({
      address: moduleAddress as `0x${string}`,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'signAgreement',
      args: [agreementHashBytes32],
    });

    return txHash;
  }

  /**
   * Validate deployment configuration
   */
  private static validateDeploymentConfig(config: DeploymentConfig): void {
    if (!config.hatId) {
      throw new Error('Hat ID is required');
    }

    if (!config.podId) {
      throw new Error('Pod ID is required');
    }

    if (!config.deployer) {
      throw new Error('Deployer address is required');
    }

    if (!config.criteria || config.criteria.length === 0) {
      throw new Error('At least one eligibility criterion is required');
    }

    // Validate individual criteria
    for (const criterion of config.criteria) {
      this.validateCriterion(criterion);
    }
  }

  /**
   * Validate individual criterion
   */
  private static validateCriterion(criterion: EligibilityCriteria): void {
    if (!criterion.type) {
      throw new Error('Criterion type is required');
    }

    switch (criterion.type) {
      case 'token_balance':
        if (!criterion.contract_address) {
          throw new Error('Token balance criterion requires contract address');
        }
        if (!criterion.minimum_amount) {
          throw new Error('Token balance criterion requires minimum amount');
        }
        break;

      case 'nft_ownership':
        if (!criterion.contract_address) {
          throw new Error('NFT ownership criterion requires contract address');
        }
        break;

      case 'agreement_signed':
        if (!criterion.agreement_hash) {
          throw new Error('Agreement criterion requires agreement hash');
        }
        break;
    }
  }

  /**
   * Record an existing module deployment for database tracking
   * This is used when we already have a deployed module and want to track it
   */
  static async recordDeployment(config: {
    podId: string;
    hatId: string;
    moduleAddress: string;
    moduleType: 'eligibility' | 'toggle';
    deployerAddress: string;
    criteria: any[];
  }): Promise<void> {
    try {
      console.log(
        '📝 Recording module deployment in database:',
        config.moduleAddress,
      );

      const { error } = await supabase.from('hats_module_deployments').upsert(
        {
          pod_id: config.podId,
          token_address: config.hatId,
          module_address: config.moduleAddress,
          module_type: config.moduleType,
          deployer_address: config.deployerAddress,
          criteria: config.criteria,
          sync_status: 'manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'pod_id,token_address,module_type',
        },
      );

      if (error) {
        console.warn(
          '⚠️ Could not record deployment (table may not exist):',
          error.message,
        );
        // Don't throw error - this is optional tracking
        return;
      }

      console.log('✅ Module deployment recorded successfully');
    } catch (error) {
      console.warn('⚠️ Database recording failed (optional):', error);
      // Don't throw error - this shouldn't block the main functionality
    }
  }
}
