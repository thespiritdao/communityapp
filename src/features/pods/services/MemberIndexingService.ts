import { supabase } from '../../../utils/supabaseClient';
import { createPublicClient, http, getContract } from 'viem';
import { base } from 'viem/chains';
import { globalRpcQueue } from '@/lib/rpc/RpcQueue';
import { HatsCoreService } from '../../../services/hatsCoreService';

/**
 * Member Indexing Service - Populates pod_members table
 * 
 * This service scans HAT contracts to discover pod members and maintains
 * an authoritative cache in the pod_members table, eliminating the need
 * for runtime blockchain queries.
 */

interface MembershipRecord {
  pod_id: string;
  wallet: string;
  hat_id: string;
  membership_type: 'leader' | 'member' | 'admin';
  is_active: boolean;
}

interface IndexingStats {
  pods_processed: number;
  members_added: number;
  members_removed: number;
  members_updated: number;
  errors: string[];
}

export class MemberIndexingService {
  private static publicClient = createPublicClient({
    chain: base,
    transport: http()
  });
  
  private static hatsService = new HatsCoreService(this.publicClient);

  /**
   * Index all pod memberships
   * Called by cron job or manual trigger
   */
  static async indexAllPodMemberships(): Promise<IndexingStats> {
    const stats: IndexingStats = {
      pods_processed: 0,
      members_added: 0,
      members_removed: 0,
      members_updated: 0,
      errors: []
    };

    try {
      // Get all active pods that need indexing
      const pods = await this.getPodsForIndexing();
      console.log(`🔍 Starting indexing for ${pods.length} pods`);

      for (const pod of pods) {
        try {
          await this.indexPodMembership(pod, stats);
          stats.pods_processed++;
        } catch (error) {
          const errorMsg = `Failed to index pod ${pod.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(errorMsg);
          stats.errors.push(errorMsg);
        }
      }

      console.log('✅ Indexing completed:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Indexing failed:', error);
      stats.errors.push(`Global indexing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return stats;
    }
  }

  /**
   * Index membership for a specific pod
   */
  static async indexPodMembership(
    pod: { id: string; management_hat_id?: string; membership_hat_id?: string },
    stats: IndexingStats
  ): Promise<void> {
    console.log(`🔍 Indexing pod ${pod.id}`);

    const currentMembers = new Set<string>();

    // Index management HAT holders (leaders)
    if (pod.management_hat_id) {
      try {
        const leaders = await this.getHatHolders(pod.management_hat_id);
        for (const leader of leaders) {
          await this.upsertMember({
            pod_id: pod.id,
            wallet: leader.toLowerCase(),
            hat_id: pod.management_hat_id,
            membership_type: 'leader',
            is_active: true
          });
          currentMembers.add(leader.toLowerCase());
          stats.members_added++;
        }
        console.log(`  📋 Found ${leaders.length} leaders for management HAT ${pod.management_hat_id}`);
      } catch (error) {
        console.error(`  ⚠️ Failed to index management HAT ${pod.management_hat_id}:`, error);
      }
    }

    // Index membership HAT holders (members)
    if (pod.membership_hat_id) {
      try {
        const members = await this.getHatHolders(pod.membership_hat_id);
        for (const member of members) {
          // Only add as member if not already a leader
          if (!currentMembers.has(member.toLowerCase())) {
            await this.upsertMember({
              pod_id: pod.id,
              wallet: member.toLowerCase(),
              hat_id: pod.membership_hat_id,
              membership_type: 'member',
              is_active: true
            });
            currentMembers.add(member.toLowerCase());
            stats.members_added++;
          }
        }
        console.log(`  👥 Found ${members.length} members for membership HAT ${pod.membership_hat_id}`);
      } catch (error) {
        console.error(`  ⚠️ Failed to index membership HAT ${pod.membership_hat_id}:`, error);
      }
    }

    // Mark members who no longer hold HATs as inactive
    await this.deactivateStaleMembers(pod.id, Array.from(currentMembers), stats);
  }

  /**
   * Get HAT holders from blockchain using HATS Core SDK
   * Uses RPC queue to manage rate limiting and retries
   */
  private static async getHatHolders(hatId: string): Promise<string[]> {
    console.log(`🎩 Querying HAT holders for ${hatId}`);
    
    try {
      // Queue the blockchain query with low priority (background indexing)
      return await globalRpcQueue.enqueueLowPriority(async () => {
        // Initialize HATS service if not already done
        await this.hatsService.initialize();
        
        // Get all wearers of this HAT using the HATS Core SDK
        const wearers = await this.hatsService.getHatWearers(hatId);
        
        console.log(`  📊 Found ${wearers.length} wearers for HAT ${hatId}`);
        
        // Extract addresses from wearer objects and filter out null/undefined
        const addresses = wearers
          .map(wearer => wearer.id || wearer.address)
          .filter(address => address && address !== '0x0000000000000000000000000000000000000000')
          .map(address => address.toLowerCase());
          
        return addresses;
      });
    } catch (error) {
      console.error(`Failed to get HAT holders for ${hatId}:`, error);
      
      // If HATS SDK fails, fallback to direct contract call
      try {
        console.log(`  🔄 Falling back to direct contract query for HAT ${hatId}`);
        return await this.getHatHoldersDirect(hatId);
      } catch (fallbackError) {
        console.error(`Direct contract query also failed for HAT ${hatId}:`, fallbackError);
        throw new Error(`HAT query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
  
  /**
   * Fallback method: Query HAT holders directly from contract
   */
  private static async getHatHoldersDirect(hatId: string): Promise<string[]> {
    const HATS_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
    
    if (!HATS_CONTRACT_ADDRESS) {
      throw new Error('HATS_CONTRACT_ADDRESS not configured');
    }
    
    // Minimal HATS ABI for getting wearers
    const HATS_ABI = [
      {
        name: 'balanceOf',
        type: 'function',
        inputs: [
          { name: 'account', type: 'address' },
          { name: 'hatId', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view'
      },
      {
        name: 'isWearerOfHat',
        type: 'function',
        inputs: [
          { name: 'user', type: 'address' },
          { name: 'hatId', type: 'uint256' }
        ],
        outputs: [{ name: 'isWearer', type: 'bool' }],
        stateMutability: 'view'
      }
    ] as const;
    
    return await globalRpcQueue.enqueueLowPriority(async () => {
      const hatContract = getContract({
        address: HATS_CONTRACT_ADDRESS,
        abi: HATS_ABI,
        publicClient: this.publicClient
      });
      
      // Since we can't enumerate all holders directly, we'll need to check
      // against known addresses from our pod_members table
      console.log(`  ⚠️ Direct contract query limited - checking known addresses for HAT ${hatId}`);
      
      // Get existing member addresses from database to check
      const { data: existingMembers } = await supabase
        .from('pod_members')
        .select('wallet')
        .eq('hat_id', hatId);
        
      const knownAddresses = existingMembers?.map(m => m.wallet) || [];
      const currentHolders: string[] = [];
      
      // Check each known address to see if they still hold the HAT
      for (const address of knownAddresses) {
        try {
          const isHolder = await hatContract.read.isWearerOfHat([
            address as `0x${string}`,
            BigInt(hatId)
          ]);
          
          if (isHolder) {
            currentHolders.push(address.toLowerCase());
          }
        } catch (error) {
          console.error(`Failed to check HAT ${hatId} for address ${address}:`, error);
        }
      }
      
      return currentHolders;
    });
  }

  /**
   * Get pods that need indexing
   */
  private static async getPodsForIndexing(): Promise<Array<{
    id: string;
    management_hat_id?: string;
    membership_hat_id?: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('pods')
        .select('id, management_hat_id, membership_hat_id')
        .neq('status', 'inactive')
        .not('management_hat_id', 'is', null)
        .or('membership_hat_id.not.is.null');

      if (error) {
        console.error('Failed to get pods for indexing:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching pods for indexing:', error);
      throw error;
    }
  }

  /**
   * Upsert a member record
   */
  private static async upsertMember(member: MembershipRecord): Promise<void> {
    try {
      const { error } = await supabase
        .from('pod_members')
        .upsert({
          pod_id: member.pod_id,
          wallet: member.wallet,
          hat_id: member.hat_id,
          membership_type: member.membership_type,
          is_active: member.is_active,
          source: 'indexer',
          indexed_at: new Date().toISOString(),
          // Only set joined_at for new records
          joined_at: member.is_active ? new Date().toISOString() : undefined
        }, {
          onConflict: 'pod_id,wallet',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Failed to upsert member:', member, error);
        throw error;
      }
    } catch (error) {
      console.error('Error upserting member:', error);
      throw error;
    }
  }

  /**
   * Mark members as inactive who no longer hold HATs
   */
  private static async deactivateStaleMembers(
    podId: string, 
    currentMembers: string[], 
    stats: IndexingStats
  ): Promise<void> {
    try {
      // Get existing active members from database
      const { data: existingMembers, error } = await supabase
        .from('pod_members')
        .select('wallet')
        .eq('pod_id', podId)
        .eq('is_active', true)
        .eq('source', 'indexer');

      if (error) {
        console.error('Failed to get existing members:', error);
        return;
      }

      // Find members who are in DB but not in current HAT holders
      const staleMemberWallets = (existingMembers || [])
        .map(m => m.wallet)
        .filter(wallet => !currentMembers.includes(wallet));

      if (staleMemberWallets.length > 0) {
        console.log(`  🚫 Deactivating ${staleMemberWallets.length} stale members`);
        
        const { error: updateError } = await supabase
          .from('pod_members')
          .update({
            is_active: false,
            left_at: new Date().toISOString(),
            indexed_at: new Date().toISOString()
          })
          .eq('pod_id', podId)
          .in('wallet', staleMemberWallets)
          .eq('source', 'indexer');

        if (updateError) {
          console.error('Failed to deactivate stale members:', updateError);
        } else {
          stats.members_removed += staleMemberWallets.length;
        }
      }
    } catch (error) {
      console.error('Error deactivating stale members:', error);
    }
  }

  /**
   * Manual member management (for testing or admin actions)
   */
  static async addMemberManually(
    podId: string, 
    walletAddress: string, 
    membershipType: 'leader' | 'member' | 'admin' = 'member'
  ): Promise<void> {
    await this.upsertMember({
      pod_id: podId,
      wallet: walletAddress.toLowerCase(),
      hat_id: '', // No HAT ID for manual additions
      membership_type: membershipType,
      is_active: true
    });
  }

  /**
   * Remove member manually
   */
  static async removeMemberManually(podId: string, walletAddress: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('pod_members')
        .update({
          is_active: false,
          left_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase());

      if (error) {
        console.error('Failed to remove member manually:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error removing member manually:', error);
      throw error;
    }
  }

  /**
   * Get indexing status for a pod
   */
  static async getPodIndexingStatus(podId: string): Promise<{
    last_indexed_at: string | null;
    member_count: number;
    indexed_member_count: number;
    manual_member_count: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('pod_member_counts')
        .select('*')
        .eq('pod_id', podId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return {
        last_indexed_at: data?.last_indexed_at || null,
        member_count: data?.total_members || 0,
        indexed_member_count: data?.indexed_members || 0,
        manual_member_count: data?.manual_members || 0
      };
    } catch (error) {
      console.error('Error getting pod indexing status:', error);
      return {
        last_indexed_at: null,
        member_count: 0,
        indexed_member_count: 0,
        manual_member_count: 0
      };
    }
  }
}