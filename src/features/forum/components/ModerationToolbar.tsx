// src/features/forum/components/ModerationToolbar.tsx

'use client';

import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useModerationPermissions } from '../hooks/useModerationPermissions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/utils/supabaseClient';

interface ModerationToolbarProps {
  targetType: 'thread' | 'post';
  targetId: string;
  isPinned?: boolean;
  isLocked?: boolean;
  onActionComplete?: () => void;
  podId?: string | null;
}

async function callModerationAPI(
  action: string,
  targetType: string,
  targetId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  const res = await fetch('/api/forum/moderate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, targetType, targetId, reason }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.error || `HTTP ${res.status}` };
  }
  return { success: true };
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
  const { canModerate } = useModerationPermissions(podId || undefined);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!canModerate || !address) return null;

  const handleAction = async (
    action: string,
    isDelete = false,
    reason?: string,
  ) => {
    setIsProcessing(true);
    try {
      const result = await callModerationAPI(action, targetType, targetId, reason);
      if (result.success) {
        console.log(`✅ Moderation action "${action}" successful`);
        if (isDelete && targetType === 'thread') {
          window.location.href = '/forum';
        } else {
          onActionComplete?.();
        }
      } else {
        console.error(`❌ Moderation action "${action}" failed:`, result.error);
        alert(`Failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Moderation action "${action}" error:`, error);
      alert(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePin = () => handleAction(isPinned ? 'unpin' : 'pin');
  const handleLock = () => handleAction(isLocked ? 'unlock' : 'lock');

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setTimeout(() => {
      const confirmMsg =
        targetType === 'thread'
          ? 'Are you sure you want to delete this thread? This will also delete all posts in it.'
          : 'Are you sure you want to delete this post?';

      if (!confirm(confirmMsg)) return;

      const reason = prompt('Reason for deletion (optional):') || undefined;
      handleAction('delete', true, reason);
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
          <DropdownMenuItem onClick={handleDelete} style={{ color: '#8B3A3A' }}>
            🗑️ Delete {targetType === 'thread' ? 'Thread' : 'Post'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
