// src/features/conference/hooks/useReactions.ts
//
// Manages floating emoji reactions for a conference room.
// Reactions are delivered via Supabase Realtime Broadcast (zero DB latency).
// Each received reaction is assigned a random X position and removed after
// the CSS animation completes (~2.5s).

import { useState, useEffect, useCallback, useRef } from 'react';
import { broadcastReaction, subscribeToReactions } from '../services/conferenceService';
import type { FloatingReaction, ReactionEmoji } from '../types/conference';

const REACTION_LIFETIME_MS = 2600; // slightly longer than the 2.5s CSS animation

// Rate-limit: one reaction per user per 800ms to prevent spam
const SEND_COOLDOWN_MS = 800;

interface UseReactionsReturn {
  floatingReactions: FloatingReaction[];
  sendReaction: (emoji: ReactionEmoji) => void;
}

export function useReactions(roomName: string, senderWallet: string): UseReactionsReturn {
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const lastSentAt = useRef<number>(0);

  // ── Spawn a reaction locally (used for both received and own reactions) ───
  const spawnReaction = useCallback((emoji: ReactionEmoji, senderWallet: string) => {
    const reaction: FloatingReaction = {
      id: crypto.randomUUID(),
      emoji,
      senderWallet,
      x: 10 + Math.random() * 80,   // 10–90% horizontal position
      spawnedAt: Date.now(),
    };

    setFloatingReactions(prev => [...prev, reaction]);

    // Auto-remove after animation completes
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== reaction.id));
    }, REACTION_LIFETIME_MS);
  }, []);

  // ── Subscribe to reactions from other participants ────────────────────────
  useEffect(() => {
    if (!roomName) return;
    const unsub = subscribeToReactions(roomName, (emoji, wallet) => {
      spawnReaction(emoji, wallet);
    });
    return unsub;
  }, [roomName, spawnReaction]);

  // ── Send a reaction (rate-limited) ───────────────────────────────────────
  const sendReaction = useCallback((emoji: ReactionEmoji) => {
    const now = Date.now();
    if (now - lastSentAt.current < SEND_COOLDOWN_MS) return;
    lastSentAt.current = now;

    // Optimistically show own reaction immediately
    spawnReaction(emoji, senderWallet);

    // Broadcast to others (fire and forget)
    broadcastReaction(roomName, senderWallet, emoji).catch(console.error);
  }, [roomName, senderWallet, spawnReaction]);

  return { floatingReactions, sendReaction };
}
