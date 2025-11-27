import type { PublicClient } from 'viem';

/**
 * Diagnostic service for HAT configuration and permissions
 */
export class HatDiagnosticService {
  constructor(private publicClient: PublicClient) {}

  /**
   * Comprehensive diagnostic of HAT toggle permissions
   */
  async diagnoseHatTogglePermissions(params: {
    hatId: string;
    userAddress: string;
    toggleModuleAddress: string;
    hatsContractAddress: string;
  }) {
    console.log('🔬 === HAT TOGGLE PERMISSION DIAGNOSIS ===');
    console.log('📋 Parameters:', params);

    const results = {
      hatExists: false,
      hatDetails: null as any,
      toggleModuleInfo: null as any,
      userHats: [] as string[],
      adminHat: null as string | null,
      canUserToggle: false,
      issues: [] as string[],
    };

    try {
      // 1. Check if HAT exists and get its details
      console.log('\n🔍 Step 1: Checking HAT existence and details...');
      results.hatDetails = await this.getHatDetails(
        params.hatId,
        params.hatsContractAddress,
      );
      results.hatExists = !!results.hatDetails;

      if (results.hatExists) {
        console.log('✅ HAT exists:', results.hatDetails);
      } else {
        console.log('❌ HAT does not exist');
        results.issues.push('HAT does not exist');
        return results;
      }

      // 2. Get toggle module information
      console.log('\n🔍 Step 2: Analyzing toggle module...');
      results.toggleModuleInfo = await this.analyzeToggleModule(
        params.toggleModuleAddress,
        params.hatId,
      );

      // 3. Check user's HATs
      console.log('\n🔍 Step 3: Checking user HAT ownership...');
      results.userHats = await this.getUserHats(
        params.userAddress,
        params.hatsContractAddress,
      );
      console.log('🎩 User HATs:', results.userHats);

      // 4. Determine admin HAT
      console.log('\n🔍 Step 4: Determining admin HAT...');
      results.adminHat = results.hatDetails.admin;
      console.log('👑 Admin HAT:', results.adminHat);

      // 5. Check if user can toggle
      console.log('\n🔍 Step 5: Checking toggle permissions...');
      results.canUserToggle = await this.checkTogglePermissions({
        userAddress: params.userAddress,
        userHats: results.userHats,
        hatId: params.hatId,
        adminHat: results.adminHat,
        toggleModule: params.toggleModuleAddress,
      });

      // 6. Generate recommendations
      console.log('\n🔍 Step 6: Generating recommendations...');
      if (!results.canUserToggle) {
        results.issues = this.generateRecommendations(results);
      }
    } catch (error) {
      console.error('❌ Diagnostic failed:', error);
      results.issues.push(`Diagnostic error: ${error.message}`);
    }

    console.log('\n📊 === DIAGNOSIS COMPLETE ===');
    console.log('🔑 Can user toggle:', results.canUserToggle);
    if (results.issues.length > 0) {
      console.log('⚠️ Issues found:');
      results.issues.forEach((issue, i) =>
        console.log(`   ${i + 1}. ${issue}`),
      );
    }

    return results;
  }

  /**
   * Get HAT details from the Hats contract
   */
  private async getHatDetails(hatId: string, hatsContract: string) {
    try {
      // Read HAT data directly from contract
      const hatData = await this.publicClient.readContract({
        address: hatsContract as `0x${string}`,
        abi: [
          {
            name: 'viewHat',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'id', type: 'uint256' }],
            outputs: [
              { name: 'details', type: 'string' },
              { name: 'maxSupply', type: 'uint32' },
              { name: 'supply', type: 'uint32' },
              { name: 'eligibility', type: 'address' },
              { name: 'toggle', type: 'address' },
              { name: 'imageURI', type: 'string' },
              { name: 'lastHatId', type: 'uint32' },
              { name: 'mutable', type: 'bool' },
              { name: 'active', type: 'bool' },
            ],
          },
        ],
        functionName: 'viewHat',
        args: [BigInt(hatId)],
      });

