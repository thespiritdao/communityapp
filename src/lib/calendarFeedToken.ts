/**
 * Signed per-user calendar feed URLs.
 *
 * Calendar apps subscribe to a URL and cannot send auth headers, so the
 * .ics feed is authorised by an HMAC of the wallet instead. Same key
 * derivation as eventQrToken (EVENT_QR_SECRET or the service-role key),
 * with its own domain-separation label. Rotating the base secret
 * invalidates every outstanding feed URL.
 *
 * Server-side ONLY.
 */

import { createHmac, timingSafeEqual } from 'crypto';

function signingKey(): Buffer {
  const base = process.env.EVENT_QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('No server secret available for calendar feed signing');
  return createHmac('sha256', base).update('spiritdao:calendar-feed:v1').digest();
}

export function signCalendarFeed(wallet: string): string {
  return createHmac('sha256', signingKey())
    .update(wallet.toLowerCase())
    .digest('base64url');
}

export function verifyCalendarFeed(wallet: string, sig: string | null | undefined): boolean {
  if (!wallet || !sig) return false;
  const expected = Buffer.from(signCalendarFeed(wallet), 'base64url');
  const given = Buffer.from(sig, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
