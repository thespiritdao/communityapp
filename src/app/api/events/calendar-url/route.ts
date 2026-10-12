// GET /api/events/calendar-url — returns the caller's signed .ics feed URL.
// Calendar apps can't send auth headers, so the feed carries an HMAC `sig`
// minted here for the authenticated wallet only.

import { type NextRequest, NextResponse } from 'next/server';
import { requireWallet } from '@/lib/apiPodGuard';
import { signCalendarFeed } from '@/lib/calendarFeedToken';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const url = new URL('/api/events/calendar.ics', req.nextUrl.origin);
  url.searchParams.set('wallet', wallet);
  url.searchParams.set('sig', signCalendarFeed(wallet));
  return NextResponse.json({ url: url.toString() });
}
