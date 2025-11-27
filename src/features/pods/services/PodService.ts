import { supabase } from '@/utils/supabaseClient';
import type { Pod, MemberRef, PodServiceConfig } from '../types';
import { PodRolePermissionsService } from './PodRolePermissionsService';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

/**
 * PodService - Centralized service for pod operations
 *
 * Provides clean API for pod data access, member management,
 * and HAT integration with proper error handling.
 */
export class PodService {
  // Public client for on-chain HAT verification
  private static publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org')
  });

  /**
   * Get a single pod by ID
   */
  static async getPodById(id: string): Promise<Pod | null> {
    try {
      console.log('🔍 PodService.getPodById: Searching for pod ID:', id);
      
      // Check if user is authenticated for RLS policies
      const session = await getCurrentSession();
      console.log('🔐 PodService authentication status:', !!session?.user?.id);
      
      const { data, error } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          proxy_contract_address,
          proxy_admin_hat_id,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Pod not found
        }
        console.error('PodService.getPodById error:', error);
        throw error;
      }

      console.log('🏦 PodService.getPodById result for', id, ':', data);
      console.log('🏦 Treasury contract address from DB:', data?.treasury_contract_address);

      return data;
    } catch (error) {
      console.error(`Failed to fetch pod ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all pods with optional filtering
   */
  static async getAllPods(config: PodServiceConfig = {}): Promise<Pod[]> {
    try {
      let query = supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          proxy_contract_address,
          proxy_admin_hat_id,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      // Filter by active status unless specifically including inactive
      if (!config.includeInactive) {
        query = query.neq('status', 'inactive');
      }

      const { data, error } = await query;

      if (error) {
        console.error('PodService.getAllPods error:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch pods:', error);
      throw error;
    }
  }

  /**
   * Get pod leaders for a specific pod
   */
  static async listPodLeaders(podId: string): Promise<MemberRef[]> {
    try {
      const pod = await this.getPodById(podId);
      
      if (!pod?.pod_leads) {
        return [];
      }

      // Convert string array to MemberRef array
      return pod.pod_leads.map(wallet => ({ wallet }));
    } catch (error) {
      console.error(`Failed to fetch pod leaders for ${podId}:`, error);
      throw error;
    }
  }

  /**
   * Get active members for a pod
   * Falls back to pods table if pod_members table doesn't exist yet
   */
  static async listPodMembers(podId: string, membershipType?: 'leader' | 'member' | 'admin', currentUserAddress?: string): Promise<MemberRef[]> {
    try {
      // First try the new pod_members table structure
      try {
        let query = supabase
          .from('active_pod_members')
          .select('id, wallet, membership_type, joined_at, hat_id')
          .eq('pod_id', podId)
          .order('joined_at', { ascending: false });

        // Filter by membership type if specified
        if (membershipType) {
          query = query.eq('membership_type', membershipType);
        }

        const { data, error } = await query;

        if (error && error.code === '42P01') {
          // Table doesn't exist, fall back to legacy method
          throw new Error('Table not found, using fallback');
        } else if (error) {
          console.error('PodService.listPodMembers error:', error);
          throw error;
        }

        // ✅ ISSUE #7 FIX: Return full member data for removal flow
        return (data || []).map(member => ({
          wallet: member.wallet,
          id: member.id,
          hat_id: member.hat_id,
          membership_type: member.membership_type,
          joined_at: member.joined_at
        }));
      } catch (fallbackError) {
        console.log('🔄 Database empty, falling back to pod leaders from pods table');
        
        // Fallback: Get pod leaders from the pods table
        const pod = await this.getPodById(podId);
        if (!pod) {
          return [];
        }

        // If requesting leaders specifically or no filter, return pod leaders
        if (!membershipType || membershipType === 'leader') {
          const leaders = (pod.pod_leads || []).map(wallet => ({ wallet }));
          console.log(`📋 Found ${leaders.length} pod leaders as fallback`);
          return leaders;
        }

        // For member types, return empty array for now
        // TODO: Implement proper member detection when database is set up
        if (membershipType === 'member') {
          console.log('⚠️ Pod members table not available. Returning empty members list.');
          return [];
        }
        
        console.log('⚠️ Pod members table exists but is empty. Consider running indexer to populate member data.');
        return [];
      }
    } catch (error) {
      console.error(`Failed to fetch pod members for ${podId}:`, error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  }

  /**
   * Get membership HAT wearers (for backward compatibility)
   * Now uses pod_members table instead of runtime scanning
   */
  static async listHatWearers(podId: string): Promise<MemberRef[]> {
    return this.listPodMembers(podId, 'member');
  }

  /**
   * Get pods that a user has management access to
   * Based on HAT ownership or pod leadership
   */
  static async getUserManagedPods(userAddress: string): Promise<Pod[]> {
    try {
      const allPods = await this.getAllPods();
      
      // Filter pods where user is a leader
      // TODO: In Phase 4, also check HAT ownership for management access
      const managedPods = allPods.filter(pod => {
        if (!pod.pod_leads) return false;
        return pod.pod_leads.some(leader => 
          leader.toLowerCase() === userAddress.toLowerCase()
        );
      });

      return managedPods;
    } catch (error) {
      console.error(`Failed to fetch managed pods for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Create a new pod (returns proposal ID for governance approval)
   * Now includes role permissions creation for draft pods
   */
  static async createPod(podData: {
    name: string;
    description: string;
    parentPodId: string;
    podLeads: string[];
    image?: string;
    createdByAddress: string;
    managementHatId?: string; // Optional HAT ID if known at creation
    membershipHatId?: string; // Optional HAT ID if known at creation
  }): Promise<{ podId: string; proposalId?: string }> {
    try {
      console.log(`🏗️ Creating new pod: ${podData.name}`);
      
      const { data, error } = await supabase
        .from('pods')
        .insert({
          name: podData.name,
          description: podData.description,
          parent_pod_id: podData.parentPodId,
          pod_leads: podData.podLeads,
          pod_image_url: podData.image,
          created_by_address: podData.createdByAddress,
          status: 'draft', // Pending governance approval
          token_type: 'HATS',
          is_active: false,
          management_hat_id: podData.managementHatId || null,
          membership_hat_id: podData.membershipHatId || null
        })
        .select()
        .single();

      if (error) {
        console.error('PodService.createPod error:', error);
        throw error;
      }

      console.log(`✅ Pod created in database: ${data.id}`);

      // Create role permissions if HAT IDs are provided
      if (podData.managementHatId && podData.membershipHatId) {
        try {
          console.log(`🎩 Creating role permissions for draft pod: ${data.id}`);
          
          await PodRolePermissionsService.initializeDefaultRoles(
            data.id,
            podData.managementHatId,
            podData.membershipHatId,
            podData.createdByAddress
          );

          console.log(`✅ Role permissions created for draft pod: ${data.id}`);
        } catch (roleError) {
          console.error(`⚠️ Failed to create role permissions for draft pod ${data.id}:`, roleError);
          // Don't fail pod creation if role permissions fail
          // They can be created later during activation
        }
      } else {
        console.log(`ℹ️ HAT IDs not provided, role permissions will be created during activation`);
      }

      return {
        podId: data.id,
        proposalId: undefined // Will be set when governance integration is added
      };
    } catch (error) {
      console.error('Failed to create pod:', podData, error);
      throw error;
    }
  }

  /**
   * Update pod information
   */
  static async updatePod(podId: string, updates: Partial<Pod>): Promise<Pod> {
    try {
      const { data, error } = await supabase
        .from('pods')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', podId)
        .select()
        .single();

      if (error) {
        console.error('PodService.updatePod error:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error(`Failed to update pod ${podId}:`, updates, error);
      throw error;
    }
  }

  /**
   * Get member statistics for a pod
   */
  static async getPodMemberStats(podId: string): Promise<{
    total_members: number;
    leaders_count: number;
    members_count: number;
    admins_count: number;
    last_indexed_at: string | null;
    indexed_members: number;
    manual_members: number;
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

      return data || {
        total_members: 0,
        leaders_count: 0,
        members_count: 0,
        admins_count: 0,
        last_indexed_at: null,
        indexed_members: 0,
        manual_members: 0
      };
    } catch (error) {
      console.error(`Failed to get pod member stats for ${podId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a user is a member of a pod
   */
  static async checkPodMembership(podId: string, walletAddress: string): Promise<{
    is_member: boolean;
    membership_type?: 'leader' | 'member' | 'admin';
    joined_at?: string;
    hat_id?: string;
  }> {
    try {
      // First check the database for indexed membership data
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('membership_type, joined_at, hat_id')
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        // ⚠️ CRITICAL: Verify on-chain HAT status before granting access
        // Database may be outdated if eligibility criteria changed
        if (data.hat_id) {
          console.log(`🔍 Verifying on-chain HAT status for ${walletAddress} (HAT: ${data.hat_id})`);

          try {
            // Use the static public client for on-chain verification
            const balance = await PodService.publicClient.readContract({
              address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137', // Hats Protocol address
              abi: [{
                name: 'balanceOf',
                type: 'function',
                inputs: [
                  { name: 'wearer', type: 'address' },
                  { name: 'hatId', type: 'uint256' }
                ],
                outputs: [{ name: 'balance', type: 'uint256' }],
                stateMutability: 'view'
              }],
              functionName: 'balanceOf',
              args: [walletAddress as `0x${string}`, BigInt(data.hat_id)]
            });

            console.log(`📊 On-chain HAT balance for ${walletAddress}:`, balance);

            if (balance === 0n) {
              console.warn(`⚠️ User ${walletAddress} is in database but does NOT wear HAT ${data.hat_id} on-chain (ineligible)`);
              return { is_member: false };
            }

            console.log(`✅ On-chain HAT verification passed for ${walletAddress}`);

          } catch (verifyError) {
            console.error('❌ Failed to verify on-chain HAT status:', verifyError);
            // Continue with database result if verification fails (to avoid breaking existing functionality)
          }
        }

        return {
          is_member: true,
          membership_type: data.membership_type,
          joined_at: data.joined_at,
          hat_id: data.hat_id
        };
      }

      // Fallback: Check pod leadership directly from pods table
      console.log(`🔍 Checking pod leadership fallback for ${walletAddress} in pod ${podId}`);
      const pod = await this.getPodById(podId);
      
      if (pod?.pod_leads) {
        const isLeader = pod.pod_leads.some(leader => 
          leader.toLowerCase() === walletAddress.toLowerCase()
        );
        
        if (isLeader && pod.management_hat_id) {
          console.log(`✅ Found leadership access for ${walletAddress} in pod ${podId}`);

          // ⚠️ CRITICAL: Verify on-chain HAT status before granting access
          console.log(`🔍 Verifying on-chain HAT status for leader (HAT: ${pod.management_hat_id})`);

          try {
            // Use the static public client for on-chain verification
            const balance = await PodService.publicClient.readContract({
              address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
              abi: [{
                name: 'balanceOf',
                type: 'function',
                inputs: [
                  { name: 'wearer', type: 'address' },
                  { name: 'hatId', type: 'uint256' }
                ],
                outputs: [{ name: 'balance', type: 'uint256' }],
                stateMutability: 'view'
              }],
              functionName: 'balanceOf',
              args: [walletAddress as `0x${string}`, BigInt(pod.management_hat_id)]
            });

            console.log(`📊 On-chain HAT balance for leader ${walletAddress}:`, balance);

            if (balance === 0n) {
              console.warn(`⚠️ Leader ${walletAddress} does NOT wear management HAT ${pod.management_hat_id} on-chain (ineligible)`);
              return { is_member: false };
            }

            console.log(`✅ On-chain HAT verification passed for leader ${walletAddress}`);

          } catch (verifyError) {
            console.error('❌ Failed to verify on-chain HAT status for leader:', verifyError);
            // Continue with database result if verification fails
          }

          return {
            is_member: true,
            membership_type: 'leader',
            joined_at: pod.created_at || new Date().toISOString(),
            hat_id: pod.management_hat_id
          };
        }
      }

      // No membership found after all checks
      console.log(`❌ No membership found for ${walletAddress} in pod ${podId}`);
      return { is_member: false };
    } catch (error) {
      console.error(`Failed to check pod membership for ${walletAddress} in ${podId}:`, error);
      throw error;
    }
  }

  /**
   * Get all pods a user is a member of
   */
  static async getUserPodMemberships(walletAddress: string): Promise<Array<{
    pod_id: string;
    membership_type: 'leader' | 'member' | 'admin';
    joined_at: string;
    hat_id?: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('pod_id, membership_type, joined_at, hat_id')
        .eq('wallet', walletAddress.toLowerCase())
        .order('joined_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(`Failed to get pod memberships for ${walletAddress}:`, error);
      throw error;
    }
  }

  /**
   * Search pods by name or description
   */
  static async searchPods(searchTerm: string, limit = 10): Promise<Pod[]> {
    try {
      const { data, error } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url
        `)
        .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
        .neq('status', 'inactive')
        .limit(limit)
        .order('name', { ascending: true });

      if (error) {
        console.error('PodService.searchPods error:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to search pods:', searchTerm, error);
      throw error;
    }
  }
}