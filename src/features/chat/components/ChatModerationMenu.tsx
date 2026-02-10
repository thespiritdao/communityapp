// src/features/chat/components/ChatModerationMenu.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  MoreVertical,
  Trash2,
  UserX,
  UserCheck,
  Pin,
  PinOff,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import type { Message } from '../types';

interface ChatModerationMenuProps {
  message: Message;
  onMessageDeleted?: (messageId: string) => void;
  onMessagePinned?: (messageId: string, isPinned: boolean) => void;
  chatGroupId: string;
}

export const ChatModerationMenu: React.FC<ChatModerationMenuProps> = ({
  message,
  onMessageDeleted,
  onMessagePinned,
  chatGroupId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const { toast } = useToast();

  // Check if user is already muted
  useEffect(() => {
    const checkMuteStatus = async () => {
      const { data } = await supabase
        .from('chat_muted_users')
        .select('id')
        .eq('chat_group_id', chatGroupId)
        .eq('user_wallet', message.sender_wallet_id.toLowerCase())
        .maybeSingle();

      setIsMuted(!!data);
    };

    checkMuteStatus();
  }, [chatGroupId, message.sender_wallet_id]);

  const handleDelete = async () => {
    if (!confirm('Delete this message? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      // Get access token for API authentication
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('No authentication token available');
      }

      // Call API route to delete message (bypasses RLS)
      const response = await fetch(`/api/chat-messages/${message.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete message');
      }

      toast({
        title: 'Message deleted',
        description: 'The message has been removed from the chat.',
      });

      onMessageDeleted?.(message.id);
      setIsOpen(false);
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMute = async () => {
    if (
      !confirm(
        'Mute this user? They will be unable to send messages in this chat.',
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      // Insert into chat_muted_users table
      const { error } = await supabase.from('chat_muted_users').insert({
        chat_group_id: chatGroupId,
        user_wallet: message.sender_wallet_id.toLowerCase(),
        muted_by: (await supabase.auth.getUser()).data.user?.id,
        muted_until: null, // Permanent mute (can add duration later)
      });

      if (error) throw error;

      setIsMuted(true);

      toast({
        title: 'User muted',
        description: 'This user can no longer send messages in this chat.',
      });

      setIsOpen(false);
    } catch (error: any) {
      console.error('Error muting user:', error);

      // Check for duplicate key error (user already muted)
      if (error.code === '23505') {
        setIsMuted(true);
        toast({
          title: 'Already muted',
          description: 'This user is already muted in this chat.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to mute user. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnmute = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('chat_muted_users')
        .delete()
        .eq('chat_group_id', chatGroupId)
        .eq('user_wallet', message.sender_wallet_id.toLowerCase());

      if (error) throw error;

      setIsMuted(false);

      toast({
        title: 'User unmuted',
        description: 'This user can now send messages in this chat.',
      });

      setIsOpen(false);
    } catch (error) {
      console.error('Error unmuting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to unmute user. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePin = async () => {
    const isPinned = message.is_pinned;

    setIsLoading(true);
    try {
      // If pinning, unpin other messages first (only one pinned message per chat)
      if (!isPinned) {
        await supabase
          .from('chat_messages')
          .update({ is_pinned: false })
          .eq('chat_group_id', chatGroupId);
      }

      // Toggle pin status
      const { error } = await supabase
        .from('chat_messages')
        .update({ is_pinned: !isPinned })
        .eq('id', message.id);

      if (error) throw error;

      toast({
        title: isPinned ? 'Message unpinned' : 'Message pinned',
        description: isPinned
          ? 'The message is no longer pinned.'
          : 'This message is now pinned to the top of the chat.',
      });

      onMessagePinned?.(message.id, !isPinned);
      setIsOpen(false);
    } catch (error) {
      console.error('Error pinning message:', error);
      toast({
        title: 'Error',
        description: 'Failed to update pin status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-moderation-menu">
      <button
        className="moderation-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Moderation options"
        disabled={isLoading}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="moderation-backdrop"
            onClick={() => setIsOpen(false)}
          />

          <div className="moderation-dropdown">
            <button
              className="moderation-option moderation-option-pin"
              onClick={handlePin}
              disabled={isLoading}
            >
              {message.is_pinned ? (
                <>
                  <PinOff className="h-4 w-4" />
                  <span>Unpin Message</span>
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4" />
                  <span>Pin Message</span>
                </>
              )}
            </button>

            {isMuted ? (
              <button
                className="moderation-option moderation-option-unmute"
                onClick={handleUnmute}
                disabled={isLoading}
              >
                <UserCheck className="h-4 w-4" />
                <span>Unmute User</span>
              </button>
            ) : (
              <button
                className="moderation-option moderation-option-mute"
                onClick={handleMute}
                disabled={isLoading}
              >
                <UserX className="h-4 w-4" />
                <span>Mute User</span>
              </button>
            )}

            <button
              className="moderation-option moderation-option-delete"
              onClick={handleDelete}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Message</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
