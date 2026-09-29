/**
 * POST /api/events/[id]/qr   { registrationId }
 *
 * Issues a server-signed check-in QR token for a registration. Allowed for
 * the registration's owner (any of their wallets) or an event organizer,
 * who can print codes for attendees from the check-in page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { EVENT_QR_TTL_MS, signEventQrToken } from '@/lib/eventQrToken';
import { callerWallets, isEventOrganizer } from '@/lib/eventQrAccess';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  const body = await request.json().catch(() => null);
  const registrationId = typeof body?.registrationId === 'string' ? body.registrationId : '';
  if (!registrationId) {
    return NextResponse.json({ error: 'registrationId is required' }, { status: 400 });
  }

  const { data: registration } = await supabaseAdmin
    .from('event_registrations')
    .select('id, event_id, user_address')
    .eq('id', registrationId)
    .maybeSingle();
  if (!registration || registration.event_id !== eventId) {
    return NextResponse.json({ error: 'Registration not found for this event' }, { status: 404 });
  }

  const wallets = await callerWallets(walletOrDenied);
  const owner = String(registration.user_address).toLowerCase();
  if (!wallets.includes(owner) && !(await isEventOrganizer(eventId, wallets))) {
    return NextResponse.json({ error: 'Not your registration' }, { status: 403 });
  }

  const expiresAt = Date.now() + EVENT_QR_TTL_MS;
  const token = signEventQrToken({ r: registration.id, e: eventId, w: owner, x: expiresAt });
  return NextResponse.json({ token, expiresAt });
}
