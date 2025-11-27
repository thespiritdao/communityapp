import { HatsModulesClient } from '@hatsprotocol/modules-sdk';
import type { PublicClient, WalletClient } from 'viem';

/**
 * Service for interacting with Hats toggle modules using the official Modules SDK
 * This handles toggle modules created via the Hats GUI
 */
export class HatsToggleModuleService {
  private modulesClient: HatsModulesClient | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  /**
   * Initialize the Hats Modules client
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
      console.log('🏭 Initializing Hats Toggle Module SDK...');

      this.modulesClient = new HatsModulesClient({
        publicClient: this.publicClient,
        walletClient: this.walletClient,
      });

      console.log('📡 Preparing modules client (fetching registry)...');
      await this.modulesClient.prepare();

      this.isInitialized = true;
      console.log('✅ Hats Toggle Module SDK initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Hats Toggle Module SDK:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.modulesClient) {
      throw new Error('Hats Toggle Module service not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if a module is deployed at the given address
   */
  async isModuleDeployed(moduleAddress: string): Promise<boolean> {
    try {
      const code = await this.publicClient.getCode({
        address: moduleAddress as `0x${string}`
      });
      
      return code !== undefined && code !== '0x';
    } catch (error) {
      console.error('❌ Failed to check if module is deployed:', error);
      return false;
    }
  }

