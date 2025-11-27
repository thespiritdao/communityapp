// src/features/forum/hooks/useModerationPermissions.ts

import { useUnifiedForumAccess } from './useUnifiedForumAccess';

/**
 * Hook to check moderation permissions
 *
 * Checks if the current user has forumModeration permission
 * - If podId provided: checks ONLY for that specific pod
 * - If no podId: checks across all pods (global)
 */
export function useModerationPermissions(podId?: string) {
  const { permissions, isLoading, error, canModerateInPod, podRoles } =
    useUnifiedForumAccess();

  // Pod-specific moderation check (NEW)
  if (podId) {
    const canModerate = canModerateInPod(podId);
    const moderatorRoles = podRoles.filter(
      (role) => role.podId === podId && role.permissions.forumModeration,
    );

    return {
      canModerate,
      canPinThreads: canModerate,
      canLockThreads: canModerate,
      canDeleteContent: canModerate,
      canBanUsers: canModerate,
      canReviewReports: canModerate,
      isLoading,
      error,
      moderatorRoles,
    };
  }

  // Global moderation check (original behavior)
  return {
    canModerate: permissions?.canModerate || false,
    canPinThreads: permissions?.canPinThreads || false,
    canLockThreads: permissions?.canLockThreads || false,
    canDeleteContent: permissions?.canDeleteContent || false,
    canBanUsers: permissions?.canBanUsers || false,
    canReviewReports: permissions?.canReviewReports || false,
    isLoading,
    error,
    moderatorRoles:
      permissions?.podRoles.filter(
        (role) => role.permissions.forumModeration,
      ) || [],
  };
}
