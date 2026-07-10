// src/features/chat/services/videoChatService.ts
//
// Manages video call session lifecycle and WebRTC signaling via Supabase.
// No third-party video SDK — pure WebRTC with Supabase Realtime as the signaling channel.

import { supabase } from '@/utils/supabaseClient';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'active'
  | 'declined'
  | 'ended'
  | 'missed';

export interface VideoCallSession {
  id: string;
  initiator_wallet: string;
  recipient_wallet: string;
  status: CallStatus;
  is_group: boolean;
  group_participants?: string[];
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface SignalingMessage {
  id: string;
  session_id: string;
  from_wallet: string;
  to_wallet: string;
  message_type: 'offer' | 'answer' | 'ice_candidate';
  payload: any;
  created_at: string;
}

// STUN finds the peers' public addresses; TURN relays media when a direct path
// is impossible (symmetric NAT, restrictive corporate/mobile networks — ~10-20%
// of connections). Without TURN those 1:1 calls silently fail to connect.
//
// TURN is added only when configured via env. NOTE: these must be a TURN
// server's OWN long-term credentials (e.g. coturn, or LiveKit's embedded TURN
// with its turn: block enabled on the host) — NOT the LiveKit API key/secret.
// Provide NEXT_PUBLIC_TURN_URL plus username/credential to activate it.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL.split(',').map((u) => u.trim()),
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        } as RTCIceServer,
      ]
    : []),
];

export class VideoChatService {
  // ─── Session Management ──────────────────────────────────────────────────

  static async initiateCall(
    initiatorWallet: string,
    recipientWallet: string,
    initiatorName: string,
  ): Promise<VideoCallSession> {
    const { data, error } = await supabase
      .from('video_call_sessions')
      .insert({
        initiator_wallet: initiatorWallet.toLowerCase(),
        recipient_wallet: recipientWallet.toLowerCase(),
        status: 'ringing',
        is_group: false,
      })
      .select()
      .single();

    if (error) throw error;

    // Broadcast via Supabase Realtime for instant delivery (no DB-write latency)
    supabase
      .channel(`call:${recipientWallet.toLowerCase()}`)
      .send({
        type: 'broadcast',
        event: 'incoming_call',
        payload: data,
      })
      .catch((err) => console.warn('Video call broadcast failed (non-fatal):', err));

    // Also notify via persistent notification (non-fatal)
    unifiedNotificationService.createNotification({
      recipient_address: recipientWallet.toLowerCase(),
      sender_address: initiatorWallet.toLowerCase(),
      notification_type: 'video_call_requested',
      title: 'Incoming Video Call',
      message: `${initiatorName} is calling you`,
      context_type: 'chat',
      context_id: data.id,
      context_url: `/chat/video/${data.id}`,
      priority: 'urgent',
    }).catch((err) => console.warn('Video call notification failed (non-fatal):', err));

    return data as VideoCallSession;
  }

  static async acceptCall(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('video_call_sessions')
      .update({ status: 'accepted', started_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async declineCall(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('video_call_sessions')
      .update({ status: 'declined', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async endCall(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('video_call_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async markMissed(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('video_call_sessions')
      .update({ status: 'missed', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async getSession(sessionId: string): Promise<VideoCallSession | null> {
    const { data, error } = await supabase
      .from('video_call_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) return null;
    return data as VideoCallSession;
  }

  // ─── Signaling ───────────────────────────────────────────────────────────

  static async sendSignal(
    sessionId: string,
    fromWallet: string,
    toWallet: string,
    messageType: 'offer' | 'answer' | 'ice_candidate',
    payload: any,
  ): Promise<void> {
    const { error } = await supabase.from('video_call_signaling').insert({
      session_id: sessionId,
      from_wallet: fromWallet.toLowerCase(),
      to_wallet: toWallet.toLowerCase(),
      message_type: messageType,
      payload,
    });

    if (error) throw error;
  }

  // ─── WebRTC Helpers ──────────────────────────────────────────────────────

  static createPeerConnection(
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack: (event: RTCTrackEvent) => void,
    onConnectionStateChange: (state: RTCPeerConnectionState) => void,
  ): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate(event.candidate);
    };

    pc.ontrack = onTrack;

    pc.onconnectionstatechange = () => {
      onConnectionStateChange(pc.connectionState);
    };

    return pc;
  }

  static async getUserMedia(video: boolean, audio: boolean): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ video, audio });
  }
}
