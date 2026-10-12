// src/app/api/conference/token/route.ts
// Generates a signed LiveKit JWT for a participant to join a conference room.
//
// Security model:
// - Verifies the caller's Supabase session token (verifySessionToken)
// - Verifies the requested walletAddress matches the wallet embedded in the JWT
// - Role (host/co_host/speaker/attendee) determines publish permissions
// - LiveKit API secret never leaves the server

import { type NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';
import { isExecutiveLeader, isPodMember } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL        = process.env.LIVEKIT_URL!;

const PUBLISH_ROLES = new Set(['host', 'co_host', 'speaker']);

interface JwtPayload {
  sub: string;
  user_metadata?: { wallet_address?: string };
}

/** Decode and verify the app's custom JWT, return wallet from it. */
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

/**
 * May this wallet join the room? Host and Executive Leaders always; a pod
 * room needs pod membership; an event room needs a live registration, the
 * event's creator/manager, or membership of the organizing pod. Rooms tied
 * to neither (ad-hoc link rooms) stay open to any signed-in member.
 */
async function canJoinRoom(
  room: { host_wallet: string; pod_id: string | null; event_id: string | null },
  wallet: string,
): Promise<boolean> {
  if ((room.host_wallet || '').toLowerCase() === wallet) return true;
  if (!room.pod_id && !room.event_id) return true;

  if (room.pod_id && (await isPodMember(room.pod_id, wallet))) return true;

  if (room.event_id) {
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('creator_address, manager_address, organizing_pod_id')
      .eq('id', room.event_id)
      .maybeSingle();
    if (event) {
      if (
        (event.creator_address || '').toLowerCase() === wallet ||
        (event.manager_address || '').toLowerCase() === wallet
      ) {
        return true;
      }
      const { data: reg } = await supabaseAdmin
        .from('event_registrations')
        .select('id')
        .eq('event_id', room.event_id)
        .ilike('user_address', wallet)
        .neq('registration_status', 'cancelled')
        .limit(1)
        .maybeSingle();
      if (reg) return true;
      if (event.organizing_pod_id && (await isPodMember(event.organizing_pod_id, wallet))) {
        return true;
      }
    }
  }

  return isExecutiveLeader(wallet);
}

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

    // ── 2. Verify JWT and check wallet matches ───────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await verifyAppToken(token);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Use the verified wallet from the JWT as the canonical identity.
    // The body walletAddress is used for room/host lookup but the JWT wallet
    // is what we issue the LiveKit token for.
    const verifiedWallet = decoded.walletAddress.toLowerCase();
    const requestedWallet = walletAddress.toLowerCase();

    // Allow if they match, OR fall back to the JWT wallet if they differ
    // (handles cases where body has smart-account address vs JWT has EOA, etc.)
    const effectiveWallet = requestedWallet === verifiedWallet ? requestedWallet : verifiedWallet;

    // ── 3. Fetch display name from user_profiles (best-effort) ───────────────
    // Use wallet address for lookup — it's already verified from the JWT and
    // avoids user_id mismatches when sessions predate our auth changes.
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name, email')
      .ilike('wallet_address', verifiedWallet)
      .maybeSingle();

    // ── 4. Verify the room exists in our DB ──────────────────────────────────
    const { data: room, error: roomError } = await supabaseAdmin
      .from('conference_rooms')
      .select('id, status, host_wallet, settings, pod_id, event_id')
      .eq('room_name', roomName)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (!(await canJoinRoom(room, effectiveWallet))) {
      return NextResponse.json(
        { error: 'This meeting is for members of its pod or registered attendees of its event' },
        { status: 403 },
      );
    }

    if (room.status === 'ended') {
      return NextResponse.json({ error: 'This meeting has ended' }, { status: 410 });
    }

    // ── 5. Determine effective role ──────────────────────────────────────────
    const isHost = room.host_wallet.toLowerCase() === effectiveWallet;
    const effectiveRole = isHost ? 'host' : role;
    const canPublish = PUBLISH_ROLES.has(effectiveRole);

    // ── 6. Mint LiveKit token ────────────────────────────────────────────────
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    const emailFallback = profile?.email ? profile.email.split('@')[0] : null;
    const displayName = fullName || emailFallback || `${effectiveWallet.slice(0, 6)}…${effectiveWallet.slice(-4)}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: effectiveWallet,
      name: displayName,
      ttl: '4h',
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    // ── 7. Upsert participant record ─────────────────────────────────────────
    await supabaseAdmin
      .from('conference_participants')
      .upsert(
        {
          room_id: room.id,
          wallet_address: effectiveWallet,
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

    console.log(`🎥 Conference token issued: room=${roomName} wallet=${effectiveWallet.slice(0, 8)} role=${effectiveRole}`);

    return NextResponse.json({
      token: await at.toJwt(),
      wsUrl: LIVEKIT_URL,
      role: effectiveRole,
      canPublish,
      identity: effectiveWallet,
    });

  } catch (err) {
    console.error('❌ Conference token error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
