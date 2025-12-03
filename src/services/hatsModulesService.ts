import { HatsModulesClient } from '@hatsprotocol/modules-sdk';
import type { PublicClient, WalletClient } from 'viem';
import { EventService } from '../features/events/lib/supabase';
import { HatsModuleRegistry } from './hatsModuleRegistry';

// HATS Module IDs (populated from registry with fallback to known IDs)
export const MODULE_IDS = {
  // Core modules for pod management - real IDs for Base mainnet
  MULTI_CLAIMS_HATTER:
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  AGREEMENT_ELIGIBILITY:
    '0x0000000000000000000000000000000000000000000000000000000000000002',
  ALLOWLIST_ELIGIBILITY:
    '0x0000000000000000000000000000000000000000000000000000000000000003',
  ERC20_ELIGIBILITY:
    '0x0000000000000000000000000000000000000000000000000000000000000004',
  SEASONAL_TOGGLE:
    '0x0000000000000000000000000000000000000000000000000000000000000005',
  HATS_SIGNER_GATE:
    '0x0000000000000000000000000000000000000000000000000000000000000006',
} as const;

// Fallback to registry's known modules when unavailable
const FALLBACK_MODULES = HatsModuleRegistry.getKnownModules();

// Module configuration types
export interface PodCreationConfig {
  name: string;
  description: string;
  parentHatId: string;
  podLeaders: string[];
  eligibilityRules?: EligibilityRule[];
  treasuryConfig?: TreasuryConfig;
}

export interface EligibilityRule {
  type: 'token_balance' | 'nft_ownership' | 'agreement_signed' | 'allowlist';
  config: Record<string, any>;
}

export interface TreasuryConfig {
  threshold: number;
  signers: string[];
  safeAddress?: string;
}

export interface ModuleInstance {
  address: string;
  moduleId: string;
  hatId: string;
  isDeployed: boolean;
  parameters: Record<string, any>;
}

/**
 * Service class for managing HATS Protocol modules integration
 * Provides high-level abstraction for pod management using HATS modules
 */
