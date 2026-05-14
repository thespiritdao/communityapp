// src/features/conference/services/conferenceService.ts
//
// Client-side service for conference room DB operations.
// All privileged mutations (token generation, host actions) go through
// the API routes — this service handles read operations and participant
// state that the authenticated client can write directly via RLS.

import { supabase } from '@/utils/supabaseClient';
import type {
  ConferenceRoom,
  ConferenceParticipant,
  ConferenceReaction,
  CreateRoomOptions,
  TokenResponse,
  RoomWithCount,
  ReactionEmoji,
} from '../types/conference';

// ── Helper: get the current session token for API route auth ─────────────────
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

// =============================================================================
// Room management
// =============================================================================

/**
 * Create a new conference room (via server API — creates in LiveKit + DB).
 */
export async function createConferenceRoom(options: CreateRoomOptions): Promise<ConferenceRoom> {
  const { room } = await apiPost<{ room: ConferenceRoom }>(
    '/api/conference/rooms',
    options,
  );
  return room;
}

/**
 * Fetch room info + live participant count by roomName.
 */
export async function getRoomByName(roomName: string): Promise<RoomWithCount> {
  return apiGet<RoomWithCount>(`/api/conference/rooms?roomName=${encodeURIComponent(roomName)}`);
}

/**
 * Fetch the most recent room for an event (returns null if none exists yet).
 */
export async function getRoomByEventId(eventId: string): Promise<RoomWithCount | null> {
  try {
    return await apiGet<RoomWithCount>(`/api/conference/rooms?eventId=${encodeURIComponent(eventId)}`);
  } catch {
    return null;
  }
}

/**
 * Fetch the most recent active/scheduled room for a pod (returns null if none).
 */
export async function getRoomByPodId(podId: string): Promise<RoomWithCount | null> {
  try {
    return await apiGet<RoomWithCount>(`/api/conference/rooms?podId=${encodeURIComponent(podId)}`);
  } catch {
    return null;
  }
}

/**
 * Mark a room as live (called by host when they officially start the meeting).
 * Uses the RLS policy — only the host wallet can update their room.
 */
export async function startRoom(roomId: string): Promise<void> {
  const { error } = await supabase
    .from('conference_rooms')
    .update({ status: 'live', started_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) throw new Error(error.message);
}

// =============================================================================
// Token
// =============================================================================

/**
 * Fetch a LiveKit JWT for the current user to join a room.
 * The API route verifies identity and returns role + canPublish.
 */
export async function getJoinToken(
  roomName: string,
  walletAddress: string,
  role: 'host' | 'co_host' | 'speaker' | 'attendee' = 'attendee',
): Promise<TokenResponse> {
  return apiPost<TokenResponse>('/api/conference/token', {
    roomName,
    walletAddress,
    role,
  });
}

// =============================================================================
// Participants
// =============================================================================

/**
 * Fetch all active participants in a room.
 */
export async function getActiveParticipants(roomId: string): Promise<ConferenceParticipant[]> {
  const { data, error } = await supabase
    .from('conference_participants')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Mark the current user as having left the room.
 */
export async function leaveRoom(roomId: string, walletAddress: string): Promise<void> {
  const { error } = await supabase
    .from('conference_participants')
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('is_active', true);
  if (error) throw new Error(error.message);
}

/**
 * Toggle raise hand for the current user.
 */
export async function setHandRaised(
  roomId: string,
  walletAddress: string,
  raised: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('conference_participants')
    .update({ hand_raised: raised })
    .eq('room_id', roomId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('is_active', true);
  if (error) throw new Error(error.message);
}

// =============================================================================
// Host actions (all go through server API)
// =============================================================================

type HostActionType =
  | 'mute_participant'
  | 'promote_to_speaker'
  | 'demote_to_attendee'
  | 'remove_participant'
  | 'end_meeting';

async function hostAction(
  roomName: string,
  action: HostActionType,
  targetWallet?: string,
): Promise<void> {
  await apiPost('/api/conference/host-action', { roomName, action, targetWallet });
}

export const conferenceHostActions = {
  muteParticipant:   (roomName: string, targetWallet: string) => hostAction(roomName, 'mute_participant', targetWallet),
  promoteToSpeaker:  (roomName: string, targetWallet: string) => hostAction(roomName, 'promote_to_speaker', targetWallet),
  demoteToAttendee:  (roomName: string, targetWallet: string) => hostAction(roomName, 'demote_to_attendee', targetWallet),
  removeParticipant: (roomName: string, targetWallet: string) => hostAction(roomName, 'remove_participant', targetWallet),
  endMeeting:        (roomName: string)                       => hostAction(roomName, 'end_meeting'),
};

// =============================================================================
// Reactions (Supabase Realtime Broadcast — zero DB writes for animation)
// =============================================================================

const REACTION_CHANNEL_PREFIX = 'conference:reactions:';

/**
 * Broadcast a reaction emoji to all room participants via Realtime.
 * No DB write — purely ephemeral. The DB insert is optional (analytics).
 */
export async function broadcastReaction(
  roomName: string,
  senderWallet: string,
  emoji: ReactionEmoji,
): Promise<void> {
  const channel = supabase.channel(`${REACTION_CHANNEL_PREFIX}${roomName}`);
  await channel.send({
    type: 'broadcast',
    event: 'reaction',
    payload: { emoji, senderWallet, sentAt: Date.now() },
  });
}

/**
 * Subscribe to reactions for a room.
 * Returns an unsubscribe function.
 */
export function subscribeToReactions(
  roomName: string,
  onReaction: (emoji: ReactionEmoji, senderWallet: string) => void,
): () => void {
  const channel = supabase
    .channel(`${REACTION_CHANNEL_PREFIX}${roomName}`)
    .on('broadcast', { event: 'reaction' }, ({ payload }) => {
      if (payload?.emoji && payload?.senderWallet) {
        onReaction(payload.emoji as ReactionEmoji, payload.senderWallet as string);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =============================================================================
// Realtime participant presence
// =============================================================================

/**
 * Subscribe to live changes in conference_participants for a room.
 * Useful for the host panel to see who joins/leaves in real time.
 * Returns an unsubscribe function.
 */
export function subscribeToParticipants(
  roomId: string,
  onChange: (participants: ConferenceParticipant[]) => void,
): () => void {
  // Initial fetch
  getActiveParticipants(roomId).then(onChange).catch(console.error);

  const channel = supabase
    .channel(`conference:participants:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conference_participants',
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        // Re-fetch on any change (insert/update/delete)
        getActiveParticipants(roomId).then(onChange).catch(console.error);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
