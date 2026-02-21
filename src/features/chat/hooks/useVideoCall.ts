// src/features/chat/hooks/useVideoCall.ts
//
// WebRTC + Supabase Broadcast signaling lifecycle for a single call session.
// All signaling (offer/answer/ICE/accepted) delivered via Broadcast channel
// so there is no postgres_changes latency and no missed-event race conditions.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { VideoChatService, type CallStatus } from '../services/videoChatService';

export type CallRole = 'initiator' | 'recipient';

interface UseVideoCallOptions {
  sessionId: string;
  localWallet: string;
  remoteWallet: string;
  role: CallRole;
  initialStatus?: CallStatus;
  onCallEnded?: () => void;
}

export interface UseVideoCallReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callStatus: CallStatus;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  connectionState: RTCPeerConnectionState | null;
  toggleAudio: () => void;
  toggleVideo: () => void;
  endCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
}

export const useVideoCall = ({
  sessionId,
  localWallet,
  remoteWallet,
  role,
  initialStatus,
  onCallEnded,
}: UseVideoCallOptions): UseVideoCallReturn => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>(initialStatus ?? 'ringing');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDesc = useRef(false);
  const onCallEndedRef = useRef(onCallEnded);
  useEffect(() => { onCallEndedRef.current = onCallEnded; }, [onCallEnded]);

  // Broadcast channel shared by both sides for this session
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const broadcast = useCallback((event: string, payload: unknown) => {
    signalingChannelRef.current?.send({
      type: 'broadcast',
      event,
      payload,
    });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // ─── Drain pending ICE candidates ────────────────────────────────────────

  const drainPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !hasRemoteDesc.current) return;
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { /* ignore */ }
    }
    pendingCandidates.current = [];
  }, []);

  // ─── Setup PeerConnection ─────────────────────────────────────────────────

  const setupPeerConnection = useCallback((stream: MediaStream): RTCPeerConnection => {
    const pc = VideoChatService.createPeerConnection(
      (candidate) => {
        broadcast('ice_candidate', { from: localWallet, payload: candidate.toJSON() });
        // Also persist for logging (non-blocking)
        VideoChatService.sendSignal(sessionId, localWallet, remoteWallet, 'ice_candidate', candidate.toJSON())
          .catch(() => {});
      },
      (event) => {
        if (event.streams?.[0]) setRemoteStream(event.streams[0]);
      },
      (state) => {
        setConnectionState(state);
        if (state === 'connected') setCallStatus('active');
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          setCallStatus('ended');
          onCallEndedRef.current?.();
        }
      },
    );
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pcRef.current = pc;
    return pc;
  }, [sessionId, localWallet, remoteWallet, broadcast]);

  // ─── Initiator: send offer after recipient accepts ────────────────────────

  const startOffer = useCallback(async () => {
    const stream = await VideoChatService.getUserMedia(true, true);
    localStreamRef.current = stream;
    setLocalStream(stream);
    const pc = setupPeerConnection(stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    broadcast('offer', { from: localWallet, payload: offer });
    // Persist for logging
    VideoChatService.sendSignal(sessionId, localWallet, remoteWallet, 'offer', offer).catch(() => {});
  }, [sessionId, localWallet, remoteWallet, setupPeerConnection, broadcast]);

  // Keep a stable ref so the subscription closure can call the latest version
  const startOfferRef = useRef(startOffer);
  useEffect(() => { startOfferRef.current = startOffer; }, [startOffer]);

  // ─── Handle incoming signal ───────────────────────────────────────────────

  const handleSignal = useCallback(async (type: string, payload: unknown) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      hasRemoteDesc.current = true;
      await drainPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      broadcast('answer', { from: localWallet, payload: answer });
      VideoChatService.sendSignal(sessionId, localWallet, remoteWallet, 'answer', answer).catch(() => {});
    } else if (type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      hasRemoteDesc.current = true;
      await drainPendingCandidates();
    } else if (type === 'ice_candidate') {
      const candidate = payload as RTCIceCandidateInit;
      if (hasRemoteDesc.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) { /* ignore */ }
      } else {
        pendingCandidates.current.push(candidate);
      }
    }
  }, [sessionId, localWallet, remoteWallet, broadcast, drainPendingCandidates]);

  const handleSignalRef = useRef(handleSignal);
  useEffect(() => { handleSignalRef.current = handleSignal; }, [handleSignal]);

  // ─── Accept call (recipient, when using in-modal accept button) ───────────

  const acceptCall = useCallback(async () => {
    await VideoChatService.acceptCall(sessionId);
    broadcast('accepted', { from: localWallet });
    setCallStatus('accepted');
    const stream = await VideoChatService.getUserMedia(true, true);
    localStreamRef.current = stream;
    setLocalStream(stream);
    setupPeerConnection(stream);
  }, [sessionId, localWallet, setupPeerConnection, broadcast]);

  // ─── Decline / End ────────────────────────────────────────────────────────

  const declineCall = useCallback(async () => {
    await VideoChatService.declineCall(sessionId);
    broadcast('ended', { from: localWallet });
    setCallStatus('declined');
    cleanup();
    onCallEndedRef.current?.();
  }, [sessionId, localWallet, cleanup, broadcast]);

  const endCall = useCallback(async () => {
    await VideoChatService.endCall(sessionId);
    broadcast('ended', { from: localWallet });
    setCallStatus('ended');
    cleanup();
    onCallEndedRef.current?.();
  }, [sessionId, localWallet, cleanup, broadcast]);

  // ─── Media controls ───────────────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsAudioMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsVideoOff((prev) => !prev);
  }, []);

  // ─── Broadcast subscription (set up once on mount) ───────────────────────

  useEffect(() => {
    const channel = supabase.channel(`signal:${sessionId}`);
    signalingChannelRef.current = channel;

    channel
      // Recipient accepted — initiator now sends offer
      .on('broadcast', { event: 'accepted' }, () => {
        if (role === 'initiator') {
          setCallStatus('accepted');
          startOfferRef.current();
        }
      })
      // Initiator sent offer — recipient processes it
      .on('broadcast', { event: 'offer' }, ({ payload }) => {
        if (role === 'recipient') {
          handleSignalRef.current('offer', payload.payload);
        }
      })
      // Recipient sent answer — initiator processes it
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (role === 'initiator') {
          handleSignalRef.current('answer', payload.payload);
        }
      })
      // ICE candidates — both sides process (ignore own messages via from field)
      .on('broadcast', { event: 'ice_candidate' }, ({ payload }) => {
        if (payload.from !== localWallet) {
          handleSignalRef.current('ice_candidate', payload.payload);
        }
      })
      // Remote party ended or declined
      .on('broadcast', { event: 'ended' }, ({ payload }) => {
        if (payload.from !== localWallet) {
          setCallStatus('ended');
          cleanup();
          onCallEndedRef.current?.();
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      signalingChannelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, localWallet, role]); // stable — never re-subscribes

  // ─── Auto-setup recipient media when modal opens already accepted ─────────

  useEffect(() => {
    if (role === 'recipient' && initialStatus === 'accepted') {
      const setup = async () => {
        const stream = await VideoChatService.getUserMedia(true, true);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setupPeerConnection(stream);
        // Broadcast "accepted" so the initiator sends the offer
        // (in case they subscribed before the banner's acceptCall DB write resolved)
        broadcast('accepted', { from: localWallet });
      };
      setup().catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ─── Auto-miss timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (callStatus !== 'ringing') return;
    const timer = setTimeout(async () => {
      await VideoChatService.markMissed(sessionId);
      setCallStatus('missed');
      cleanup();
      onCallEndedRef.current?.();
    }, 45_000);
    return () => clearTimeout(timer);
  }, [callStatus, sessionId, cleanup]);

  return {
    localStream,
    remoteStream,
    callStatus,
    isAudioMuted,
    isVideoOff,
    connectionState,
    toggleAudio,
    toggleVideo,
    endCall,
    acceptCall,
    declineCall,
  };
};
