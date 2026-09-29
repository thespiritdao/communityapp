/**
 * POST /api/events/[id]/qr/verify   { token }
 *
 * Organizer-only. Verifies a scanned check-in token: server signature,
 * expiry, this event, and that the registration still belongs to the wallet
 * the token was issued for. Returns the registration to check in; the
 * check-in itself stays on the existing organizer-only RLS path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { verifyEventQrToken } from '@/lib/eventQrToken';
import { callerWallets, isEventOrganizer } from '@/lib/eventQrAccess';

export const runtime = 'nodejs';

const REASONS = {
  format: 'Not a SpiritDAO check-in code',
  signature: 'This check-in code was not issued by SpiritDAO',
  expired: 'This check-in code has expired. Ask the attendee to reopen the event page for a fresh one.',
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  if (!(await isEventOrganizer(eventId, await callerWallets(walletOrDenied)))) {
    return NextResponse.json({ error: 'Only this event\'s organizers can check people in' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = verifyEventQrToken(String(body?.token ?? ''));
  if (!result.ok) {
    return NextResponse.json({ valid: false, error: REASONS[result.reason] }, { status: 400 });
  }
  const { r: registrationId, e, w: wallet } = result.payload;
  if (e !== eventId) {
    return NextResponse.json({ valid: false, error: 'This check-in code is for a different event' }, { status: 400 });
  }

  const { data: registration } = await supabaseAdmin
    .from('event_registrations')
    .select('id, event_id, user_address')
    .eq('id', registrationId)
    .maybeSingle();
  if (
    !registration ||
    registration.event_id !== eventId ||
    String(registration.user_address).toLowerCase() !== wallet
  ) {
    return NextResponse.json({ valid: false, error: 'Registration not found for this code' }, { status: 400 });
  }

  return NextResponse.json({ valid: true, registrationId, wallet });
}
