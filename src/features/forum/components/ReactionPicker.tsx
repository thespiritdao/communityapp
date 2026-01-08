// src/features/forum/components/ReactionPicker.tsx

'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  getReactionSummary,
  toggleReaction,
  AVAILABLE_REACTIONS,
  type ReactionSummary,
} from '../services/ReactionService';
import { Button } from '@/components/ui/button';

interface ReactionPickerProps {
  postId?: string;
  threadId?: string;
  onReactionChange?: () => void;
}

export function ReactionPicker({
  postId,
  threadId,
  onReactionChange,
}: ReactionPickerProps) {
  const { evmAddress: address } = useEvmAddress();
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReactions();
  }, [postId, threadId, address]);

  const loadReactions = async () => {
    setIsLoading(true);
    try {
      const result = await getReactionSummary(postId, threadId, address || undefined);
      if (result.success && result.reactions) {
        setReactions(result.reactions);
      }
    } catch (error) {
      console.error('Error loading reactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!address) {
      alert('Please connect your wallet to react');
      return;
    }

    try {
      const result = await toggleReaction(emoji, address, postId, threadId);
      if (result.success) {
        await loadReactions();
        onReactionChange?.();
        setShowPicker(false);
      } else {
        console.error('Failed to toggle reaction:', result.error);
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Existing reactions */}
      {reactions.map((reaction) => (
        <button
          key={reaction.reaction_type}
          onClick={() => handleReaction(reaction.reaction_type)}
          className={`
            px-2 py-1 rounded-full text-sm border transition-all
            ${
              reaction.userReacted
                ? ''
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
            }
          `}
          style={
            reaction.userReacted
              ? { backgroundColor: '#E8F1EE', borderColor: '#2F5D50' }
              : undefined
          }
        >
          <span>{reaction.reaction_type}</span>
          <span className="ml-1 text-xs font-medium">{reaction.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPicker(!showPicker)}
          className="text-gray-500 hover:text-gray-700"
        >
          😊 +
        </Button>

        {/* Reaction picker dropdown */}
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-lg p-2 flex gap-1 z-10">
            {AVAILABLE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Close picker when clicking outside */}
      {showPicker && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