  /**
   * Get all available modules from the registry
   */
  async getAvailableModules(): Promise<any[]> {
    this.ensureInitialized();
    
    try {
      console.log('🔍 Fetching modules from registry...');
      const modules = await this.modulesClient!.getModules();
      console.log('📦 Raw modules data type:', typeof modules);
      console.log('📦 Raw modules data:', modules);
      
      // Handle both object and array formats
      let moduleArray: any[] = [];
      
      if (Array.isArray(modules)) {
        console.log('✅ Modules returned as array');
        moduleArray = modules;
      } else if (modules && typeof modules === 'object') {
        console.log('🔄 Modules returned as object, converting to array...');
        // Convert object to array of values
        moduleArray = Object.values(modules);
        console.log('✅ Converted object to array:', moduleArray.length, 'modules');
      } else {
        console.warn('⚠️  Unexpected modules format:', typeof modules, modules);
        return [];
      }
      
      console.log('📋 Final modules count:', moduleArray.length);
      return moduleArray;
      
    } catch (error) {
      console.error('❌ Failed to get available modules:', error);
      console.log('🔍 Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return [];
    }
  }

  /**
   * Find module by instance address (reverse lookup)
   */
  async findModuleByAddress(instanceAddress: string): Promise<any | null> {
    try {
      console.log('🔍 Searching for module with instance address:', instanceAddress);
      const modules = await this.getAvailableModules();
      
      console.log('📋 Total modules in registry:', modules.length);
      
      // Log all available modules for debugging
      console.log('📋 All available modules:');
      modules.forEach((module, index) => {
        console.log(`📦 Module ${index}:`, {
          id: module.id,
          name: module.name,
          implementationAddress: module.implementationAddress,
          description: module.description || 'No description',
          category: module.category || 'Unknown',
          tags: module.tags || []
        });
      });
      
      // Enhanced module matching logic
      console.log('🔍 Looking for toggle modules...');
      
      // Priority 1: Look for modules that match our instance address
      for (const module of modules) {
        try {
          if (module.implementationAddress && 
              module.implementationAddress.toLowerCase() === instanceAddress.toLowerCase()) {
            console.log('🎯 Found exact implementation match:', {
              id: module.id,
              name: module.name,
              implementationAddress: module.implementationAddress,
              description: module.description
            });
            return module;
          }
        } catch (moduleError) {
          console.error('⚠️  Error processing module for exact match:', moduleError);
        }
      }
      
      // Priority 2: Look for toggle-specific modules (exclude eligibility-only modules)
      const toggleKeywords = ['toggle', 'hat-controlled', 'season-toggle', 'simple-toggle'];
      const eligibilityExclusions = ['eligibility', 'agreement'];
      
      for (const module of modules) {
        try {
          const searchText = (
            (module.name || '') + ' ' + 
            (module.description || '') + ' ' + 
            (module.id || '')
          ).toLowerCase();
          
          // Must have toggle keywords AND NOT have eligibility exclusions
          const hasToggleKeyword = toggleKeywords.some(keyword => 
            searchText.includes(keyword)
          );
          const hasEligibilityKeyword = eligibilityExclusions.some(keyword =>
            searchText.includes(keyword)
          );
          
          if (hasToggleKeyword && !hasEligibilityKeyword) {
            console.log('🎯 Found keyword-matched toggle module:', {
              id: module.id,
              name: module.name,
              implementationAddress: module.implementationAddress,
              description: module.description,
              matchedKeywords: toggleKeywords.filter(k => searchText.includes(k))
            });
            return module;
          }
        } catch (moduleError) {
          console.error('⚠️  Error processing module for keyword match:', moduleError);
        }
      }
      
      // Priority 3: Try each module to see which one works
      console.log('🔄 No clear toggle module found, will try multiple modules...');
      if (modules.length > 0) {
        console.log('⚠️  Will attempt function calls on available modules to find working one');
        return null; // Return null to trigger multi-module attempt
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to find module by address:', error);
      return null;
    }
  }

  /**
   * Get module instance parameters (configuration)
   */
  async getInstanceParameters(moduleId: string, instanceAddress: string) {
    this.ensureInitialized();
    
    try {
      console.log('🔍 Getting instance parameters:', {
        moduleId,
        instanceAddress
      });

      const parameters = await this.modulesClient!.getInstanceParameters({
        moduleId,
        instance: instanceAddress as `0x${string}`
      });

      console.log('📋 Module parameters:', parameters);
      console.log('🔍 Parameter types:', typeof parameters, Array.isArray(parameters));
      
      if (parameters && typeof parameters === 'object') {
        Object.entries(parameters).forEach(([key, value]) => {
          console.log(`🔑 ${key}:`, value, typeof value);
        });
      }
      
      return parameters;

    } catch (error) {
      console.error('❌ Failed to get instance parameters:', error);
      console.log('🔍 This might be normal if the module doesn\'t have configurable parameters');
      throw error;
    }
  }

  /**
   * Call a write function on a module instance using the SDK
   */
  async callModuleFunction({
    moduleId,
    instanceAddress,
    functionName,
    args = []
  }: {
    moduleId: string;
    instanceAddress: string;
    functionName: string;
    args?: any[];
  }): Promise<{ status: string; transactionHash?: string }> {
    this.ensureInitialized();
    
    if (!this.walletClient) {
      throw new Error('Wallet client required for module function calls');
    }

    try {
      console.log('📝 Calling module function via SDK:', {
        moduleId,
        instanceAddress,
        functionName,
        args: args.map((arg, i) => `${i}: ${arg}`)
      });

      const account = await this.walletClient.getAddresses().then(addrs => addrs[0]);
      console.log('👤 Using account:', account);

      console.log('🚀 Making SDK call...');
      const result = await this.modulesClient!.callInstanceWriteFunction({
        account,
        moduleId,
        instance: instanceAddress as `0x${string}`,
        func: functionName,
        args
      });

      console.log('📊 Raw SDK result:', result);
      console.log('✅ Module function call completed');

      return {
        status: result.status || 'unknown',
        transactionHash: result.transactionHash
      };

    } catch (error) {
      console.error('❌ Module function call failed:', error);
      console.log('🔍 Error type:', typeof error);
      console.log('🔍 Error constructor:', error.constructor.name);
      if (error instanceof Error) {
        console.log('🔍 Error message:', error.message);
        console.log('🔍 Error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Attempt to toggle a HAT using the proper Hats Modules SDK approach
   */
  async toggleHatViaModulesSDK({
    instanceAddress,
    hatId,
    newStatus,
    userAddress
  }: {
    instanceAddress: string;
    hatId: string;
    newStatus: boolean;
    userAddress: string;
  }): Promise<{ status: string; transactionHash?: string; moduleId?: string }> {
    console.log('🎛️ Attempting HAT toggle via Hats Modules SDK:', {
      instanceAddress,
      hatId,
      newStatus,
      userAddress
    });

    try {
      // First, try to identify what module this is
      console.log('🔍 Step 1: Identifying module type for instance:', instanceAddress);
      const moduleInfo = await this.findModuleByAddress(instanceAddress);
      const moduleId = moduleInfo?.id;
      
      console.log('📋 Module identification result:', {
        moduleInfo,
        moduleId,
        moduleName: moduleInfo?.name || 'Unknown'
      });

      if (!moduleId) {
        console.warn('⚠️ Could not identify specific module ID from registry');
        console.log('🔄 Will try multiple modules from registry...');
        
        const allModules = await this.getAvailableModules();
        if (allModules.length === 0) {
          console.error('❌ No modules found in registry!');
          throw new Error('No modules available in registry');
        }
        
        // Try multiple modules in order of likelihood
        const moduleAttempts = [];
        
        // Add toggle-related modules first
        const toggleKeywords = ['toggle', 'eligibility', 'control', 'hat-controlled', 'agreement'];
        for (const module of allModules) {
          const searchText = (
            (module.name || '') + ' ' + 
            (module.description || '') + ' ' + 
            (module.id || '')
          ).toLowerCase();
          
          const hasToggleKeyword = toggleKeywords.some(keyword => 
            searchText.includes(keyword)
          );
          
          if (hasToggleKeyword) {
            moduleAttempts.push(module);
          }
        }
        
        // Add remaining modules
        for (const module of allModules) {
          if (!moduleAttempts.find(m => m.id === module.id)) {
            moduleAttempts.push(module);
          }
        }
        
        // Try each module
        for (const module of moduleAttempts) {
          try {
            console.log(`🔄 Attempting with module: ${module.id} (${module.name})`);
            const result = await this.attemptModuleFunctionCall(module.id, instanceAddress, hatId, newStatus, userAddress);
            if (result.success) {
              console.log(`✅ Success with module: ${module.id}`);
              return {
                status: 'success',
                transactionHash: result.transactionHash,
                moduleId: module.id
              };
            }
          } catch (moduleError) {
            console.log(`❌ Module ${module.id} failed:`, moduleError.message);
            continue;
          }
        }
        
        throw new Error('All available modules failed');
      }

      console.log('🔍 Using module ID:', moduleId);

      // Step 2: Try to get instance parameters to understand the module
      console.log('🔍 Step 2: Getting instance parameters...');
      try {
        const parameters = await this.getInstanceParameters(moduleId, instanceAddress);
        console.log('📋 Instance parameters:', parameters);
      } catch (paramError) {
        console.log('⚠️  Could not get instance parameters:', paramError.message);
      }
      
      // Step 3: Try common toggle function names with the SDK
      console.log('🔍 Step 3: Attempting function calls...');
      const toggleFunctions = [
        // Hat Controlled Module functions (most common)
        { name: 'checkToggle', args: [userAddress, hatId] },
        { name: 'getWearerStatus', args: [userAddress, hatId] },
        // Direct toggle functions
        { name: 'toggle', args: [hatId, newStatus] },
        { name: 'setHatStatus', args: [hatId, newStatus] },
        { name: 'changeHatStatus', args: [hatId, newStatus] },
        { name: 'toggleHat', args: [hatId, newStatus] }
      ];

      for (const func of toggleFunctions) {
        try {
          console.log(`🔄 Trying SDK function: ${func.name} with args:`, func.args);
          
          const result = await this.callModuleFunction({
            moduleId,
            instanceAddress,
            functionName: func.name,
            args: func.args
          });

          console.log(`📋 ${func.name} result:`, result);

          if (result.status === 'success') {
            console.log(`✅ Toggle successful via SDK function: ${func.name}`);
            return {
              ...result,
              moduleId
            };
          } else {
            console.log(`❌ ${func.name} reverted via SDK:`, result);
          }

        } catch (error) {
          console.log(`❌ SDK function ${func.name} failed:`, error.message);
          console.log('📊 Full error details:', error);
        }
      }

      console.error('❌ All SDK function attempts completed without success');
      console.log('💡 This suggests either:');
      console.log('   1. The module ID is incorrect');
      console.log('   2. The module doesn\'t have the expected functions');
      console.log('   3. The module requires different parameters');
      console.log('   4. There\'s a permission issue');
      console.log('🔍 Used module ID:', moduleId);
      console.log('🔍 Instance address:', instanceAddress);
      
      console.error('❌ All SDK function attempts completed without success');
      console.log('💡 This suggests either:');
      console.log('   1. The module ID is incorrect');
      console.log('   2. The module doesn\'t have the expected functions');
      console.log('   3. The module requires different parameters');
      console.log('   4. There\'s a permission issue');
      console.log('🔍 Used module ID:', moduleId);
      console.log('🔍 Instance address:', instanceAddress);
      
      throw new Error(`All SDK toggle function attempts failed for module: ${moduleId}`);

    } catch (error) {
      console.error('❌ HAT toggle via Modules SDK failed:', error);
      throw error;
    }
  }

  /**
   * Attempt to call toggle functions on a specific module
   */
  private async attemptModuleFunctionCall(
    moduleId: string,
    instanceAddress: string,
    hatId: string,
    newStatus: boolean,
    userAddress: string
  ): Promise<{ success: boolean; transactionHash?: string }> {
    const toggleFunctions = [
      // Hat Controlled Module functions (most common)
      { name: 'checkToggle', args: [userAddress, hatId] },
      { name: 'getWearerStatus', args: [userAddress, hatId] },
      // Direct toggle functions
      { name: 'toggle', args: [hatId, newStatus] },
      { name: 'setHatStatus', args: [hatId, newStatus] },
      { name: 'changeHatStatus', args: [hatId, newStatus] },
      { name: 'toggleHat', args: [hatId, newStatus] }
    ];

    for (const func of toggleFunctions) {
      try {
        console.log(`  🔄 Trying function: ${func.name}`);
        
        const result = await this.callModuleFunction({
          moduleId,
          instanceAddress,
          functionName: func.name,
          args: func.args
        });

        if (result.status === 'success') {
          console.log(`  ✅ Success with function: ${func.name}`);
          return {
            success: true,
            transactionHash: result.transactionHash
          };
        }
      } catch (error) {
        console.log(`  ❌ Function ${func.name} failed:`, error.message);
        // Don't throw - try next function
      }
    }

    return { success: false };
  }

  /**
   * Try all available modules when no specific module is identified
   */
  private async tryAllAvailableModules(
    instanceAddress: string,
    hatId: string,
    newStatus: boolean,
    userAddress: string
  ): Promise<{ status: string; transactionHash?: string; moduleId?: string }> {
    console.log('🔄 Attempting all available modules systematically...');
    
    const allModules = await this.getAvailableModules();
    if (allModules.length === 0) {
      throw new Error('No modules available in registry');
    }
    
    console.log(`📦 Testing ${allModules.length} modules from registry...`);
    
    for (const module of allModules) {
      try {
        console.log(`🔬 Module ${allModules.indexOf(module) + 1}/${allModules.length}: ${module.id}`);
        console.log(`    Name: ${module.name || 'Unknown'}`);
        console.log(`    Implementation: ${module.implementationAddress || 'Unknown'}`);
        
        const result = await this.attemptModuleFunctionCall(module.id, instanceAddress, hatId, newStatus, userAddress);
        
        if (result.success) {
          console.log(`✨ SUCCESS! Found working module: ${module.id}`);
          return {
            status: 'success',
            transactionHash: result.transactionHash,
            moduleId: module.id
          };
        }
        
      } catch (moduleError) {
        if (moduleError.message.includes('User rejected') || moduleError.message.includes('cancelled')) {
          console.log('🛑 User cancelled transaction');
          throw moduleError;
        }
        console.log(`❌ Module ${module.id} failed completely:`, moduleError.message);
      }
    }
    
    console.error(`❌ All ${allModules.length} modules failed`);
    throw new Error(`No working modules found among ${allModules.length} available modules`);
  }

  /**
   * Simplified toggle method that tries all modules systematically
   */
  async toggleHatViaAllModules(
    instanceAddress: string,
    hatId: string,
    newStatus: boolean,
    userAddress: string
  ): Promise<{ status: string; transactionHash?: string; moduleId?: string }> {
    console.log('🚀 Using systematic all-modules approach for HAT toggle...');
    return await this.tryAllAvailableModules(instanceAddress, hatId, newStatus, userAddress);
  }
}

export default HatsToggleModuleService;