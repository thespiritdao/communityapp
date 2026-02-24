// src/app/api/conference/rooms/route.ts
// POST — Create a new conference room (and create it in LiveKit)
// GET  — Fetch room info by roomName or eventId

import { type NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.LIVEKIT_URL!;

function getRoomServiceClient() {
  return new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

// ── GET /api/conference/rooms?roomName=... or ?eventId=... ────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomName = searchParams.get('roomName');
    const eventId  = searchParams.get('eventId');

    if (!roomName && !eventId) {
      return NextResponse.json({ error: 'roomName or eventId required' }, { status: 400 });
    }

    const query = supabaseAdmin
      .from('conference_rooms')
      .select(`
        id, room_name, display_name, status, host_wallet,
        settings, started_at, ended_at, created_at,
        event_id, pod_id
      `);

    if (roomName) query.eq('room_name', roomName);
    else if (eventId) query.eq('event_id', eventId).order('created_at', { ascending: false }).limit(1);

    const { data: room, error } = await query.single();

    if (error || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Fetch live participant count
    const { count } = await supabaseAdmin
      .from('conference_participants')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('is_active', true);

    return NextResponse.json({ room, participantCount: count ?? 0 });
  } catch (err) {
    console.error('❌ GET /api/conference/rooms error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST /api/conference/rooms ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ error: 'Conference service not configured' }, { status: 503 });
    }

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address, username')
      .eq('user_id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const {
      displayName,
      eventId,
      podId,
      settings = {},
    } = body ?? {};

    if (!displayName) {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }

    const walletAddress = profile.wallet_address.toLowerCase();

    // ── 3. Generate unique room name ─────────────────────────────────────────
    const shortId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const roomName = eventId
      ? `event_${eventId.replace(/-/g, '').slice(0, 12)}_${shortId}`
      : `room_${shortId}`;

    // ── 4. Create room in LiveKit ────────────────────────────────────────────
    const roomService = getRoomServiceClient();
    await roomService.createRoom({
      name: roomName,
      maxParticipants: settings.maxParticipants ?? 200,
      emptyTimeout: 300,          // auto-close after 5 min empty
      metadata: JSON.stringify({ displayName, hostWallet: walletAddress }),
    });

    // ── 5. Persist to DB ─────────────────────────────────────────────────────
    const mergedSettings = {
      maxParticipants: 200,
      recordingEnabled: false,
      chatEnabled: true,
      reactionsEnabled: true,
      attendeesCanUnmute: false,
      ...settings,
    };

    const { data: room, error: insertError } = await supabaseAdmin
      .from('conference_rooms')
      .insert({
        room_name: roomName,
        display_name: displayName,
        status: 'scheduled',
        host_wallet: walletAddress,
        event_id: eventId ?? null,
        pod_id: podId ?? null,
        settings: mergedSettings,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert conference room:', insertError);
      // Clean up LiveKit room if DB insert failed
      await roomService.deleteRoom(roomName).catch(() => {});
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
    }

    // ── 6. Add host as first participant ─────────────────────────────────────
    await supabaseAdmin.from('conference_participants').insert({
      room_id: room.id,
      wallet_address: walletAddress,
      role: 'host',
      can_publish: true,
      is_active: false,     // not yet joined — becomes true when token is fetched
    });

    console.log(`🎥 Conference room created: ${roomName} by ${walletAddress.slice(0, 8)}`);

    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    console.error('❌ POST /api/conference/rooms error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
