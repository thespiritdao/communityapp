import type { PublicClient, WalletClient } from 'viem';

/**
 * Service for configuring HAT properties like toggle modules
 */
export class HatConfigurationService {
  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient
  ) {}

  /**
   * Fix Executive Pod Member HAT by connecting it to the toggle module
   */
  async fixExecutivePodMemberToggle(): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
  }> {
    try {
      console.log('🔧 === FIXING EXECUTIVE POD MEMBER HAT CONFIGURATION ===');
      
      const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
      const EXECUTIVE_POD_MEMBER = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;
      const TOGGLE_MODULE = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER_TOGGLE_MODULE as `0x${string}`;
      
      console.log('📋 Configuration:');
      console.log('- Hats Contract:', HATS_CONTRACT);
      console.log('- Executive Pod Member HAT:', EXECUTIVE_POD_MEMBER);
      console.log('- Toggle Module:', TOGGLE_MODULE);

      // Step 1: Verify current HAT state
      console.log('\n🔍 Step 1: Checking current HAT configuration...');
      const currentHatData = await this.publicClient.readContract({
        address: HATS_CONTRACT,
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
              { name: 'active', type: 'bool' }
            ]
          }
        ],
        functionName: 'viewHat',
        args: [BigInt(EXECUTIVE_POD_MEMBER!)]
      });

      console.log('Current HAT state:');
      console.log('- Toggle address:', currentHatData[4]);
      console.log('- Max supply:', currentHatData[1]);
      console.log('- Active:', currentHatData[8]);
      console.log('- Mutable:', currentHatData[7]);

      // Check if toggle is already correctly set
      if (currentHatData[4].toLowerCase() === TOGGLE_MODULE.toLowerCase()) {
        console.log('✅ Toggle module already correctly configured!');
        return {
          success: true,
          error: 'Toggle module already correctly configured'
        };
      }

      // Check if HAT is mutable
      if (!currentHatData[7]) {
        console.log('❌ HAT is not mutable - cannot change toggle module');
        return {
          success: false,
          error: 'HAT is not mutable - cannot change configuration'
        };
      }

      // Step 2: Get user account
      const [account] = await this.walletClient.getAddresses();
      console.log('\n👤 User account:', account);

      // Step 3: Execute changeHatToggle
      console.log('\n🚀 Step 2: Executing changeHatToggle...');
      console.log('- Setting toggle from:', currentHatData[4]);
      console.log('- Setting toggle to:', TOGGLE_MODULE);

      const hash = await this.walletClient.writeContract({
        address: HATS_CONTRACT,
        abi: [
          {
            name: 'changeHatToggle',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_newToggle', type: 'address' }
            ],
            outputs: [{ name: 'success', type: 'bool' }]
          }
        ],
        functionName: 'changeHatToggle',
        args: [BigInt(EXECUTIVE_POD_MEMBER!), TOGGLE_MODULE],
        account,
        chain: this.walletClient.chain
      });

      console.log('✅ changeHatToggle transaction submitted:', hash);
      
      // Wait for transaction confirmation
      console.log('⏳ Waiting for transaction confirmation...');
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        console.log('✅ Transaction confirmed successfully!');
        
        // Verify the change
        console.log('\n🔍 Step 3: Verifying configuration update...');
        const updatedHatData = await this.publicClient.readContract({
          address: HATS_CONTRACT,
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
                { name: 'active', type: 'bool' }
              ]
            }
          ],
          functionName: 'viewHat',
          args: [BigInt(EXECUTIVE_POD_MEMBER!)]
        });

        console.log('Updated HAT state:');
        console.log('- Toggle address:', updatedHatData[4]);
        console.log('- Expected:', TOGGLE_MODULE);
        
        if (updatedHatData[4].toLowerCase() === TOGGLE_MODULE.toLowerCase()) {
          console.log('🎉 SUCCESS! HAT toggle module successfully configured');
          return {
            success: true,
            transactionHash: hash
          };
        } else {
          console.log('❌ Configuration update failed - toggle address mismatch');
          return {
            success: false,
            error: 'Configuration update failed - toggle address not updated'
          };
        }
        
      } else {
        console.log('❌ Transaction failed');
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

    } catch (error) {
      console.error('❌ HAT configuration fix failed:', error);
      
      let errorMessage = 'Failed to configure HAT toggle module';
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
          errorMessage = 'Transaction cancelled by user';
        } else if (error.message.includes('admin')) {
          errorMessage = 'Permission denied: You need admin permissions for this HAT';
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Diagnose HAT admin permissions
   */
  async checkAdminPermissions(hatId: string): Promise<{
    hasPermission: boolean;
    adminHat?: string;
    userHats: string[];
    error?: string;
  }> {
    try {
      const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
      const [userAddress] = await this.walletClient.getAddresses();
      
      console.log('🔍 Checking admin permissions for HAT:', hatId);
      console.log('👤 User address:', userAddress);

      // Get admin HAT - try using getHatLevel approach since getAdmin fails
      let adminHat: string | null = null;
      try {
        // Calculate admin HAT ID from the child HAT ID
        const hatIdBigInt = BigInt(hatId);
        const adminHatId = hatIdBigInt >> BigInt(16); // Remove last level
        adminHat = '0x' + adminHatId.toString(16).padStart(64, '0');
        console.log('📋 Calculated admin HAT:', adminHat);
      } catch (error) {
        console.log('❌ Could not calculate admin HAT:', error.message);
      }

      // Check if user owns the admin HAT
      const userHats = [];
      const hatsToCheck = [
        process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
        adminHat
      ].filter(Boolean);

      for (const hat of hatsToCheck) {
        try {
          const balance = await this.publicClient.readContract({
            address: HATS_CONTRACT,
            abi: [
              {
                name: 'balanceOf',
                type: 'function',
                stateMutability: 'view',
                inputs: [
                  { name: 'wearer', type: 'address' },
                  { name: 'id', type: 'uint256' }
                ],
                outputs: [{ name: '', type: 'uint256' }]
              }
            ],
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(hat!)]
          });

          if (balance > 0n) {
            userHats.push(hat!);
            console.log('✅ User owns HAT:', hat);
          }
        } catch (error) {
          console.log('❌ Failed to check HAT ownership:', hat, error.message);
        }
      }

      const hasPermission = userHats.length > 0;
      console.log('🔐 Admin permission result:', hasPermission);

      return {
        hasPermission,
        adminHat: adminHat || undefined,
        userHats
      };

    } catch (error) {
      console.error('❌ Admin permission check failed:', error);
      return {
        hasPermission: false,
        userHats: [],
        error: error instanceof Error ? error.message : 'Permission check failed'
      };
    }
  }
}

export default HatConfigurationService;