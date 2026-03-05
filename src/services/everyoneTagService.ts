/**
 * @everyone Tag Service
 *
 * Handles permission checking and notification delivery for @everyone mentions in chat/forums.
 *
 * Permission Rules:
 * 1. User must have 'chatModeration' permission in the specific pod
 * 2. Executive Pod Leaders can use @everyone in any chat
 * 3. Permission is pod-scoped - having it in one pod doesn't grant cross-pod access
 */

import { supabase } from '@/utils/supabaseClient';
import { getClientHatId } from '@/lib/hatRegistryClient';

export interface EveryoneTagPermission {
  canUseEveryoneTag: boolean;
  reason?: string;
  podId?: string;
  chatGroupId?: string;
}

export interface EveryoneTagContext {
  userWallet: string;
  chatGroupId?: string;
  podId?: string;
  contextType: 'chat' | 'forum';
}

class EveryoneTagService {
  /**
   * Check if a user can use @everyone tag in a specific context
   */
  async checkEveryoneTagPermission(
    context: EveryoneTagContext,
  ): Promise<EveryoneTagPermission> {
    const { userWallet, chatGroupId, podId, contextType } = context;

    try {
      // Step 1: Determine the pod context
      let targetPodId = podId;

      if (!targetPodId && chatGroupId) {
        // Get pod from chat group
        const { data: chatGroup } = await supabase
          .from('chat_groups')
          .select('pod_id')
          .eq('id', chatGroupId)
          .single();

        if (chatGroup?.pod_id) {
          targetPodId = chatGroup.pod_id;
        }
      }

      if (!targetPodId) {
        return {
          canUseEveryoneTag: false,
          reason: 'Cannot determine pod context for @everyone tag',
        };
      }

      // Step 2: Check if user is Executive Pod Leader (global @everyone access)
      const isExecutiveLeader = await this.isExecutivePodLeader(userWallet);

      if (isExecutiveLeader) {
        return {
          canUseEveryoneTag: true,
          podId: targetPodId,
          chatGroupId,
        };
      }

      // Step 3: Check if user has chatModeration permission in this specific pod
      const hasChatModeration = await this.hasChatModerationInPod(
        userWallet,
        targetPodId,
      );

      if (hasChatModeration) {
        return {
          canUseEveryoneTag: true,
          podId: targetPodId,
          chatGroupId,
        };
      }

      return {
        canUseEveryoneTag: false,
        reason: 'You must have chat moderation permissions in this pod to use @everyone',
        podId: targetPodId,
      };
    } catch (error) {
      console.error('[EveryoneTagService] Permission check failed:', error);
      return {
        canUseEveryoneTag: false,
        reason: 'Failed to verify permissions',
      };
    }
  }

  /**
   * Check if user is an Executive Pod Leader
   */
  private async isExecutivePodLeader(userWallet: string): Promise<boolean> {
    const executiveLeaderHat = getClientHatId('EXECUTIVE_POD_LEADER');

    if (!executiveLeaderHat) {
      console.warn('[EveryoneTagService] EXECUTIVE_POD_LEADER hat not configured');
      return false;
    }

    try {
      // Check if user has the executive leader HAT in active_pod_members
      const { data: membership } = await supabase
        .from('active_pod_members')
        .select('hat_id, is_active')
        .eq('wallet', userWallet.toLowerCase())
        .eq('hat_id', executiveLeaderHat)
        .eq('is_active', true)
        .maybeSingle();

      return !!membership;
    } catch (error) {
      console.error('[EveryoneTagService] Executive leader check failed:', error);
      return false;
    }
  }

  /**
   * Check if user has chatModeration permission in a specific pod
   */
  private async hasChatModerationInPod(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    try {
      // Get user's membership in the pod
      const { data: membership } = await supabase
        .from('active_pod_members')
        .select('hat_id')
        .eq('pod_id', podId)
        .eq('wallet', userWallet.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

      if (!membership?.hat_id) {
        return false;
      }

      // Check role permissions for chatModeration
      const { data: rolePermissions } = await supabase
        .from('pod_role_permissions')
        .select('permissions')
        .eq('pod_id', podId)
        .eq('token_address', membership.hat_id)
        .maybeSingle();

      if (!rolePermissions) {
        return false;
      }

      const permissions =
        typeof rolePermissions.permissions === 'string'
          ? JSON.parse(rolePermissions.permissions)
          : rolePermissions.permissions;

      return permissions.chatModeration === true;
    } catch (error) {
      console.error('[EveryoneTagService] Chat moderation check failed:', error);
      return false;
    }
  }

  /**
   * Get all members of a chat group who should receive @everyone notifications
   */
  async getChatGroupMembers(chatGroupId: string): Promise<string[]> {
    try {
      // Get pod ID from chat group
      const { data: chatGroup } = await supabase
        .from('chat_groups')
        .select('pod_id')
        .eq('id', chatGroupId)
        .single();

      if (!chatGroup?.pod_id) {
        console.error('[EveryoneTagService] Chat group has no associated pod');
        return [];
      }

      // Get all active members of the pod
      const { data: members } = await supabase
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', chatGroup.pod_id)
        .eq('is_active', true);

      if (!members) {
        return [];
      }

      return members.map((m) => m.wallet);
    } catch (error) {
      console.error('[EveryoneTagService] Failed to get chat group members:', error);
      return [];
    }
  }

  /**
   * Get all members of a forum/pod who should receive @everyone notifications
   */
  async getPodMembers(podId: string): Promise<string[]> {
    try {
      const { data: members } = await supabase
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', podId)
        .eq('is_active', true);

      if (!members) {
        return [];
      }

      return members.map((m) => m.wallet);
    } catch (error) {
      console.error('[EveryoneTagService] Failed to get pod members:', error);
      return [];
    }
  }

  /**
   * Detect if message contains @everyone tag
   */
  detectEveryoneTag(content: string): boolean {
    const everyonePattern = /@everyone\b/i;
    return everyonePattern.test(content);
  }

  /**
   * Extract @everyone mentions from content and validate permissions
   */
  async validateAndExtractEveryone(
    content: string,
    context: EveryoneTagContext,
  ): Promise<{ isValid: boolean; shouldNotify: boolean; reason?: string }> {
    const hasEveryoneTag = this.detectEveryoneTag(content);

    if (!hasEveryoneTag) {
      return { isValid: true, shouldNotify: false };
    }

    // Check permission
    const permission = await this.checkEveryoneTagPermission(context);

    if (!permission.canUseEveryoneTag) {
      return {
        isValid: false,
        shouldNotify: false,
        reason: permission.reason || 'Not authorized to use @everyone',
      };
    }

    return { isValid: true, shouldNotify: true };
  }
}

export const everyoneTagService = new EveryoneTagService();
