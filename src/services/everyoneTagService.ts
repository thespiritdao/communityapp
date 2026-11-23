/**
 * @everyone Tag Service (server-only)
 *
 * Permission checking and recipient lookup for @everyone mentions in
 * chat/forums. Runs inside API routes, so it reads with the service-role
 * client: the shared browser client has no session on the server and the
 * anon role has no table access.
 *
 * Permission rules:
 * 1. Executive Pod leaders can use @everyone in any chat.
 * 2. In a pod's chat, members whose role has 'chatModeration' in that pod can
 *    use it. The permission is pod-scoped.
 * 3. In a chat that belongs to no pod (e.g. General), only Executive Pod
 *    leaders can use it, and it reaches every member of the platform.
 */

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getHatId } from '@/lib/hatRegistry';

export interface EveryoneTagPermission {
  canUseEveryoneTag: boolean;
  reason?: string;
  podId?: string;
  chatGroupId?: string;
}

export interface EveryoneTagContext {
  userWallet: string;
  chatGroupId?: string;
  podId?: string | null;
  contextType: 'chat' | 'forum';
}

// The mention picker stores the tag as "@[everyone](everyone)"; typing it by
// hand leaves a bare "@everyone". Both count.
const EVERYONE_PATTERN = /@\[everyone\]\(everyone\)|@everyone\b/i;

class EveryoneTagService {
  /**
   * Check if a user can use @everyone tag in a specific context
   */
  async checkEveryoneTagPermission(
    context: EveryoneTagContext,
  ): Promise<EveryoneTagPermission> {
    const { userWallet, chatGroupId } = context;

    try {
      // Step 1: Determine the pod context (none for platform-wide chats)
      let targetPodId: string | undefined = context.podId || undefined;

      if (!targetPodId && chatGroupId) {
        const { data: chatGroup, error } = await supabaseAdmin
          .from('chat_groups')
          .select('pod_id')
          .eq('id', chatGroupId)
          .maybeSingle();

        if (error) throw error;
        if (!chatGroup) {
          return {
            canUseEveryoneTag: false,
            reason: 'Cannot determine chat context for @everyone tag',
          };
        }
        targetPodId = chatGroup.pod_id || undefined;
      }

      if (!targetPodId && !chatGroupId) {
        return {
          canUseEveryoneTag: false,
          reason: 'Cannot determine pod context for @everyone tag',
        };
      }

      // Step 2: Executive Pod leaders have global @everyone access
      if (await this.isExecutivePodLeader(userWallet)) {
        return { canUseEveryoneTag: true, podId: targetPodId, chatGroupId };
      }

      // Step 3: A chat with no pod reaches all members: executive leaders only
      if (!targetPodId) {
        return {
          canUseEveryoneTag: false,
          reason: 'Only Executive Pod leaders can use @everyone in this chat',
        };
      }

      // Step 4: chatModeration permission in this specific pod
      if (await this.hasChatModerationInPod(userWallet, targetPodId)) {
        return { canUseEveryoneTag: true, podId: targetPodId, chatGroupId };
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
        reason: 'Failed to verify permissions for @everyone',
      };
    }
  }

  /**
   * Check if user is an Executive Pod Leader
   */
  private async isExecutivePodLeader(userWallet: string): Promise<boolean> {
    const executiveLeaderHat = await getHatId('EXECUTIVE_POD_LEADER');

    if (!executiveLeaderHat) {
      console.warn('[EveryoneTagService] EXECUTIVE_POD_LEADER hat not configured');
      return false;
    }

    const { data, error } = await supabaseAdmin
      .from('active_pod_members')
      .select('hat_id')
      .eq('wallet', userWallet.toLowerCase())
      .eq('hat_id', executiveLeaderHat)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error('[EveryoneTagService] Executive leader check failed:', error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  /**
   * Check if user has chatModeration permission in a specific pod
   */
  private async hasChatModerationInPod(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from('active_pod_members')
      .select('hat_id')
      .eq('pod_id', podId)
      .eq('wallet', userWallet.toLowerCase())
      .eq('is_active', true);

    if (memberError) {
      console.error('[EveryoneTagService] Membership lookup failed:', memberError);
      return false;
    }

    const userHats = new Set(
      (memberships ?? [])
        .map((m) => m.hat_id?.toLowerCase())
        .filter(Boolean) as string[],
    );
    if (userHats.size === 0) return false;

    const { data: roles, error: roleError } = await supabaseAdmin
      .from('pod_role_permissions')
      .select('permissions, token_address')
      .eq('pod_id', podId);

    if (roleError) {
      console.error('[EveryoneTagService] Role permission lookup failed:', roleError);
      return false;
    }

    return (roles ?? []).some((role) => {
      if (!role.token_address || !userHats.has(role.token_address.toLowerCase())) {
        return false;
      }
      try {
        const permissions =
          typeof role.permissions === 'string'
            ? JSON.parse(role.permissions)
            : role.permissions;
        return permissions?.chatModeration === true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Wallets that should receive an @everyone notification: the pod's active
   * members, or every member of the platform when the chat has no pod.
   * Lower-cased and de-duplicated.
   */
  async getRecipients(podId?: string | null): Promise<string[]> {
    let wallets: (string | null)[];

    if (podId) {
      const { data, error } = await supabaseAdmin
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', podId)
        .eq('is_active', true);
      if (error) throw error;
      wallets = (data ?? []).map((m) => m.wallet);
    } else {
      const { data, error } = await supabaseAdmin
        .from('public_profiles')
        .select('wallet_address');
      if (error) throw error;
      wallets = (data ?? []).map((p) => p.wallet_address);
    }

    return [
      ...new Set(
        wallets.filter(Boolean).map((w) => (w as string).toLowerCase()),
      ),
    ];
  }

  /**
   * Detect if message contains @everyone tag
   */
  detectEveryoneTag(content: string): boolean {
    return EVERYONE_PATTERN.test(content);
  }

  /**
   * Extract @everyone mentions from content and validate permissions
   */
  async validateAndExtractEveryone(
    content: string,
    context: EveryoneTagContext,
  ): Promise<{ isValid: boolean; shouldNotify: boolean; reason?: string }> {
    if (!this.detectEveryoneTag(content)) {
      return { isValid: true, shouldNotify: false };
    }

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
