// src/features/chat/hooks/useVideoCall.ts
//
// Manages the full WebRTC + Supabase signaling lifecycle for a single call session.
// Used by VideoCallModal to orchestrate offer/answer/ICE exchange and media streams.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { VideoChatService, type CallStatus, type SignalingMessage } from '../services/videoChatService';

export type CallRole = 'initiator' | 'recipient';

interface UseVideoCallOptions {
  sessionId: string;
  localWallet: string;
  remoteWallet: string;
  role: CallRole;
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
  onCallEnded,
}: UseVideoCallOptions): UseVideoCallReturn => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('ringing');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDesc = useRef(false);

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // ─── Setup PeerConnection ─────────────────────────────────────────────────

  const setupPeerConnection = useCallback(async (stream: MediaStream) => {
    const pc = VideoChatService.createPeerConnection(
      // onIceCandidate
      async (candidate) => {
        await VideoChatService.sendSignal(
          sessionId,
          localWallet,
          remoteWallet,
          'ice_candidate',
          candidate.toJSON(),
        );
      },
      // onTrack
      (event) => {
        if (event.streams?.[0]) {
          setRemoteStream(event.streams[0]);
        }
      },
      // onConnectionStateChange
      (state) => {
        setConnectionState(state);
        if (state === 'connected') setCallStatus('active');
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          setCallStatus('ended');
          onCallEnded?.();
        }
      },
    );

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pcRef.current = pc;
    return pc;
  }, [sessionId, localWallet, remoteWallet, onCallEnded]);

  // ─── Drain pending ICE candidates after remote desc is set ───────────────

  const drainPendingCandidates = useCallback(async () => {
    if (!pcRef.current || !hasRemoteDesc.current) return;
    for (const c of pendingCandidates.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) {
        // ignore stale candidates
      }
    }
    pendingCandidates.current = [];
  }, []);

  // ─── Handle incoming signaling messages ──────────────────────────────────

  const handleSignal = useCallback(async (msg: SignalingMessage) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (msg.message_type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
      hasRemoteDesc.current = true;
      await drainPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await VideoChatService.sendSignal(
        sessionId, localWallet, remoteWallet, 'answer', answer,
      );
    } else if (msg.message_type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
      hasRemoteDesc.current = true;
      await drainPendingCandidates();
    } else if (msg.message_type === 'ice_candidate') {
      if (hasRemoteDesc.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        } catch (_) { /* ignore */ }
      } else {
        pendingCandidates.current.push(msg.payload);
      }
    }
  }, [sessionId, localWallet, remoteWallet, drainPendingCandidates]);

  // ─── Accept call (recipient) ──────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    await VideoChatService.acceptCall(sessionId);
    setCallStatus('accepted');

    const stream = await VideoChatService.getUserMedia(true, true);
    localStreamRef.current = stream;
    setLocalStream(stream);

    await setupPeerConnection(stream);
    // Initiator will detect 'accepted' status and send the offer
  }, [sessionId, setupPeerConnection]);

  // ─── Start call (initiator, after recipient accepts) ─────────────────────

  const startOffer = useCallback(async () => {
    const stream = await VideoChatService.getUserMedia(true, true);
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = await setupPeerConnection(stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await VideoChatService.sendSignal(
      sessionId, localWallet, remoteWallet, 'offer', offer,
    );
  }, [sessionId, localWallet, remoteWallet, setupPeerConnection]);

  // ─── Decline / End ────────────────────────────────────────────────────────

  const declineCall = useCallback(async () => {
    await VideoChatService.declineCall(sessionId);
    setCallStatus('declined');
    cleanup();
    onCallEnded?.();
  }, [sessionId, cleanup, onCallEnded]);

  const endCall = useCallback(async () => {
    await VideoChatService.endCall(sessionId);
    setCallStatus('ended');
    cleanup();
    onCallEnded?.();
  }, [sessionId, cleanup, onCallEnded]);

  // ─── Media controls ───────────────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsAudioMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoOff((prev) => !prev);
  }, []);

  // ─── Supabase Realtime subscriptions ─────────────────────────────────────

  useEffect(() => {
    // Listen for session status changes (accept/decline/end from other party)
    const sessionSub = supabase
      .channel(`vcs_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_call_sessions',
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          const newStatus = payload.new.status as CallStatus;
          setCallStatus(newStatus);

          if (newStatus === 'accepted' && role === 'initiator') {
            // Recipient accepted — now initiator sends the offer
            await startOffer();
          }

          if (newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed') {
            cleanup();
            onCallEnded?.();
          }
        },
      )
      .subscribe();

    // Listen for incoming signaling messages
    const signalSub = supabase
      .channel(`vcsi_${sessionId}_${localWallet}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_call_signaling',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as SignalingMessage;
          if (msg.to_wallet.toLowerCase() === localWallet.toLowerCase()) {
            handleSignal(msg);
          }
        },
      )
      .subscribe();

    return () => {
      sessionSub.unsubscribe();
      signalSub.unsubscribe();
    };
  }, [sessionId, localWallet, role, startOffer, handleSignal, cleanup, onCallEnded]);

  // Auto-miss if ringing too long (45s)
  useEffect(() => {
    if (callStatus !== 'ringing') return;
    const timer = setTimeout(async () => {
      await VideoChatService.markMissed(sessionId);
      setCallStatus('missed');
      cleanup();
      onCallEnded?.();
    }, 45_000);
    return () => clearTimeout(timer);
  }, [callStatus, sessionId, cleanup, onCallEnded]);

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
