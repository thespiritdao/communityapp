// src/app/api/conference/host-action/route.ts
// Executes host/co-host privileged actions on a LiveKit room.
// All mutations go through the server-side RoomServiceClient so the
// LiveKit API secret is never exposed to the client.
//
// Supported actions:
//   mute_participant    — force-mute a specific participant's audio track
//   promote_to_speaker  — grant canPublish (attendee → speaker)
//   demote_to_attendee  — revoke canPublish (speaker → attendee)
//   remove_participant  — kick from room
//   end_meeting         — end meeting for all participants

import { type NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.LIVEKIT_URL!;
const JWT_SECRET         = process.env.SUPABASE_JWT_SECRET!;

interface JwtPayload {
  sub: string;
  user_metadata?: { wallet_address?: string };
}

async function verifyAppToken(token: string): Promise<{ userId: string; walletAddress: string } | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as JwtPayload;
    const walletAddress = payload?.user_metadata?.wallet_address;
    if (!payload.sub || !walletAddress) return null;
    return { userId: payload.sub, walletAddress };
  } catch {
    return null;
  }
}

type HostActionType =
  | 'mute_participant'
  | 'promote_to_speaker'
  | 'demote_to_attendee'
  | 'remove_participant'
  | 'end_meeting';

export async function POST(req: NextRequest) {
  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ error: 'Conference service not configured' }, { status: 503 });
    }

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await verifyAppToken(token);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerWallet = decoded.walletAddress.toLowerCase();

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const { roomName, action, targetWallet } = body ?? {} as {
      roomName: string;
      action: HostActionType;
      targetWallet?: string;
    };

    if (!roomName || !action) {
      return NextResponse.json({ error: 'roomName and action are required' }, { status: 400 });
    }

    const validActions: HostActionType[] = [
      'mute_participant', 'promote_to_speaker', 'demote_to_attendee',
      'remove_participant', 'end_meeting',
    ];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // ── 3. Verify caller is host or co_host ──────────────────────────────────
    const { data: room } = await supabaseAdmin
      .from('conference_rooms')
      .select('id, status, host_wallet')
      .eq('room_name', roomName)
      .single();

    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.status === 'ended') return NextResponse.json({ error: 'Meeting has ended' }, { status: 410 });

    const isHost = room.host_wallet.toLowerCase() === callerWallet;

    if (!isHost) {
      // Check co_host
      const { data: callerParticipant } = await supabaseAdmin
        .from('conference_participants')
        .select('role')
        .eq('room_id', room.id)
        .eq('wallet_address', callerWallet)
        .eq('is_active', true)
        .single();

      if (!callerParticipant || callerParticipant.role !== 'co_host') {
        return NextResponse.json({ error: 'Forbidden — host or co_host required' }, { status: 403 });
      }

      // Co-hosts cannot end the meeting or remove participants
      if (action === 'end_meeting' || action === 'remove_participant') {
        return NextResponse.json({ error: 'Forbidden — host only action' }, { status: 403 });
      }
    }

    // ── 4. Execute action ────────────────────────────────────────────────────
    const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    switch (action) {
      case 'mute_participant': {
        if (!targetWallet) return NextResponse.json({ error: 'targetWallet required' }, { status: 400 });
        // Mute all published audio tracks for this participant
        const participants = await roomService.listParticipants(roomName);
        const target = participants.find(p => p.identity === targetWallet.toLowerCase());
        if (target) {
          for (const track of target.tracks) {
            if (track.source === TrackSource.MICROPHONE) {
              await roomService.mutePublishedTrack(roomName, target.identity, track.sid, true);
            }
          }
        }
        break;
      }

      case 'promote_to_speaker': {
        if (!targetWallet) return NextResponse.json({ error: 'targetWallet required' }, { status: 400 });
        await roomService.updateParticipant(roomName, targetWallet.toLowerCase(), undefined, {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        });
        await supabaseAdmin
          .from('conference_participants')
          .update({ role: 'speaker', can_publish: true, hand_raised: false })
          .eq('room_id', room.id)
          .eq('wallet_address', targetWallet.toLowerCase());
        break;
      }

      case 'demote_to_attendee': {
        if (!targetWallet) return NextResponse.json({ error: 'targetWallet required' }, { status: 400 });
        await roomService.updateParticipant(roomName, targetWallet.toLowerCase(), undefined, {
          canPublish: false,
          canSubscribe: true,
          canPublishData: true,
        });
        await supabaseAdmin
          .from('conference_participants')
          .update({ role: 'attendee', can_publish: false })
          .eq('room_id', room.id)
          .eq('wallet_address', targetWallet.toLowerCase());
        break;
      }

      case 'remove_participant': {
        if (!targetWallet) return NextResponse.json({ error: 'targetWallet required' }, { status: 400 });
        // Cannot remove yourself or another host
        if (targetWallet.toLowerCase() === callerWallet) {
          return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
        }
        await roomService.removeParticipant(roomName, targetWallet.toLowerCase());
        await supabaseAdmin
          .from('conference_participants')
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .eq('wallet_address', targetWallet.toLowerCase());
        break;
      }

      case 'end_meeting': {
        // Delete the LiveKit room (disconnects all participants)
        await roomService.deleteRoom(roomName);
        // Update DB room status
        await supabaseAdmin
          .from('conference_rooms')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', room.id);
        // Mark all participants as inactive
        await supabaseAdmin
          .from('conference_participants')
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .eq('is_active', true);
        console.log(`🔴 Conference ended: ${roomName} by host ${callerWallet.slice(0, 8)}`);
        break;
      }
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error('❌ Host action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
