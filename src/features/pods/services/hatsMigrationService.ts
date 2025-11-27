import { supabase } from '../../../utils/supabaseClient';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';

// Your existing HATS configuration
export const EXISTING_HATS = {
  HATS_CONTRACT: '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
  EXECUTIVE_POD: '0x0000008800010000000000000000000000000000000000000000000000000000',
  DEV_POD: '0x0000008800020000000000000000000000000000000000000000000000000000',
  // Manager roles (permissions, not pods)
  MARKET_MANAGEMENT: '0x0000008800010000000000000000000000000000000000000000000000000000',
  BOUNTY_MANAGEMENT: '0x0000008800010001000100000000000000000000000000000000000000000000',
  FORUM_MANAGEMENT: '0x0000008800010001000400000000000000000000000000000000000000000000',
  CHAT_MANAGEMENT: '0x0000008800010001000300000000000000000000000000000000000000000000',
  EVENT_MANAGEMENT: '0x0000008800010001000500000000000000000000000000000000000000000000',
};

export interface ExistingPodData {
  id: string;
  name: string;
  description: string;
  hat_id: string;
  parent_hat_id: string | null;
  is_pod: boolean; // true for pods, false for manager roles
  treasury_needed: boolean;
}

// Define your existing pod structure
export const EXISTING_PODS: ExistingPodData[] = [
  {
    id: 'executive-pod',
    name: 'Executive Pod',
    description: 'Main governance and decision-making pod for SpiritDAO',
    hat_id: EXISTING_HATS.EXECUTIVE_POD,
    parent_hat_id: null, // Root pod
    is_pod: true,
    treasury_needed: true
  },
  {
    id: 'dev-pod',
    name: 'Development Pod',
    description: 'Technical development and infrastructure pod',
    hat_id: EXISTING_HATS.DEV_POD,
    parent_hat_id: null, // Root pod (sibling to Executive)
    is_pod: true,
    treasury_needed: true
  }
];

