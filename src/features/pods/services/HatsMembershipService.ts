import { supabase } from '@/utils/supabaseClient';
import { PodCoreService } from './PodCoreService';
import type { MemberRef } from '../types';

export interface MembershipRecord {
  pod_id: string;
  wallet: string;
  membership_type: 'leader' | 'member' | 'admin';
  joined_at: string;
  hat_id?: string;
  is_active: boolean;
}

export interface MembershipStats {
  totalMembers: number;
  leaders: number;
  members: number;
  recentJoins: number;
  activeMemberships: number;
}

/**
 * HatsMembershipService - Consolidated member indexing and management
 *
 * Handles all membership-related operations including:
 * - Member indexing from HATs Protocol
 * - Membership status tracking
 * - Pod member statistics
 * - Member role management
 */
export class HatsMembershipService {
  /**
   * Index members for a specific pod from HATs Protocol
   */
  static async indexPodMembers(podId: string): Promise<MembershipRecord[]> {
    try {
      console.log('🔄 Indexing members for pod:', podId);

      const pod = await PodCoreService.getPodById(podId);
      if (!pod) {
        throw new Error(`Pod ${podId} not found`);
      }

      const memberships: MembershipRecord[] = [];

      // Index pod leaders
      if (pod.pod_leads && pod.pod_leads.length > 0) {
        for (const leader of pod.pod_leads) {
          memberships.push({
            pod_id: podId,
            wallet: leader.toLowerCase(),
            membership_type: 'leader',
            joined_at: pod.created_at || new Date().toISOString(),
            hat_id: pod.management_hat_id ?? undefined,
            is_active: true,
          });
        }
      }

      // Store memberships in database
      if (memberships.length > 0) {
        const { error } = await supabase
          .from('active_pod_members')
          .upsert(memberships, {
            onConflict: 'pod_id,wallet',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error('Failed to store memberships:', error);
          throw error;
        }
      }

      console.log(`✅ Indexed ${memberships.length} members for pod ${podId}`);
      return memberships;
    } catch (error) {
      console.error('Failed to index pod members:', error);
      throw error;
    }
  }

  /**
   * Get all active members for a pod
   */
  static async getPodMembers(podId: string): Promise<MemberRef[]> {
    try {
      // Try indexed data first
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('wallet, membership_type, joined_at, hat_id')
        .eq('pod_id', podId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (error && error.code !== '42P01') {
        throw error;
      }

      if (data && data.length > 0) {
        return data.map((member) => ({ wallet: member.wallet }));
      }

      // Fallback to PodCoreService
      return await PodCoreService.getPodMembers(podId);
    } catch (error) {
      console.error(`Failed to get members for pod ${podId}:`, error);
      return [];
    }
  }

  /**
   * Get membership statistics for a pod
   */
  static async getPodMembershipStats(podId: string): Promise<MembershipStats> {
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('membership_type, joined_at, is_active')
        .eq('pod_id', podId);

      if (error && error.code !== '42P01') {
        throw error;
      }

      if (!data) {
        return {
          totalMembers: 0,
          leaders: 0,
          members: 0,
          recentJoins: 0,
          activeMemberships: 0,
        };
      }

      const activeMembers = data.filter((m) => m.is_active);
      const recentThreshold = new Date();
      recentThreshold.setDate(recentThreshold.getDate() - 7);

      const recentJoins = activeMembers.filter(
        (m) => new Date(m.joined_at) > recentThreshold,
      ).length;

      return {
        totalMembers: data.length,
        leaders: activeMembers.filter((m) => m.membership_type === 'leader')
          .length,
        members: activeMembers.filter((m) => m.membership_type === 'member')
          .length,
        recentJoins,
        activeMemberships: activeMembers.length,
      };
    } catch (error) {
      console.error(`Failed to get membership stats for pod ${podId}:`, error);
      return {
        totalMembers: 0,
        leaders: 0,
        members: 0,
        recentJoins: 0,
        activeMemberships: 0,
      };
    }
  }

  /**
   * Add a new member to a pod
   */
  static async addPodMember(
    podId: string,
    walletAddress: string,
    membershipType: 'leader' | 'member' | 'admin',
    hatId?: string,
  ): Promise<boolean> {
    try {
      console.log(
        `👥 Adding ${membershipType} to pod ${podId}:`,
        walletAddress,
      );

      const membership: MembershipRecord = {
        pod_id: podId,
        wallet: walletAddress.toLowerCase(),
        membership_type: membershipType,
        joined_at: new Date().toISOString(),
        hat_id: hatId,
        is_active: true,
      };

      const { error } = await supabase
        .from('active_pod_members')
        .upsert(membership, {
          onConflict: 'pod_id,wallet',
          ignoreDuplicates: false,
        });

      if (error) {
        throw error;
      }

      console.log(`✅ Added ${membershipType} to pod ${podId}`);
      return true;
    } catch (error) {
      console.error('Failed to add pod member:', error);
      return false;
    }
  }

  /**
   * Remove a member from a pod
   */
  static async removePodMember(
    podId: string,
    walletAddress: string,
  ): Promise<boolean> {
    try {
      console.log(`👥 Removing member from pod ${podId}:`, walletAddress);

      const { error } = await supabase
        .from('active_pod_members')
        .update({ is_active: false })
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase());

      if (error) {
        throw error;
      }

      console.log(`✅ Removed member from pod ${podId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove pod member:', error);
      return false;
    }
  }

  /**
   * Update member role in a pod
   */
  static async updateMemberRole(
    podId: string,
    walletAddress: string,
    newRole: 'leader' | 'member' | 'admin',
    hatId?: string,
  ): Promise<boolean> {
    try {
      console.log(
        `👥 Updating member role in pod ${podId}:`,
        walletAddress,
        'to',
        newRole,
      );

      const { error } = await supabase
        .from('active_pod_members')
        .update({
          membership_type: newRole,
          hat_id: hatId,
          is_active: true,
        })
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase());

      if (error) {
        throw error;
      }

      console.log(`✅ Updated member role in pod ${podId}`);
      return true;
    } catch (error) {
      console.error('Failed to update member role:', error);
      return false;
    }
  }

  /**
   * Check if user is a member of a pod
   */
  static async checkMembership(
    podId: string,
    walletAddress: string,
  ): Promise<{
    isMember: boolean;
    membershipType?: 'leader' | 'member' | 'admin';
    joinedAt?: string;
    hatId?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('membership_type, joined_at, hat_id')
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase())
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        return {
          isMember: true,
          membershipType: data.membership_type,
          joinedAt: data.joined_at,
          hatId: data.hat_id,
        };
      }

      // Fallback to PodCoreService
      const result = await PodCoreService.checkPodMembership(podId, walletAddress);
      return {
        isMember: result.is_member,
        membershipType: result.membership_type,
        joinedAt: result.joined_at,
        hatId: result.hat_id,
      };
    } catch (error) {
      console.error(
        `Failed to check membership for ${walletAddress} in pod ${podId}:`,
        error,
      );
      return { isMember: false };
    }
  }

  /**
   * Get all pods where user is a member
   */
  static async getUserMemberships(walletAddress: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('pod_id')
        .eq('wallet', walletAddress.toLowerCase())
        .eq('is_active', true);

      if (error && error.code !== '42P01') {
        throw error;
      }

      return (data || []).map((record) => record.pod_id);
    } catch (error) {
      console.error(`Failed to get memberships for ${walletAddress}:`, error);
      return [];
    }
  }

  /**
   * Bulk index members for multiple pods
   */
  static async bulkIndexPodMembers(podIds: string[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const podId of podIds) {
      try {
        await this.indexPodMembers(podId);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Pod ${podId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log(
      `📊 Bulk indexing complete: ${results.success} success, ${results.failed} failed`,
    );
    return results;
  }
}
