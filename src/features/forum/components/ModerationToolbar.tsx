// src/features/forum/components/ModerationToolbar.tsx

'use client';

import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useModerationPermissions } from '../hooks/useModerationPermissions';
import {
  pinThread,
  unpinThread,
  lockThread,
  unlockThread,
  deleteThread,
  deletePost,
} from '../services/ModerationService';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ModerationToolbarProps {
  targetType: 'thread' | 'post';
  targetId: string;
  isPinned?: boolean;
  isLocked?: boolean;
  onActionComplete?: () => void;
  podId?: string | null; // NEW: Pod ID for pod-specific permissions
}

export function ModerationToolbar({
  targetType,
  targetId,
  isPinned = false,
  isLocked = false,
  onActionComplete,
  podId,
}: ModerationToolbarProps) {
  const { evmAddress: address } = useEvmAddress();
  const { canModerate, moderatorRoles } = useModerationPermissions(
    podId || undefined,
  );
  const [isProcessing, setIsProcessing] = useState(false);

  if (!canModerate || !address) {
    console.log(
      `🎯 [ModerationToolbar] Pod ${podId}: canModerate=${canModerate}, hiding toolbar`,
    );
    return null;
  }

  console.log(
    `✅ [ModerationToolbar] Pod ${podId}: canModerate=${canModerate}, showing toolbar`,
  );

  const moderatorHatId = moderatorRoles[0]?.hatId || null;

  const handleAction = async (
    action: () => Promise<{ success: boolean; error?: string }>,
    actionName: string,
    isDelete = false,
  ) => {
    setIsProcessing(true);
    try {
      const result = await action();
      if (result.success) {
        console.log(`✅ ${actionName} successful`);
        if (isDelete && targetType === 'thread') {
          window.location.href = '/forum';
        } else {
          onActionComplete?.();
        }
      } else {
        console.error(`❌ ${actionName} failed:`, result.error);
        alert(`Failed to ${actionName}: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ ${actionName} error:`, error);
      alert(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePin = () => {
    if (targetType !== 'thread') return;
    const action = isPinned
      ? () => unpinThread(targetId, address, moderatorHatId)
      : () => pinThread(targetId, address, moderatorHatId);
    handleAction(action, isPinned ? 'Unpin' : 'Pin');
  };

  const handleLock = () => {
    if (targetType !== 'thread') return;
    const action = isLocked
      ? () => unlockThread(targetId, address, moderatorHatId)
      : () => lockThread(targetId, address, moderatorHatId);
    handleAction(action, isLocked ? 'Unlock' : 'Lock');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Defer past current event loop so Radix dropdown close doesn't interfere
    setTimeout(() => {
      const confirmMsg =
        targetType === 'thread'
          ? 'Are you sure you want to delete this thread? This will also delete all posts in it.'
          : 'Are you sure you want to delete this post?';

      if (!confirm(confirmMsg)) return;

      const reason = prompt('Reason for deletion (optional):') || undefined;
      const action =
        targetType === 'thread'
          ? () => deleteThread(targetId, address!, moderatorHatId, reason)
          : () => deletePost(targetId, address!, moderatorHatId, reason);

      handleAction(action, 'Delete', true);
    }, 0);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 mr-2">Moderator Actions:</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Moderate'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {targetType === 'thread' && (
            <>
              <DropdownMenuItem onClick={handlePin}>
                {isPinned ? '📌 Unpin Thread' : '📌 Pin Thread'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLock}>
                {isLocked ? '🔓 Unlock Thread' : '🔒 Lock Thread'}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={(e) => handleDelete(e)} style={{ color: '#8B3A3A' }}>
            🗑️ Delete {targetType === 'thread' ? 'Thread' : 'Post'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
