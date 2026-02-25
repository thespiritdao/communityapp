// src/features/conference/hooks/useConferenceRoom.ts
//
// Core hook for joining and participating in a LiveKit conference room.
// Handles token fetch, LiveKit connection state, and participant lifecycle.
// The LiveKit Room object manages all WebRTC internally — no manual
// offer/answer/ICE needed (unlike the 1:1 useVideoCall hook).

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  Participant,
  Track,
  ConnectionState,
  VideoPresets,
  createLocalTracks,
  type LocalTrack,
} from 'livekit-client';
import {
  getJoinToken,
  leaveRoom,
  startRoom,
  subscribeToParticipants,
} from '../services/conferenceService';
import type {
  ConferenceRoom,
  ConferenceParticipant,
  ParticipantRole,
  TokenResponse,
} from '../types/conference';

export interface UseConferenceRoomOptions {
  room: ConferenceRoom;
  walletAddress: string;
  /** Requested role — server will override to 'host' if you are the host wallet */
  requestedRole?: ParticipantRole;
  onMeetingEnded?: () => void;
}

export interface UseConferenceRoomReturn {
  // Connection
  connectionState: ConnectionState;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;

  // LiveKit objects
  livekitRoom: Room | null;
  localParticipant: LocalParticipant | null;
  remoteParticipants: RemoteParticipant[];
  dominantSpeaker: Participant | null;

  // Granted role (server may upgrade/downgrade the requested role)
  role: ParticipantRole;
  canPublish: boolean;

  // DB participants (for host panel / raise-hand queue)
  dbParticipants: ConferenceParticipant[];

  // Media controls
  isAudioMuted: boolean;
  isVideoOff: boolean;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;

  // Room actions
  join: () => Promise<void>;
  leave: () => Promise<void>;
}

