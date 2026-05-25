/**
 * Hook for checking @everyone tag permissions in chat/forum UI
 *
 * Usage:
 * const { canUseEveryone, isLoading } = useEveryonePermission({
 *   chatGroupId: 'uuid',
 *   podId: 'uuid',
 *   contextType: 'chat'
 * });
 */

import { useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { everyoneTagService, type EveryoneTagContext } from '@/services/everyoneTagService';

interface UseEveryonePermissionOptions {
  chatGroupId?: string;
  podId?: string;
  contextType: 'chat' | 'forum';
}

export function useEveryonePermission({
  chatGroupId,
  podId,
  contextType,
}: UseEveryonePermissionOptions) {
  // Identity wallet (canonical) — used to resolve the user's @everyone permission.
  const evmAddress = useUserWallet();
  const [canUseEveryone, setCanUseEveryone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionReason, setPermissionReason] = useState<string | undefined>();

  useEffect(() => {
    async function checkPermission() {
      if (!evmAddress) {
        setCanUseEveryone(false);
        setIsLoading(false);
        setPermissionReason('Wallet not connected');
        return;
      }

      if (!chatGroupId && !podId) {
        setCanUseEveryone(false);
        setIsLoading(false);
        setPermissionReason('No chat or pod context');
        return;
      }

      setIsLoading(true);

      try {
        const context: EveryoneTagContext = {
          userWallet: evmAddress,
          chatGroupId,
          podId,
          contextType,
        };

        const permission = await everyoneTagService.checkEveryoneTagPermission(context);

        setCanUseEveryone(permission.canUseEveryoneTag);
        setPermissionReason(permission.reason);
      } catch (error) {
        console.error('[useEveryonePermission] Permission check failed:', error);
        setCanUseEveryone(false);
        setPermissionReason('Failed to check permissions');
      } finally {
        setIsLoading(false);
      }
    }

    checkPermission();
  }, [evmAddress, chatGroupId, podId, contextType]);

  return {
    canUseEveryone,
    isLoading,
    permissionReason,
  };
}
