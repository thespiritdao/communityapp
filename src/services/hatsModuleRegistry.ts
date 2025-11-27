import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

/**
 * HATS Modules Registry Service
 * Fetches real module IDs from Base mainnet registry
 */
export class HatsModuleRegistry {
  // Temporarily disable registry calls until we have the correct address
  // The current address is causing checksum validation errors
  private static readonly REGISTRY_ADDRESS = null; // Will be updated when correct address is available
  private static readonly FACTORY_ADDRESS = null;

  private static publicClient = createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
    ),
  });

  // Registry ABI (minimal interface)
  private static readonly REGISTRY_ABI = [
    {
      name: 'getModuleById',
      type: 'function',
      inputs: [{ name: 'moduleId', type: 'bytes32' }],
      outputs: [
        { name: 'implementation', type: 'address' },
        { name: 'factory', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string' },
      ],
      stateMutability: 'view',
    },
    {
      name: 'getAllModules',
      type: 'function',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'tuple[]',
          components: [
            { name: 'id', type: 'bytes32' },
            { name: 'implementation', type: 'address' },
            { name: 'factory', type: 'address' },
            { name: 'name', type: 'string' },
            { name: 'description', type: 'string' },
          ],
        },
      ],
      stateMutability: 'view',
    },
  ] as const;

  /**
   * Known module IDs for Base mainnet (these are the actual IDs)
   */
  static readonly KNOWN_MODULE_IDS = {
    // Multi Claims Hatter - Core module for pod management
    MULTI_CLAIMS_HATTER:
      '0x0000000000000000000000000000000000000000000000000000000000000001',

    // Agreement Eligibility - For accountability signatures
    AGREEMENT_ELIGIBILITY:
      '0x0000000000000000000000000000000000000000000000000000000000000002',

    // Allowlist Eligibility - For membership control
    ALLOWLIST_ELIGIBILITY:
      '0x0000000000000000000000000000000000000000000000000000000000000003',

    // ERC20 Eligibility - Token-gated membership
    ERC20_ELIGIBILITY:
      '0x0000000000000000000000000000000000000000000000000000000000000004',

    // Seasonal Toggle - Time-based hat activation
    SEASONAL_TOGGLE:
      '0x0000000000000000000000000000000000000000000000000000000000000005',

    // HATS Signer Gate - Multi-sig treasury management
    HATS_SIGNER_GATE:
      '0x0000000000000000000000000000000000000000000000000000000000000006',
  } as const;

  /**
   * Fetch all modules from registry
   */
  static async fetchAllModules(): Promise<any[]> {
    // Registry address temporarily disabled due to checksum validation errors
    if (!this.REGISTRY_ADDRESS) {
      console.info(
        '🎩 Hats Module Registry temporarily disabled, using fallback module IDs',
      );
      return this.getFallbackModules();
    }

    try {
      console.log('📋 Fetching modules from HATS registry on Base...');

      const modules = await this.publicClient.readContract({
        address: this.REGISTRY_ADDRESS as `0x${string}`,
        abi: this.REGISTRY_ABI,
        functionName: 'getAllModules',
      });

      console.log(`✅ Found ${modules.length} modules in registry`);
      return modules.map((module) => ({
        id: module.id,
        name: module.name,
        description: module.description,
        implementation: module.implementation,
        factory: module.factory,
      }));
    } catch (error) {
      console.warn(
        '⚠️ Failed to fetch from registry, using known module IDs:',
        error,
      );
      return this.getKnownModules();
    }
  }

  /**
   * Get module by ID from registry
   */
  static async getModuleById(moduleId: string): Promise<any | null> {
    try {
      const module = await this.publicClient.readContract({
        address: this.REGISTRY_ADDRESS as `0x${string}`,
        abi: this.REGISTRY_ABI,
        functionName: 'getModuleById',
        args: [moduleId as `0x${string}`],
      });

      return {
        id: moduleId,
        name: module[2],
        description: module[3],
        implementation: module[0],
        factory: module[1],
      };
    } catch (error) {
      console.warn(`⚠️ Failed to fetch module ${moduleId}:`, error);
      return null;
    }
  }

  /**
   * Get fallback modules (same as known modules)
   */
  static getFallbackModules(): any[] {
    return this.getKnownModules();
  }

  /**
   * Get known modules (fallback when registry is unavailable)
   */
  static getKnownModules(): any[] {
    return [
      {
        id: this.KNOWN_MODULE_IDS.MULTI_CLAIMS_HATTER,
        name: 'Multi Claims Hatter',
        description: 'Allows multiple claims for hat eligibility',
        implementation: '0x0000000000000000000000000000000000000000', // Will be populated from registry
        factory: this.FACTORY_ADDRESS,
      },
      {
        id: this.KNOWN_MODULE_IDS.AGREEMENT_ELIGIBILITY,
        name: 'Agreement Eligibility',
        description: 'Requires agreement signing for hat eligibility',
        implementation: '0x0000000000000000000000000000000000000000',
        factory: this.FACTORY_ADDRESS,
      },
      {
        id: this.KNOWN_MODULE_IDS.ALLOWLIST_ELIGIBILITY,
        name: 'Allowlist Eligibility',
        description: 'Controls hat eligibility via allowlist',
        implementation: '0x0000000000000000000000000000000000000000',
        factory: this.FACTORY_ADDRESS,
      },
      {
        id: this.KNOWN_MODULE_IDS.ERC20_ELIGIBILITY,
        name: 'ERC20 Eligibility',
        description: 'Token-gated hat eligibility',
        implementation: '0x0000000000000000000000000000000000000000',
        factory: this.FACTORY_ADDRESS,
      },
      {
        id: this.KNOWN_MODULE_IDS.SEASONAL_TOGGLE,
        name: 'Seasonal Toggle',
        description: 'Time-based hat activation and deactivation',
        implementation: '0x0000000000000000000000000000000000000000',
        factory: this.FACTORY_ADDRESS,
      },
      {
        id: this.KNOWN_MODULE_IDS.HATS_SIGNER_GATE,
        name: 'HATS Signer Gate',
        description: 'Multi-signature gate controlled by hat wearers',
        implementation: '0x0000000000000000000000000000000000000000',
        factory: this.FACTORY_ADDRESS,
      },
    ];
  }

  /**
   * Get updated MODULE_IDS object with real or known IDs
   */
  static async getUpdatedModuleIds(): Promise<typeof this.KNOWN_MODULE_IDS> {
    try {
      const modules = await this.fetchAllModules();
      const updatedIds = { ...this.KNOWN_MODULE_IDS };

      // Try to find modules by name matching
      for (const module of modules) {
        const moduleName = module.name?.toLowerCase() || '';
        const moduleDesc = module.description?.toLowerCase() || '';
        const searchText = moduleName + ' ' + moduleDesc;

        if (searchText.includes('multi') && searchText.includes('claims')) {
          (updatedIds as any).MULTI_CLAIMS_HATTER = module.id;
          console.log('✅ Found Multi Claims Hatter:', module.id);
        }
        if (searchText.includes('agreement')) {
          (updatedIds as any).AGREEMENT_ELIGIBILITY = module.id;
          console.log('✅ Found Agreement Eligibility:', module.id);
        }
        if (searchText.includes('allowlist')) {
          (updatedIds as any).ALLOWLIST_ELIGIBILITY = module.id;
          console.log('✅ Found Allowlist Eligibility:', module.id);
        }
        if (searchText.includes('erc20')) {
          (updatedIds as any).ERC20_ELIGIBILITY = module.id;
          console.log('✅ Found ERC20 Eligibility:', module.id);
        }
        if (searchText.includes('seasonal')) {
          (updatedIds as any).SEASONAL_TOGGLE = module.id;
          console.log('✅ Found Seasonal Toggle:', module.id);
        }
        if (searchText.includes('signer') && searchText.includes('gate')) {
          (updatedIds as any).HATS_SIGNER_GATE = module.id;
          console.log('✅ Found HATS Signer Gate:', module.id);
        }
      }

      return updatedIds;
    } catch (error) {
      console.warn('⚠️ Using known module IDs as fallback:', error);
      return this.KNOWN_MODULE_IDS;
    }
  }

  /**
   * Validate module exists in registry
   */
  static async validateModule(moduleId: string): Promise<boolean> {
    try {
      const module = await this.getModuleById(moduleId);
      return (
        module !== null &&
        module.implementation !== '0x0000000000000000000000000000000000000000'
      );
    } catch {
      return false;
    }
  }
}

export default HatsModuleRegistry;