      // Also get admin HAT
      const adminHat = await this.publicClient.readContract({
        address: hatsContract as `0x${string}`,
        abi: [
          {
            name: 'getAdmin',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'id', type: 'uint256' }],
            outputs: [{ name: 'admin', type: 'uint256' }],
          },
        ],
        functionName: 'getAdmin',
        args: [BigInt(hatId)],
      });

      return {
        details: hatData[0],
        maxSupply: hatData[1],
        supply: hatData[2],
        eligibility: hatData[3],
        toggle: hatData[4],
        imageURI: hatData[5],
        lastHatId: hatData[6],
        mutable: hatData[7],
        active: hatData[8],
        admin: '0x' + adminHat.toString(16).padStart(64, '0'),
      };
    } catch (error) {
      console.error('❌ Failed to get HAT details:', error);
      return null;
    }
  }

  /**
   * Analyze the toggle module configuration
   */
  private async analyzeToggleModule(
    toggleModuleAddress: string,
    hatId: string,
  ) {
    console.log('🔧 Analyzing Hat Controlled Module:', toggleModuleAddress);

    try {
      // Check if contract exists
      const code = await this.publicClient.getCode({
        address: toggleModuleAddress as `0x${string}`,
      });

      if (!code || code === '0x') {
        return {
          exists: false,
          error: 'Toggle module contract not found',
        };
      }

      console.log('✅ Hat Controlled Module contract exists');
      console.log('📏 Contract code size:', code.length, 'bytes');

      const moduleInfo = {
        exists: true,
        address: toggleModuleAddress,
        codeSize: code.length,
        functions: {} as any,
        controllerHat: null as string | null,
      };

      // For Hat Controlled Modules, the key function is usually 'hatControllers'
      // This maps target HAT ID -> controller HAT ID
      try {
        console.log('🔍 Checking hatControllers mapping for HAT:', hatId);

        const controllerResult = await this.publicClient.readContract({
          address: toggleModuleAddress as `0x${string}`,
          abi: [
            {
              name: 'hatControllers',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'hatId', type: 'uint256' }],
              outputs: [{ name: 'controllerHat', type: 'uint256' }],
            },
          ],
          functionName: 'hatControllers',
          args: [BigInt(hatId)],
        });

        const controllerHatId =
          '0x' + controllerResult.toString(16).padStart(64, '0');
        moduleInfo.controllerHat = controllerHatId;
        moduleInfo.functions.hatControllers = controllerHatId;

        console.log('🎯 Controller HAT ID:', controllerHatId);
        console.log(
          '👑 Expected Executive Pod Leader:',
          process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
        );

        // Check if controller HAT matches expected Executive Pod Leader
        if (
          controllerHatId.toLowerCase() ===
          process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER?.toLowerCase()
        ) {
          console.log('✅ Controller HAT matches Executive Pod Leader!');
        } else {
          console.log('❌ Controller HAT mismatch - this might be the issue!');
        }
      } catch (error) {
        console.log('❌ Failed to read hatControllers:', error.message);
        moduleInfo.functions.hatControllers = 'Error: ' + error.message;
      }

      // Also try to check if there's a way to verify eligibility
      try {
        // Some modules have a 'getWearerStatus' function
        const testUserAddress = '0x0000000000000000000000000000000000000000'; // dummy address

        const wearerStatus = await this.publicClient.readContract({
          address: toggleModuleAddress as `0x${string}`,
          abi: [
            {
              name: 'getWearerStatus',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'wearer', type: 'address' },
                { name: 'hatId', type: 'uint256' },
              ],
              outputs: [
                { name: 'eligible', type: 'bool' },
                { name: 'standing', type: 'bool' },
              ],
            },
          ],
          functionName: 'getWearerStatus',
          args: [testUserAddress, BigInt(hatId)],
        });

        moduleInfo.functions.getWearerStatus = 'Available';
        console.log('✅ getWearerStatus function is available');
      } catch (error) {
        console.log('❌ getWearerStatus not available:', error.message);
      }

      return moduleInfo;
    } catch (error) {
      return {
        exists: false,
        error: error.message,
      };
    }
  }

  /**
   * Get all HATs owned by user
   */
  private async getUserHats(
    userAddress: string,
    hatsContract: string,
  ): Promise<string[]> {
    try {
      // This is simplified - in practice you'd need to check specific HAT IDs
      // For now, let's check the main HATs from the environment
      const hatsToCheck = [
        process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
        process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER,
        process.env.NEXT_PUBLIC_COMMUNITY_PODS_PARENT,
      ].filter(Boolean);

      const ownedHats = [];

      for (const hatId of hatsToCheck) {
        try {
          const balance = await this.publicClient.readContract({
            address: hatsContract as `0x${string}`,
            abi: [
              {
                name: 'balanceOf',
                type: 'function',
                stateMutability: 'view',
                inputs: [
                  { name: 'wearer', type: 'address' },
                  { name: 'id', type: 'uint256' },
                ],
                outputs: [{ name: '', type: 'uint256' }],
              },
            ],
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(hatId!)],
          });

          if (balance > 0n) {
            ownedHats.push(hatId!);
            console.log(`✅ User owns HAT: ${hatId}`);
          }
        } catch (error) {
          console.log(`❌ Failed to check HAT ${hatId}:`, error.message);
        }
      }

      return ownedHats;
    } catch (error) {
      console.error('❌ Failed to get user HATs:', error);
      return [];
    }
  }

  /**
   * Check if user has toggle permissions
   */
  private async checkTogglePermissions(params: {
    userAddress: string;
    userHats: string[];
    hatId: string;
    adminHat: string | null;
    toggleModule: string;
  }): Promise<boolean> {
    console.log('🔍 Checking toggle permissions...');
    console.log('👤 User address:', params.userAddress);
    console.log('🎩 User HATs:', params.userHats);
    console.log('👑 Required admin HAT:', params.adminHat);

    // For Hat Controlled Module, the key check is:
    // Does the user own the CONTROLLER HAT that's configured in the toggle module?

    try {
      // Get the controller HAT from the toggle module
      const controllerHat = await this.publicClient.readContract({
        address: params.toggleModule as `0x${string}`,
        abi: [
          {
            name: 'hatControllers',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'hatId', type: 'uint256' }],
            outputs: [{ name: 'controllerHat', type: 'uint256' }],
          },
        ],
        functionName: 'hatControllers',
        args: [BigInt(params.hatId)],
      });

      const controllerHatId =
        '0x' + controllerHat.toString(16).padStart(64, '0');
      console.log('🎯 Toggle module requires controller HAT:', controllerHatId);

      // Check if user owns the controller HAT
      const ownsControllerHat = params.userHats.some(
        (hat) => hat.toLowerCase() === controllerHatId.toLowerCase(),
      );

      if (ownsControllerHat) {
        console.log('✅ User owns the required controller HAT!');
        return true;
      } else {
        console.log('❌ User does NOT own the required controller HAT');
        console.log('💡 You need to mint/own HAT:', controllerHatId);
        return false;
      }
    } catch (error) {
      console.log(
        '❌ Failed to read controller HAT from toggle module:',
        error.message,
      );

      // Fall back to admin HAT check
      if (params.adminHat && params.userHats.includes(params.adminHat)) {
        console.log('✅ Fallback: User owns admin HAT:', params.adminHat);
        return true;
      }

      console.log('❌ No valid permissions found');
      return false;
    }
  }

  /**
   * Generate recommendations for fixing toggle issues
   */
  private generateRecommendations(results: any): string[] {
    const issues = [];

    if (!results.hatExists) {
      issues.push('Target HAT does not exist - verify HAT ID is correct');
    }

    if (results.adminHat && !results.userHats.includes(results.adminHat)) {
      issues.push(
        `You need to own the admin HAT (${results.adminHat}) to toggle this HAT`,
      );
    }

    if (results.toggleModuleInfo && !results.toggleModuleInfo.exists) {
      issues.push(
        'Toggle module contract does not exist - verify toggle module address',
      );
    }

    if (results.userHats.length === 0) {
      issues.push(
        'User does not own any HATs - mint the required admin HAT first',
      );
    }

    return issues;
  }
}

export default HatDiagnosticService;
