import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyCalendarFeed } from '@/lib/calendarFeedToken';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function escapeIcs(str: string): string {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcsDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * GET /api/events/calendar.ics?wallet=0x...&sig=...
 *
 * Returns an iCalendar (.ics) feed of the user's registered events.
 * Can be subscribed to in Google Calendar, Apple Calendar, Outlook, etc.
 * `sig` is an HMAC of the wallet (src/lib/calendarFeedToken.ts); obtain the
 * full signed URL from the authenticated GET /api/events/calendar-url.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet')?.toLowerCase();

  if (!wallet) {
    return new NextResponse('wallet parameter required', { status: 400 });
  }

  // Privacy: without a valid signature anyone could read any member's
  // registrations (and the events' locations) from just their wallet.
  if (!verifyCalendarFeed(wallet, searchParams.get('sig'))) {
    return new NextResponse('Invalid or missing calendar signature', { status: 403 });
  }

  // Fetch user's registrations
  const { data: registrations, error: regError } = await supabase
    .from('event_registrations')
    .select('event_id, registration_status')
    .eq('user_address', wallet)
    .not('registration_status', 'eq', 'cancelled');

  if (regError) {
    return new NextResponse('Failed to fetch registrations', { status: 500 });
  }

  if (!registrations || registrations.length === 0) {
    // Return empty calendar
    const empty = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SpiritDAO//Community Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:SpiritDAO Events',
      'END:VCALENDAR',
    ].join('\r\n');

    return new NextResponse(empty, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="spiritdao-events.ics"',
      },
    });
  }

  const eventIds = registrations.map((r) => r.event_id);

  // Fetch event details
  const { data: events, error: evError } = await supabase
    .from('events')
    .select('id, title, description, event_date, event_end_date, location, organizing_pod_id')
    .in('id', eventIds)
    .not('status', 'eq', 'cancelled');

  if (evError) {
    return new NextResponse('Failed to fetch events', { status: 500 });
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SpiritDAO//Community Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SpiritDAO Events',
    'X-WR-CALDESC:Your registered SpiritDAO community events',
  ];

  for (const event of events || []) {
    const start = toIcsDate(event.event_date);
    // Default duration 2 hours if no end date
    const endDate = event.event_end_date
      ? new Date(event.event_end_date)
      : new Date(new Date(event.event_date).getTime() + 2 * 60 * 60 * 1000);
    const end = toIcsDate(endDate.toISOString());

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@spiritdao`);
    lines.push(`DTSTAMP:${toIcsDate(new Date().toISOString())}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeIcs(event.title)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcs(event.description.substring(0, 500))}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcs(event.location)}`);
    }
    lines.push(`URL:${process.env.NEXT_PUBLIC_APP_URL || 'https://app.spiritdao.org'}/events/${event.id}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const icsContent = lines.join('\r\n');

  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="spiritdao-events.ics"',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
