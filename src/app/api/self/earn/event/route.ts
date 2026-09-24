// src/app/api/self/earn/event/route.ts
// $SELF earn trigger — queue attendance earnings for a completed event.
//
// Called (fire-and-forget) when an event is closed out / completed. Reads the
// event's checked-in attendees (dual attestation: organizer closed the event +
// attendee has checked_in_at) and queues an hour-anchored earning per attendee.
// Idempotent: re-running is a no-op (ledger UNIQUE on registration id).
//
// Auth: CRON_SECRET Bearer OR the internal call from the completion flow. Fails
// CLOSED if CRON_SECRET unset.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getCurrentEpoch,
  queueEventAttendance,
} from '@/features/self/services/selfEarnTriggers';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('Authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // podId MUST be the pods(id) UUID that owns this event's budget. The events
    // table's organizing_pod_id references tokens(id), NOT pods(id), so the
    // caller resolves and passes the correct pod UUID explicitly.
    const { eventId, podId } = await req.json();
    if (!eventId || !podId) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, podId' },
        { status: 400 },
      );
    }

    const epoch = await getCurrentEpoch();
    if (epoch === null) {
      return NextResponse.json(
        { error: 'SelfEpochs not configured (NEXT_PUBLIC_SELF_EPOCHS missing)' },
        { status: 500 },
      );
    }

    // Event window (hour anchor source).
    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('event_date, event_end_date, status')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Checked-in attendees (dual attestation requirement). checked_in_by is
    // stamped by the database from the session that performed the check-in
    // (only the event's organizers may); a check-in without one, or by the
    // attendee themselves, does not earn.
    const { data: allRegs, error: regErr } = await supabase
      .from('event_registrations')
      .select('id, user_address, checked_in_at, checked_in_by')
      .eq('event_id', eventId)
      .not('checked_in_at', 'is', null)
      .not('checked_in_by', 'is', null);
    if (regErr) throw regErr;
    const regs = (allRegs ?? []).filter(
      (r) => r.checked_in_by!.toLowerCase() !== r.user_address.toLowerCase(),
    );
    if (!regs || regs.length === 0) {
      return NextResponse.json({ success: true, queued: 0, message: 'No checked-in attendees' });
    }

    const results = [];
    for (const reg of regs) {
      const r = await queueEventAttendance({
        wallet: reg.user_address,
        podId,
        registrationId: reg.id,
        eventStartISO: event.event_date,
        eventEndISO: event.event_end_date,
        epoch,
      });
      results.push({ wallet: reg.user_address, queued: r.queued, reason: r.reason });
    }

    const queuedCount = results.filter((r) => r.queued).length;
    return NextResponse.json({
      success: true,
      epoch,
      attendees: regs.length,
      queued: queuedCount,
      results,
    });
  } catch (error) {
    console.error('❌ self/earn/event error:', error);
    return NextResponse.json(
      { error: 'Event earn failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