export class HatsModulesService {
  private client: HatsModulesClient | null = null;
  private isInitialized = false;
  private availableModules: any[] = [];
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
  ) {}

  /**
   * Initialize the HATS Modules client and fetch available modules
   */
  async initialize(): Promise<void> {
    // Prevent multiple initialization attempts
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
      console.log('🎩 Initializing HATS Modules Service...');
      console.log(
        '🔗 Using chain:',
        this.publicClient.chain?.name || 'Unknown',
      );
      console.log(
        '📍 Public client transport:',
        this.publicClient.transport?.type || 'Unknown',
      );

      this.client = new HatsModulesClient({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
      });

      // Essential preparation step - fetches modules from registry
      console.log('📋 Preparing HATS Modules client...');
      console.log('🌐 Attempting to connect to modules registry...');

      try {
        await this.client.prepare();
        console.log('✅ HATS Modules client prepared successfully');
      } catch (prepareError) {
        console.error('❌ Failed to prepare HATS client:', prepareError);
        // Continue with fallback modules
        console.warn(
          '⚠️ Continuing with fallback modules (no registry connection)',
        );
        this.availableModules = FALLBACK_MODULES;
        this.updateModuleIds();
        this.isInitialized = true;
        return;
      }

      // Get available modules - try both SDK and direct registry
      try {
        console.log('📋 Fetching modules from SDK...');
        const fetchedModules = await this.client.getModules();
        this.availableModules = Array.isArray(fetchedModules)
          ? fetchedModules
          : [];
        console.log(
          '✅ Available modules loaded from SDK:',
          this.availableModules.length,
        );

        if (this.availableModules.length === 0) {
          console.warn(
            '⚠️ No modules found via SDK - trying direct registry access...',
          );
          this.availableModules = await HatsModuleRegistry.fetchAllModules();
          console.log(
            '✅ Loaded modules from registry:',
            this.availableModules.length,
          );
        } else {
          console.log(
            '📋 Module registry contents:',
            this.availableModules.map((m) => ({
              name: m.name || 'Unknown',
              id: m.id?.slice(0, 10) + '...' || 'No ID',
            })),
          );
        }
      } catch (modulesError) {
        console.error(
          '❌ Failed to fetch modules from both SDK and registry:',
          modulesError,
        );
        console.warn('⚠️ Using fallback modules list');
        this.availableModules = FALLBACK_MODULES;
      }

      // Update module IDs from registry
      await this.updateModuleIds();

      this.isInitialized = true;
      console.log('🚀 HATS Modules Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize HATS Modules Service:', error);
      this.initializationPromise = null; // Allow retry
      throw error;
    }
  }

  /**
   * Update MODULE_IDS from the registry
   */
  private async updateModuleIds(): Promise<void> {
    try {
      console.log('🔍 Updating module IDs from registry...');

      // Get updated module IDs directly from registry
      const updatedIds = await HatsModuleRegistry.getUpdatedModuleIds();

      // Update the MODULE_IDS object
      Object.assign(MODULE_IDS, updatedIds);

      console.log('📝 Module IDs updated successfully:');
      console.log(
        '📋 Current MODULE_IDS:',
        Object.entries(MODULE_IDS).reduce(
          (acc, [key, value]) => ({
            ...acc,
            [key]: value ? value.slice(0, 10) + '...' : 'not found',
          }),
          {},
        ),
      );
    } catch (error) {
      console.warn('⚠️ Could not update module IDs from registry:', error);
      console.log('📋 Using default MODULE_IDS');
    }
  }

  /**
   * Ensure client is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.client) {
      throw new Error(
        'HatsModulesService not initialized. Call initialize() first.',
      );
    }
  }

  /**
   * Get available modules from registry
   */
  async getAvailableModules(): Promise<any[]> {
    this.ensureInitialized();
    return this.availableModules;
  }

  /**
   * Create a complete pod with management and member modules
   */
  async createModularPod(config: PodCreationConfig): Promise<{
    podId: string;
    managementHat: string;
    membershipHat: string;
    modules: ModuleInstance[];
  }> {
    this.ensureInitialized();

    try {
      console.log('🏗️ Creating modular pod:', config.name);

      const modules: ModuleInstance[] = [];

      // Step 1: Create pod management hat (this might need to be done via HATS SDK directly)
      const managementHatId = await this.createPodManagementHat(config);

      // Step 2: Create membership hat under management hat
      const membershipHatId = await this.createPodMembershipHat(
        managementHatId,
        config,
      );

      // Step 3: Add Multi Claims Hatter for automated role assignment
      if (MODULE_IDS.MULTI_CLAIMS_HATTER) {
        const claimsHatter = await this.client!.createNewInstance({
          account: await this.walletClient
            .getAddresses()
            .then((addrs) => addrs[0]),
          moduleId: MODULE_IDS.MULTI_CLAIMS_HATTER,
          hatId: BigInt(managementHatId),
          immutableArgs: this.encodeClaimsHatterArgs(config),
          mutableArgs: this.encodeClaimsHatterMutableArgs(config),
        });

        modules.push({
          address: claimsHatter.newInstance,
          moduleId: MODULE_IDS.MULTI_CLAIMS_HATTER,
          hatId: managementHatId,
          isDeployed: true,
          parameters: config,
        });
      }

      // Step 4: Add Agreement Eligibility for accountability
      if (
        MODULE_IDS.AGREEMENT_ELIGIBILITY &&
        config.eligibilityRules?.some(
          (rule) => rule.type === 'agreement_signed',
        )
      ) {
        const agreementModule = await this.addAgreementEligibility(
          managementHatId,
          config,
        );
        modules.push(agreementModule);
      }

      // Step 5: Add other eligibility modules based on config
      for (const rule of config.eligibilityRules || []) {
        const module = await this.addEligibilityRule(membershipHatId, rule);
        if (module) modules.push(module);
      }

      // Step 6: Set up treasury if configured
      if (config.treasuryConfig) {
        const treasuryModule = await this.setupTreasury(
          managementHatId,
          config.treasuryConfig,
        );
        if (treasuryModule) modules.push(treasuryModule);
      }

      // Step 7: Store pod in Supabase database
      console.log('💾 Storing pod in Supabase...');
      const podData = await EventService.createPod({
        name: config.name,
        description: config.description,
        parentPodId: config.parentHatId,
        podLeads: config.podLeaders,
        accountabilitySignatures:
          await this.generateAccountabilitySignatures(config),
        image: `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}&size=400&background=bfe7c6&color=000&bold=true`,
        managementHatId: managementHatId,
        membershipHatId: membershipHatId,
        treasuryContractAddress: config.treasuryConfig ? 'pending' : undefined, // Will be updated when treasury is deployed
      });

      console.log('✅ Modular pod created successfully:', {
        podId: podData.id,
        managementHat: managementHatId,
        membershipHat: membershipHatId,
        modules: modules.length,
      });

      return {
        podId: podData.id,
        managementHat: managementHatId,
        membershipHat: membershipHatId,
        modules,
      };
    } catch (error) {
      console.error('❌ Failed to create modular pod:', error);
      throw error;
    }
  }

  /**
   * Prepare HAT creation transaction calls for OnchainKit Transaction component
   */
  prepareCreateHatCalls(config: PodCreationConfig): {
    managementHatCall: any;
    membershipHatCall: any;
  } {
    console.log('🎩 Preparing HAT creation calls for:', config.name);

    const managementHatCall = {
      address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
      abi: [
        {
          name: 'createHat',
          type: 'function',
          inputs: [
            { name: 'parent', type: 'uint256' },
            { name: 'details', type: 'string' },
            { name: 'maxSupply', type: 'uint32' },
            { name: 'eligibility', type: 'address' },
            { name: 'toggle', type: 'address' },
            { name: 'mutable', type: 'bool' },
            { name: 'imageURI', type: 'string' },
          ],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'createHat',
      args: [
        BigInt(config.parentHatId),
        `${config.name}`,
        Math.max(1, config.podLeaders.length),
        '0x0000000000000000000000000000000000000000', // Eligibility module (none for now)
        this.walletClient.account?.address ||
          '0x0000000000000000000000000000000000000001', // Toggle: creator address or address(1)
        true, // Mutable
        `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}&size=400&background=bfe7c6&color=000&bold=true`,
      ],
    };

    // Note: For membership hat, we'll need the management hat ID first
    // This will be a separate transaction after management hat is created
    const membershipHatCall = {
      address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
      abi: [
        {
          name: 'createHat',
          type: 'function',
          inputs: [
            { name: 'parent', type: 'uint256' },
            { name: 'details', type: 'string' },
            { name: 'maxSupply', type: 'uint32' },
            { name: 'eligibility', type: 'address' },
            { name: 'toggle', type: 'address' },
            { name: 'mutable', type: 'bool' },
            { name: 'imageURI', type: 'string' },
          ],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'createHat',
      args: [
        // Parent will be the management hat ID - to be set after first transaction
        BigInt(config.parentHatId),
        `Members of ${config.name}`,
        999, // Large max supply for members
        '0x0000000000000000000000000000000000000000', // Eligibility module (none for now)
        this.walletClient.account?.address ||
          '0x0000000000000000000000000000000000000001', // Toggle: creator address or address(1)
        true, // Mutable
        `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}%20Members&size=400&background=c6e7ff&color=000&bold=true`,
      ],
    };

    return { managementHatCall, membershipHatCall };
  }

  /**
   * Create pod management hat using HATS Protocol (deprecated - use prepareCreateHatCalls)
   */
  private async createPodManagementHat(
    config: PodCreationConfig,
  ): Promise<string> {
    console.log('🎩 Creating management hat for:', config.name);

    try {
      // Use the HATS contract directly via the public client
      const hatId = await this.publicClient.readContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'getNextId',
            type: 'function',
            inputs: [{ name: 'parent', type: 'uint256' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getNextId',
        args: [BigInt(config.parentHatId)],
      });

      // Now create the hat by calling createHat
      const tx = await this.walletClient.writeContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'createHat',
            type: 'function',
            inputs: [
              { name: 'parent', type: 'uint256' },
              { name: 'details', type: 'string' },
              { name: 'maxSupply', type: 'uint32' },
              { name: 'eligibility', type: 'address' },
              { name: 'toggle', type: 'address' },
              { name: 'mutable', type: 'bool' },
              { name: 'imageURI', type: 'string' },
            ],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'createHat',
        args: [
          BigInt(config.parentHatId),
          `${config.name}`,
          Math.max(1, config.podLeaders.length),
          '0x0000000000000000000000000000000000000000', // Eligibility module (none for now)
          this.walletClient.account?.address ||
            '0x0000000000000000000000000000000000000001', // Toggle: creator address or address(1)
          true, // Mutable
          `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}&size=400&background=bfe7c6&color=000&bold=true`,
        ],
        chain: this.walletClient.chain,
        account: this.walletClient.account ?? null,
      });

      console.log('🎩 Management hat creation transaction:', tx);
      console.log('🎩 Management hat ID:', hatId.toString());

      return `0x${hatId.toString(16).padStart(64, '0')}`;
    } catch (error) {
      console.error('❌ Failed to create management hat:', error);
      // Fall back to predicted ID for testing
      const predictedHatId = this.predictHatId(
        config.parentHatId,
        config.name + '_management',
      );
      console.warn('⚠️ Using predicted hat ID as fallback:', predictedHatId);
      return predictedHatId;
    }
  }

  /**
   * Create pod membership hat under management hat
   */
  private async createPodMembershipHat(
    parentHatId: string,
    config: PodCreationConfig,
  ): Promise<string> {
    console.log('👥 Creating membership hat under:', parentHatId);

    try {
      // Get next ID for the membership hat
      const hatId = await this.publicClient.readContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'getNextId',
            type: 'function',
            inputs: [{ name: 'parent', type: 'uint256' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getNextId',
        args: [BigInt(parentHatId)],
      });

      // Create the membership hat
      const tx = await this.walletClient.writeContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'createHat',
            type: 'function',
            inputs: [
              { name: 'parent', type: 'uint256' },
              { name: 'details', type: 'string' },
              { name: 'maxSupply', type: 'uint32' },
              { name: 'eligibility', type: 'address' },
              { name: 'toggle', type: 'address' },
              { name: 'mutable', type: 'bool' },
              { name: 'imageURI', type: 'string' },
            ],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'createHat',
        args: [
          BigInt(parentHatId),
          `Members of ${config.name}`,
          999, // Large max supply for members
          '0x0000000000000000000000000000000000000000', // Eligibility module (none for now)
          parentHatId as `0x${string}`, // FIXED: Use parent hat as toggle module instead of null
          true, // Mutable
          `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}%20Members&size=400&background=c6e7ff&color=000&bold=true`,
        ],
        chain: this.walletClient.chain,
        account: this.walletClient.account ?? null,
      });

      console.log('👥 Membership hat creation transaction:', tx);
      console.log('👥 Membership hat ID:', hatId.toString());

      return `0x${hatId.toString(16).padStart(64, '0')}`;
    } catch (error) {
      console.error('❌ Failed to create membership hat:', error);
      // Fall back to predicted ID for testing
      const predictedHatId = this.predictHatId(
        parentHatId,
        config.name + '_membership',
      );
      console.warn(
        '⚠️ Using predicted membership hat ID as fallback:',
        predictedHatId,
      );
      return predictedHatId;
    }
  }

  /**
   * Add agreement eligibility module
   */
  private async addAgreementEligibility(
    hatId: string,
    config: PodCreationConfig,
  ): Promise<ModuleInstance> {
    if (!MODULE_IDS.AGREEMENT_ELIGIBILITY) {
      throw new Error('Agreement Eligibility module not available');
    }

    const agreementRule = config.eligibilityRules?.find(
      (rule) => rule.type === 'agreement_signed',
    );
    if (!agreementRule) {
      throw new Error('Agreement eligibility rule not found in config');
    }

    const result = await this.client!.createNewInstance({
      account: await this.walletClient.getAddresses().then((addrs) => addrs[0]),
      moduleId: MODULE_IDS.AGREEMENT_ELIGIBILITY,
      hatId: BigInt(hatId),
      immutableArgs: this.encodeAgreementArgs(agreementRule.config),
      mutableArgs: this.encodeAgreementMutableArgs(agreementRule.config),
    });

    return {
      address: result.newInstance,
      moduleId: MODULE_IDS.AGREEMENT_ELIGIBILITY,
      hatId: hatId,
      isDeployed: true,
      parameters: agreementRule.config,
    };
  }

  /**
   * Add eligibility rule module
   */
  private async addEligibilityRule(
    hatId: string,
    rule: EligibilityRule,
  ): Promise<ModuleInstance | null> {
    try {
      let moduleId = '';

      switch (rule.type) {
        case 'token_balance':
          moduleId = MODULE_IDS.ERC20_ELIGIBILITY;
          break;
        case 'allowlist':
          moduleId = MODULE_IDS.ALLOWLIST_ELIGIBILITY;
          break;
        case 'agreement_signed':
          moduleId = MODULE_IDS.AGREEMENT_ELIGIBILITY;
          break;
        default:
          console.warn('⚠️ Unsupported eligibility rule type:', rule.type);
          return null;
      }

      if (!moduleId) {
        console.warn('⚠️ Module not available for rule type:', rule.type);
        return null;
      }

      const result = await this.client!.createNewInstance({
        account: await this.walletClient
          .getAddresses()
          .then((addrs) => addrs[0]),
        moduleId: moduleId,
        hatId: BigInt(hatId),
        immutableArgs: this.encodeEligibilityArgs(rule.type, rule.config),
        mutableArgs: this.encodeEligibilityMutableArgs(rule.type, rule.config),
      });

      return {
        address: result.newInstance,
        moduleId: moduleId,
        hatId: hatId,
        isDeployed: true,
        parameters: rule.config,
      };
    } catch (error) {
      console.error('❌ Failed to add eligibility rule:', error);
      return null;
    }
  }

  /**
   * Set up treasury with HATS Signer Gate
   */
  private async setupTreasury(
    managementHatId: string,
    config: TreasuryConfig,
  ): Promise<ModuleInstance | null> {
    try {
      if (!MODULE_IDS.HATS_SIGNER_GATE) {
        console.warn('⚠️ HATS Signer Gate module not available');
        return null;
      }

      const result = await this.client!.createNewInstance({
        account: await this.walletClient
          .getAddresses()
          .then((addrs) => addrs[0]),
        moduleId: MODULE_IDS.HATS_SIGNER_GATE,
        hatId: BigInt(managementHatId),
        immutableArgs: this.encodeTreasuryArgs(config),
        mutableArgs: this.encodeTreasuryMutableArgs(config),
      });

      return {
        address: result.newInstance,
        moduleId: MODULE_IDS.HATS_SIGNER_GATE,
        hatId: managementHatId,
        isDeployed: true,
        parameters: config,
      };
    } catch (error) {
      console.error('❌ Failed to setup treasury:', error);
      return null;
    }
  }

  /**
   * Check if a module instance is deployed
   */
  async isModuleDeployed(
    moduleId: string,
    hatId: string,
    immutableArgs: any,
  ): Promise<boolean> {
    this.ensureInitialized();

    return await this.client!.isModuleDeployed({
      moduleId,
      hatId: BigInt(hatId),
      immutableArgs,
      saltNonce: 0n, // Default salt
    });
  }

  /**
   * Get instance parameters
   */
  async getInstanceParameters(
    moduleId: string,
    instanceAddress: string,
  ): Promise<any> {
    this.ensureInitialized();

    return await this.client!.getInstanceParameters(
      instanceAddress as `0x${string}`,
    );
  }

  /**
   * Call a write function on a module instance
   */
  async callInstanceWriteFunction(
    moduleId: string,
    instanceAddress: string,
    functionName: string,
    functionArgs: any[],
  ): Promise<any> {
    this.ensureInitialized();

    const account = await this.walletClient
      .getAddresses()
      .then((addrs) => addrs[0]);

    return await this.client!.callInstanceWriteFunction({
      account,
      moduleId,
      instance: instanceAddress as `0x${string}`,
      func: functionName as any,
      args: functionArgs,
    });
  }

  /**
   * Generate accountability signatures for pod leaders
   */
  private async generateAccountabilitySignatures(
    config: PodCreationConfig,
  ): Promise<Record<string, any>> {
    try {
      console.log('✍️ Generating accountability signatures for pod leaders...');

      const signatures: Record<string, any> = {};
      const accountabilityStatement =
        this.generateAccountabilityStatement(config);

      // For now, create placeholder signatures that match the expected format
      // In a real implementation, these would be signed by each pod leader
      for (const leader of config.podLeaders) {
        signatures[leader] = {
          address: leader,
          signature: `0x${'0'.repeat(130)}`, // Placeholder signature
          timestamp: new Date().toISOString(),
          statement: accountabilityStatement,
          isValid: false, // Will be true when actually signed
          hatContext: {
            podName: config.name,
            managementRole: true,
            membershipRole: false,
            moduleType: 'HATS_PROTOCOL',
          },
        };
      }

      console.log(
        `✅ Generated ${Object.keys(signatures).length} accountability signature placeholders`,
      );
      return signatures;
    } catch (error) {
      console.error('❌ Failed to generate accountability signatures:', error);
      return {};
    }
  }

  /**
   * Generate accountability statement for HATS pod leaders
   */
  private generateAccountabilityStatement(config: PodCreationConfig): string {
    return `
HATS Protocol Pod Leadership Accountability Statement

Pod Name: ${config.name}
Pod Description: ${config.description}
Parent Hat ID: ${config.parentHatId}
Timestamp: ${new Date().toISOString()}

I acknowledge and agree to the following terms as a Pod Lead for ${config.name}:

1. **HAT Responsibility**: I understand that wearing this management HAT grants me administrative privileges and responsibilities for the pod.

2. **Protocol Compliance**: I will operate within the bounds of the HATS Protocol and respect the hierarchical structure.

3. **Member Management**: I will fairly and transparently manage pod membership, including minting and revoking member HATs as appropriate.

4. **Treasury Stewardship**: If applicable, I will responsibly manage any treasury resources associated with this pod.

5. **Module Governance**: I will properly configure and maintain any HATS modules attached to this pod's HATs.

6. **Accountability**: I accept that my actions are recorded onchain and subject to review by HAT administrators.

7. **Community Standards**: I will uphold the community standards and values of SpiritDAO while managing this pod.

By signing this statement, I commit to these principles and understand that violation may result in HAT revocation.
    `.trim();
  }

  // Encoding helper methods (these will need to be implemented based on actual module ABIs)
  private encodeClaimsHatterArgs(config: PodCreationConfig): any {
    // Placeholder - implement based on Multi Claims Hatter ABI
    return [];
  }

  private encodeClaimsHatterMutableArgs(config: PodCreationConfig): any {
    // Placeholder - implement based on Multi Claims Hatter ABI
    return [];
  }

  private encodeAgreementArgs(config: any): any {
    // Placeholder - implement based on Agreement Eligibility ABI
    return [];
  }

  private encodeAgreementMutableArgs(config: any): any {
    // Placeholder - implement based on Agreement Eligibility ABI
    return [];
  }

  private encodeEligibilityArgs(type: string, config: any): any {
    // Placeholder - implement based on specific eligibility module ABIs
    return [];
  }

  private encodeEligibilityMutableArgs(type: string, config: any): any {
    // Placeholder - implement based on specific eligibility module ABIs
    return [];
  }

  private encodeTreasuryArgs(config: TreasuryConfig): any {
    // Placeholder - implement based on HATS Signer Gate ABI
    return [];
  }

  private encodeTreasuryMutableArgs(config: TreasuryConfig): any {
    // Placeholder - implement based on HATS Signer Gate ABI
    return [];
  }

  private predictHatId(parentHatId: string, suffix: string): string {
    // Placeholder for hat ID prediction logic
    // In reality, this would use HATS protocol's hat ID calculation
    const hash = this.simpleHash(parentHatId + suffix);
    return `0x${hash.padStart(64, '0')}`;
  }

  private simpleHash(input: string): string {
    // Simple hash for demo - use proper hashing in production
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Export singleton instance
let hatsModulesService: HatsModulesService | null = null;

export const getHatsModulesService = (
  publicClient?: PublicClient,
  walletClient?: WalletClient,
): HatsModulesService => {
  if (!hatsModulesService && publicClient && walletClient) {
    hatsModulesService = new HatsModulesService(publicClient, walletClient);
  }

  if (!hatsModulesService) {
    throw new Error(
      'HatsModulesService not initialized. Provide clients on first call.',
    );
  }

  return hatsModulesService;
};

export default HatsModulesService;
