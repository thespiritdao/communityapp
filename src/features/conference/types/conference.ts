// src/features/conference/types/conference.ts

export type ConferenceRoomStatus = 'scheduled' | 'live' | 'ended';

export type ParticipantRole = 'host' | 'co_host' | 'speaker' | 'attendee';

export type ReactionEmoji = 'clap' | 'heart' | 'laugh' | 'wow' | 'raise_hand';

export interface ConferenceRoomSettings {
  maxParticipants: number;
  recordingEnabled: boolean;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  attendeesCanUnmute: boolean;
}

export interface ConferenceRoom {
  id: string;
  room_name: string;
  display_name: string;
  status: ConferenceRoomStatus;
  host_wallet: string;
  event_id: string | null;
  pod_id: string | null;
  settings: ConferenceRoomSettings;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConferenceParticipant {
  id: string;
  room_id: string;
  wallet_address: string;
  role: ParticipantRole;
  can_publish: boolean;
  hand_raised: boolean;
  hand_raised_at: string | null;
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
}

export interface ConferenceReaction {
  id: string;
  room_id: string;
  sender_wallet: string;
  emoji: ReactionEmoji;
  sent_at: string;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface TokenResponse {
  token: string;
  wsUrl: string;
  role: ParticipantRole;
  canPublish: boolean;
  /** Canonical wallet identity used by the server (from JWT, not EVM address) */
  identity: string;
}

export interface RoomWithCount {
  room: ConferenceRoom;
  participantCount: number;
}

// ── Client-side create options ────────────────────────────────────────────────

export interface CreateRoomOptions {
  displayName: string;
  eventId?: string;
  podId?: string;
  settings?: Partial<ConferenceRoomSettings>;
}

// ── Floating reaction (ephemeral, client-side only) ───────────────────────────

export interface FloatingReaction {
  id: string;           // local uuid for React key
  emoji: ReactionEmoji;
  senderWallet: string;
  x: number;            // random horizontal position 10–90%
  spawnedAt: number;    // Date.now() — used to remove after animation
}