export function useConferenceRoom({
  room,
  walletAddress,
  requestedRole = 'attendee',
  onMeetingEnded,
}: UseConferenceRoomOptions): UseConferenceRoomReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [livekitRoom, setLivekitRoom] = useState<Room | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [dominantSpeaker, setDominantSpeaker] = useState<Participant | null>(null);

  const [role, setRole] = useState<ParticipantRole>(requestedRole);
  const [canPublish, setCanPublish] = useState(false);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const [dbParticipants, setDbParticipants] = useState<ConferenceParticipant[]>([]);

  const livekitRoomRef = useRef<Room | null>(null);
  const tokenRef = useRef<TokenResponse | null>(null);
  const onMeetingEndedRef = useRef(onMeetingEnded);
  useEffect(() => { onMeetingEndedRef.current = onMeetingEnded; }, [onMeetingEnded]);

  // Stable refs for join() so it never changes identity due to prop changes
  const roomRef = useRef(room);
  const walletAddressRef = useRef(walletAddress);
  const requestedRoleRef = useRef(requestedRole);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);
  useEffect(() => { requestedRoleRef.current = requestedRole; }, [requestedRole]);

  // ── DB participant subscription ──────────────────────────────────────────
  // room.id is a stable primitive — subscribe once on mount.
  const roomId = room.id;
  useEffect(() => {
    const unsub = subscribeToParticipants(roomId, setDbParticipants);
    return unsub;
  }, [roomId]);

  // ── Sync remote participants from LiveKit room ────────────────────────────
  const syncRemoteParticipants = useCallback((lkRoom: Room) => {
    setRemoteParticipants(Array.from(lkRoom.remoteParticipants.values()));
  }, []);

  // ── Join ─────────────────────────────────────────────────────────────────
  const join = useCallback(async () => {
    if (isConnecting || connectionState === ConnectionState.Connected) return;
    setIsConnecting(true);
    setError(null);

    // Read current values from refs so this callback never needs to be
    // recreated when room/walletAddress/requestedRole change identity.
    const currentRoom = roomRef.current;
    const currentWallet = walletAddressRef.current;
    const currentRole = requestedRoleRef.current;

    try {
      // 1. Fetch LiveKit token from our API
      const tokenResponse = await getJoinToken(currentRoom.room_name, currentWallet, currentRole);
      tokenRef.current = tokenResponse;
      setRole(tokenResponse.role);
      setCanPublish(tokenResponse.canPublish);

      // 2. Create LiveKit Room instance
      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true,          // simulcast — sends multiple quality layers
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [
            VideoPresets.h180,
            VideoPresets.h360,
            VideoPresets.h720,
          ],
        },
      });
      livekitRoomRef.current = lkRoom;
      setLivekitRoom(lkRoom);

      // 3. Wire up LiveKit events
      lkRoom
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
          if (state === ConnectionState.Connected) {
            setLocalParticipant(lkRoom.localParticipant);
            syncRemoteParticipants(lkRoom);
          }
        })
        .on(RoomEvent.ParticipantConnected, () => syncRemoteParticipants(lkRoom))
        .on(RoomEvent.ParticipantDisconnected, () => syncRemoteParticipants(lkRoom))
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          // Dominant speaker = first non-local speaker, or local if they're the only one
          const remote = speakers.find(s => s !== lkRoom.localParticipant);
          setDominantSpeaker(remote ?? speakers[0] ?? null);
        })
        .on(RoomEvent.TrackSubscribed, () => syncRemoteParticipants(lkRoom))
        .on(RoomEvent.TrackUnsubscribed, () => syncRemoteParticipants(lkRoom))
        .on(RoomEvent.Disconnected, () => {
          setConnectionState(ConnectionState.Disconnected);
          setRemoteParticipants([]);
          setDominantSpeaker(null);
          onMeetingEndedRef.current?.();
        })
        .on(RoomEvent.RoomMetadataChanged, (metadata: string) => {
          // Host sets metadata to 'ended' when ending the meeting
          try {
            const parsed = JSON.parse(metadata);
            if (parsed?.status === 'ended') onMeetingEndedRef.current?.();
          } catch { /* ignore malformed metadata */ }
        })
        // Local participant permission changes (host promotes/demotes)
        .on(RoomEvent.LocalTrackPublished, () => {
          setCanPublish(true);
        });

      // 4. Connect to LiveKit
      await lkRoom.connect(tokenResponse.wsUrl, tokenResponse.token);

      // 5. Publish local tracks if permitted
      if (tokenResponse.canPublish) {
        const tracks = await createLocalTracks({ audio: true, video: true });
        for (const track of tracks) {
          await lkRoom.localParticipant.publishTrack(track as LocalTrack);
          if (track.kind === Track.Kind.Audio) setIsAudioMuted(false);
          if (track.kind === Track.Kind.Video) setIsVideoOff(false);
        }
      }

      // 6. If host is starting the meeting, mark room as live
      if (tokenResponse.role === 'host' && currentRoom.status === 'scheduled') {
        await startRoom(currentRoom.id);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join room';
      console.error('❌ Conference join error:', err);
      setError(msg);
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
      setLivekitRoom(null);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, connectionState, syncRemoteParticipants]);

  // ── Leave ────────────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    const lkRoom = livekitRoomRef.current;
    if (lkRoom) {
      lkRoom.disconnect();
      livekitRoomRef.current = null;
      setLivekitRoom(null);
    }
    await leaveRoom(roomRef.current.id, walletAddressRef.current).catch(console.error);
    setConnectionState(ConnectionState.Disconnected);
    setRemoteParticipants([]);
    setDominantSpeaker(null);
  }, []);

  // ── Media controls ───────────────────────────────────────────────────────
  const toggleAudio = useCallback(async () => {
    const lkRoom = livekitRoomRef.current;
    if (!lkRoom) return;
    const enabled = lkRoom.localParticipant.isMicrophoneEnabled;
    await lkRoom.localParticipant.setMicrophoneEnabled(!enabled);
    setIsAudioMuted(enabled); // if it was enabled, it's now muted
  }, []);

  const toggleVideo = useCallback(async () => {
    const lkRoom = livekitRoomRef.current;
    if (!lkRoom) return;
    const enabled = lkRoom.localParticipant.isCameraEnabled;
    await lkRoom.localParticipant.setCameraEnabled(!enabled);
    setIsVideoOff(enabled);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
    };
  }, []);

  return {
    connectionState,
    isConnecting,
    isConnected: connectionState === ConnectionState.Connected,
    error,
    livekitRoom,
    localParticipant,
    remoteParticipants,
    dominantSpeaker,
    role,
    canPublish,
    dbParticipants,
    isAudioMuted,
    isVideoOff,
    toggleAudio,
    toggleVideo,
    join,
    leave,
  };
}