// HATs Protocol ABI (minimal for what we need)
const HATS_ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "hatId", "type": "uint256"}],
    "name": "getHatLevel",
    "outputs": [{"internalType": "uint32", "name": "", "type": "uint32"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "hatId", "type": "uint256"}],
    "name": "isActive",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "hatId", "type": "uint256"}],
    "name": "viewHat",
    "outputs": [
      {"internalType": "string", "name": "details", "type": "string"},
      {"internalType": "uint32", "name": "maxSupply", "type": "uint32"},
      {"internalType": "uint32", "name": "supply", "type": "uint32"},
      {"internalType": "address", "name": "eligibility", "type": "address"},
      {"internalType": "address", "name": "toggle", "type": "address"},
      {"internalType": "string", "name": "imageURI", "type": "string"},
      {"internalType": "uint16", "name": "lastHatId", "type": "uint16"},
      {"internalType": "bool", "name": "mutable", "type": "bool"},
      {"internalType": "bool", "name": "active", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export class HatsMigrationService {
  private static publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  /**
   * Migrate existing HATS to database pods table
   */
  static async migrateExistingHats(creatorAddress: string): Promise<void> {
    try {
      console.log('🔄 Starting HATS migration...');

      // Ensure user session
      const session = await getCurrentSession();
      if (!session?.user?.id) {
        throw new Error('Authentication required for migration');
      }

      // Insert existing pods into database
      for (const podData of EXISTING_PODS) {
        await this.insertPodRecord({
          ...podData,
          created_by_address: creatorAddress,
          status: 'active', // These are already active HATS
        });

        console.log(`✅ Migrated ${podData.name} (HAT: ${podData.hat_id})`);
      }

      console.log('🎉 HATS migration completed!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Find and import orphaned HATs (exist on-chain but not in database)
   */
  static async importOrphanedHats(creatorAddress: string): Promise<void> {
    try {
      console.log('🔍 Scanning for orphaned HATs...');
      
      // TEMPORARY DISABLE: This is causing app-wide rate limiting
      console.log('⚠️ HAT scanning temporarily disabled to prevent rate limiting');
      throw new Error('HAT scanning temporarily disabled to prevent app-wide rate limiting. Please contact support to re-enable with proper RPC limits.');

      // Get all existing pods from database
      const { data: existingPods } = await supabase
        .from('pods')
        .select('management_hat_id, token_address, name');

      console.log('📋 Raw existing pods data:', existingPods);

      const existingHatIds = new Set([
        ...existingPods?.map(p => p.management_hat_id).filter(Boolean) || [],
        ...existingPods?.map(p => p.token_address).filter(Boolean) || []
      ]);

      console.log('📋 Existing HAT IDs in database:', existingHatIds.size);
      console.log('📋 Existing HAT IDs list:', Array.from(existingHatIds));

      // Define HAT ID ranges to scan (based on your HAT tree structure)
      const baseHatId = '0x0000008800000000000000000000000000000000000000000000000000000000';
      const orphanedHats = [];

      // Known HATs to check specifically (the ones we found)
      const knownHatsToCheck = [
        '0x0000008800010000000000000000000000000000000000000000000000000000', // Executive Pod
        '0x0000008800020000000000000000000000000000000000000000000000000000', // Community Pod  
        '0x0000008800000000000000000000000000000000000000000000000000000000', // Top HAT
      ];

      // Check known HATs first
      for (const hatId of knownHatsToCheck) {
        if (existingHatIds.has(hatId)) {
          console.log('⏭️ Known HAT already in database:', hatId);
          continue;
        }

        try {
          const hatData = await this.publicClient.readContract({
            address: EXISTING_HATS.HATS_CONTRACT as `0x${string}`,
            abi: HATS_ABI,
            functionName: 'viewHat',
            args: [BigInt(hatId)]
          });

          if (hatData && hatData[0]) {
            console.log('🔍 Found known orphaned HAT:', hatId, hatData[0]);
            orphanedHats.push({
              hat_id: hatId,
              details: hatData[0],
              maxSupply: hatData[1],
              supply: hatData[2],
              active: hatData[8],
              imageURI: hatData[5]
            });
          }
        } catch (error) {
          console.log('❌ Error checking known HAT:', hatId, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait between requests
      }

      // Then scan for potential child HATs (more limited scan)
      const hatRangesToScan = [
        { start: '0x000000880001000', prefix: 'Executive Pod children', count: 10 },
        { start: '0x000000880002000', prefix: 'Community Pod children', count: 10 },
      ];

      for (const range of hatRangesToScan) {
        console.log(`🔍 Scanning range: ${range.prefix}...`);
        
        for (let i = 1; i <= range.count; i++) { // Limited scan
          const hatId = `${range.start}${i.toString(16).padStart(48, '0')}` as `0x${string}`;
          
          if (existingHatIds.has(hatId)) {
            console.log('⏭️ HAT already in database:', hatId);
            continue;
          }

          try {
            // Check if HAT exists on-chain
            const hatData = await this.publicClient.readContract({
              address: EXISTING_HATS.HATS_CONTRACT as `0x${string}`,
              abi: HATS_ABI,
              functionName: 'viewHat',
              args: [BigInt(hatId)]
            });

            // If HAT exists and has details, it's an orphaned HAT
            if (hatData && hatData[0]) { // details field exists
              console.log('🔍 Found orphaned HAT:', hatId, hatData[0]);
              
              orphanedHats.push({
                hat_id: hatId,
                details: hatData[0],
                maxSupply: hatData[1],
                supply: hatData[2],
                active: hatData[8],
                imageURI: hatData[5]
              });
            }
          } catch (error) {
            // If we get rate limited, wait a bit
            if (error instanceof Error && error.message.includes('429')) {
              console.log('⏳ Rate limited, waiting 2 seconds...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              i--; // Retry this iteration
              continue;
            }
            // HAT doesn't exist or other error, skip silently
            continue;
          }
          
          // Add small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`🎯 Found ${orphanedHats.length} orphaned HATs`);

      // Import each orphaned HAT
      for (const hat of orphanedHats) {
        try {
          await this.insertOrphanedHat(hat, creatorAddress);
          console.log(`✅ Imported orphaned HAT: ${hat.hat_id}`);
        } catch (error) {
          console.error(`❌ Failed to import HAT ${hat.hat_id}:`, error);
        }
      }

      console.log('🎉 Orphaned HAT import completed!');
    } catch (error) {
      console.error('❌ Orphaned HAT scan failed:', error);
      throw error;
    }
  }

  /**
   * Insert orphaned HAT as a pod record
   */
  private static async insertOrphanedHat(hatData: any, creatorAddress: string): Promise<void> {
    // Parse HAT details if it's JSON, otherwise use as name
    let name = 'Orphaned HAT';
    let description = 'Discovered orphaned HAT from blockchain scan';
    
    try {
      const details = JSON.parse(hatData.details);
      name = details.name || details.data?.name || `Orphaned HAT ${hatData.hat_id.slice(-8)}`;
      description = details.description || details.data?.description || description;
    } catch {
      // Details is not JSON, use as name if reasonable length
      if (hatData.details && hatData.details.length < 100) {
        name = hatData.details;
      }
    }

    const podRecord: any = {
      name,
      description,
      management_hat_id: hatData.hat_id,
      membership_hat_id: null,
      parent_pod_id: null, // TODO: Could determine parent from HAT ID structure
      created_by_address: creatorAddress,
      status: hatData.active ? 'active' : 'inactive',
      token_address: hatData.hat_id,
      treasury_address: null,
      treasury_contract_address: null,
      pod_leads: [creatorAddress],
      accountability_signatures: '{}',
      governance_proposal_id: null,
      pod_image_url: hatData.imageURI || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=400&background=ff6b6b&color=fff&bold=true`,
      pod_metadata: JSON.stringify({
        migrated_from_hats: true,
        migration_date: new Date().toISOString(),
        hat_id: hatData.hat_id,
        is_existing_hat: true,
        is_orphaned: true,
        original_details: hatData.details,
        max_supply: hatData.maxSupply,
        current_supply: hatData.supply,
        blockchain_active: hatData.active
      })
    };

    const { error } = await supabase
      .from('pods')
      .insert(podRecord);

    if (error) {
      throw error;
    }
  }

  /**
   * Deactivate a pod (set status to inactive)
   */
  static async deactivatePod(podId: string): Promise<void> {
    try {
      console.log('🔕 Deactivating pod:', podId);

      // First get current metadata
      const { data: currentPod, error: fetchError } = await supabase
        .from('pods')
        .select('pod_metadata')
        .eq('id', podId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Merge deactivation timestamp with existing metadata
      const currentMetadata = currentPod?.pod_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        deactivated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('pods')
        .update({ 
          status: 'inactive',
          pod_metadata: updatedMetadata
        })
        .eq('id', podId);

      if (error) {
        throw error;
      }

      console.log('✅ Pod deactivated successfully');
    } catch (error) {
      console.error('❌ Failed to deactivate pod:', error);
      throw error;
    }
  }

  /**
   * Reactivate a pod (set status back to active)
   */
  static async reactivatePod(podId: string): Promise<void> {
    try {
      console.log('🔄 Reactivating pod:', podId);

      // First get current metadata
      const { data: currentPod, error: fetchError } = await supabase
        .from('pods')
        .select('pod_metadata')
        .eq('id', podId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Merge reactivation timestamp with existing metadata
      const currentMetadata = currentPod?.pod_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        reactivated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('pods')
        .update({ 
          status: 'active',
          pod_metadata: updatedMetadata
        })
        .eq('id', podId);

      if (error) {
        throw error;
      }

      console.log('✅ Pod reactivated successfully');
    } catch (error) {
      console.error('❌ Failed to reactivate pod:', error);
      throw error;
    }
  }

  /**
   * Insert individual pod record
   */
  private static async insertPodRecord(podData: {
    id: string;
    name: string;
    description: string;
    hat_id: string;
    parent_hat_id: string | null;
    created_by_address: string;
    status: string;
  }): Promise<void> {
    // Check if pod already exists
    const { data: existing } = await supabase
      .from('pods')
      .select('id')
      .eq('id', podData.id)
      .single();

    if (existing) {
      console.log(`⚠️ Pod ${podData.name} already exists, skipping...`);
      return;
    }

    // First, let's check what columns actually exist in the pods table
    const { data: tableInfo, error: tableError } = await supabase
      .from('pods')
      .select('*')
      .limit(1);

    console.log('📋 Available pods table columns:', Object.keys(tableInfo?.[0] || {}));

    // Insert new pod record with only the columns that exist
    const podRecord: any = {
      id: podData.id,
      name: podData.name,
      description: podData.description,
      management_hat_id: podData.hat_id,
      membership_hat_id: null, // Will be set when treasury is deployed
      parent_pod_id: podData.parent_hat_id,
      created_by_address: podData.created_by_address,
      status: podData.status,
      token_address: podData.hat_id, // Use hat_id as token_address based on your data structure
      treasury_address: null,
      treasury_contract_address: null,
      pod_leads: [podData.created_by_address], // Add creator as pod lead
      accountability_signatures: '{}',
      governance_proposal_id: null,
      pod_image_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(podData.name)}&size=400&background=bfe7c6&color=000&bold=true`,
      pod_metadata: JSON.stringify({
        migrated_from_hats: true,
        migration_date: new Date().toISOString(),
        hat_id: podData.hat_id,
        is_existing_hat: true,
        pod_type: podData.id === 'executive-pod' ? 'executive' : 'development'
      })
    };

    // Only add created_at if it doesn't exist as a default
    if (tableInfo?.[0] && !tableInfo[0].created_at) {
      podRecord.created_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('pods')
      .insert(podRecord);

    if (error) {
      console.error(`Failed to insert ${podData.name}:`, error);
      throw error;
    }
  }

  /**
   * Deploy treasury contracts for existing pods
   */
  static async deployTreasuriesForExistingPods(): Promise<{ [podId: string]: string }> {
    const treasuryAddresses: { [podId: string]: string } = {};

    console.log('🏦 Starting treasury deployment for existing pods...');

    for (const podData of EXISTING_PODS) {
      if (podData.treasury_needed) {
        console.log(`📝 Ready to deploy treasury for ${podData.name}`);
        console.log(`   - Pod ID: ${podData.id}`);
        console.log(`   - HAT ID: ${podData.hat_id}`);
        console.log(`   - You'll need to call PodCreationManager.activatePod("${podData.id}") to deploy treasury`);
        
        // For now, just log what needs to be done
        // In a real deployment, you'd call your PodCreationManager contract here
        treasuryAddresses[podData.id] = 'PENDING_DEPLOYMENT';
      }
    }

    return treasuryAddresses;
  }

  /**
   * Update pod creation form to use proper HAT IDs
   */
  static getParentHatOptions(): Array<{ id: string; name: string; hat_id: string }> {
    return EXISTING_PODS.map(pod => ({
      id: pod.id,
      name: pod.name,
      hat_id: pod.hat_id
    }));
  }

  /**
   * Validate if a HAT ID corresponds to an actual pod (vs manager role)
   */
  static isPodHat(hatId: string): boolean {
    return EXISTING_PODS.some(pod => pod.hat_id === hatId && pod.is_pod);
  }

  /**
   * Get pod information by HAT ID
   */
  static getPodByHatId(hatId: string): ExistingPodData | undefined {
    return EXISTING_PODS.find(pod => pod.hat_id === hatId);
  }

  /**
   * Check if user has permission to create sub-pods under a parent
   */
  static async canCreateSubPod(userAddress: string, parentHatId: string): Promise<boolean> {
    try {
      // For now, check if user has the parent pod's HAT
      // In production, you'd query the HATS contract
      console.log(`🔍 Checking if ${userAddress} can create sub-pod under ${parentHatId}`);
      
      // TODO: Query HATS contract to check if user wears the parent HAT
      // const hasHat = await this.publicClient.readContract({
      //   address: EXISTING_HATS.HATS_CONTRACT as `0x${string}`,
      //   abi: hatsABI,
      //   functionName: 'balanceOf',
      //   args: [userAddress, parentHatId]
      // });
      
      // For now, return true for testing
      return true;
    } catch (error) {
      console.error('Error checking sub-pod permissions:', error);
      return false;
    }
  }
}

/**
 * Hook for using HATS migration functionality
 */
export function useHatsMigration() {
  const migrateHats = async (userAddress: string) => {
    await HatsMigrationService.migrateExistingHats(userAddress);
  };

  const getParentOptions = () => {
    return HatsMigrationService.getParentHatOptions();
  };

  const deployTreasuries = async () => {
    return await HatsMigrationService.deployTreasuriesForExistingPods();
  };

  return {
    migrateHats,
    getParentOptions,
    deployTreasuries,
    isPodHat: HatsMigrationService.isPodHat,
    getPodByHatId: HatsMigrationService.getPodByHatId,
    canCreateSubPod: HatsMigrationService.canCreateSubPod,
  };
}