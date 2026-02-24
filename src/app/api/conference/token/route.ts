// src/app/api/conference/token/route.ts
// Generates a signed LiveKit JWT for a participant to join a conference room.
//
// Security model:
// - Requires a valid Supabase session (auth.getUser via service role)
// - Verifies the requested walletAddress matches the authenticated user's profile
// - Role (host/co_host/speaker/attendee) determines publish permissions
// - LiveKit API secret never leaves the server

import { type NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.LIVEKIT_URL!;

// Roles that are allowed to publish audio/video
const PUBLISH_ROLES = new Set(['host', 'co_host', 'speaker']);

export async function POST(req: NextRequest) {
  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      console.error('❌ LiveKit environment variables not configured');
      return NextResponse.json({ error: 'Conference service not configured' }, { status: 503 });
    }

    // ── 1. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const { roomName, walletAddress, role = 'attendee' } = body ?? {};

    if (!roomName || !walletAddress) {
      return NextResponse.json(
        { error: 'roomName and walletAddress are required' },
        { status: 400 },
      );
    }

    if (!['host', 'co_host', 'speaker', 'attendee'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // ── 2. Authenticate caller via Supabase session cookie ───────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 3. Verify wallet belongs to this user ────────────────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address, username, avatar_url')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (profile.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Wallet address mismatch' }, { status: 403 });
    }

    // ── 4. Verify the room exists in our DB ──────────────────────────────────
    const { data: room, error: roomError } = await supabaseAdmin
      .from('conference_rooms')
      .select('id, status, host_wallet, settings')
      .eq('room_name', roomName)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.status === 'ended') {
      return NextResponse.json({ error: 'This meeting has ended' }, { status: 410 });
    }

    // ── 5. Determine effective role ──────────────────────────────────────────
    // If requester is the host, always grant host role regardless of what was sent
    const isHost = room.host_wallet.toLowerCase() === walletAddress.toLowerCase();
    const effectiveRole = isHost ? 'host' : role;
    const canPublish = PUBLISH_ROLES.has(effectiveRole);

    // ── 6. Mint LiveKit token ────────────────────────────────────────────────
    const displayName = profile.username ?? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: walletAddress.toLowerCase(),
      name: displayName,
      ttl: '4h',
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,   // needed for reactions + chat data messages
    });

    // ── 7. Upsert participant record ─────────────────────────────────────────
    // Mark them as active in the DB so host can see who's in the room
    await supabaseAdmin
      .from('conference_participants')
      .upsert(
        {
          room_id: room.id,
          wallet_address: walletAddress.toLowerCase(),
          role: effectiveRole,
          can_publish: canPublish,
          is_active: true,
          joined_at: new Date().toISOString(),
          left_at: null,
        },
        {
          onConflict: 'room_id,wallet_address,left_at',
          ignoreDuplicates: false,
        },
      );

    console.log(`🎥 Conference token issued: room=${roomName} wallet=${walletAddress.slice(0,8)} role=${effectiveRole}`);

    return NextResponse.json({
      token: await at.toJwt(),
      wsUrl: LIVEKIT_URL,
      role: effectiveRole,
      canPublish,
    });

  } catch (err) {
    console.error('❌ Conference token error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
