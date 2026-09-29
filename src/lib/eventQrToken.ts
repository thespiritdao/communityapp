/**
 * Server-signed event check-in QR tokens.
 *
 * The check-in QR used to carry a "signature" that was base64 of public
 * fields, so anyone could mint one for any registration. Tokens are now
 * HMAC-SHA256 signed by the server and verified by the server at scan time.
 *
 * Format: `sdq1.<base64url(json payload)>.<base64url(hmac)>`
 * Payload: { r: registrationId, e: eventId, w: wallet (lowercase), x: expiry ms }
 *
 * Key: EVENT_QR_SECRET if set, otherwise derived from the service-role key
 * with a domain-separation label. Rotating either invalidates outstanding
 * codes, which expire within a day anyway.
 *
 * Server-side ONLY.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const PREFIX = 'sdq1';
export const EVENT_QR_TTL_MS = 24 * 60 * 60 * 1000;

export interface EventQrPayload {
  r: string;
  e: string;
  w: string;
  x: number;
}

function signingKey(): Buffer {
  const base = process.env.EVENT_QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('No server secret available for event QR signing');
  return createHmac('sha256', base).update('spiritdao:event-qr:v1').digest();
}

function mac(body: string): Buffer {
  return createHmac('sha256', signingKey()).update(`${PREFIX}.${body}`).digest();
}

export function signEventQrToken(payload: EventQrPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${PREFIX}.${body}.${mac(body).toString('base64url')}`;
}

export type EventQrVerification =
  | { ok: true; payload: EventQrPayload }
  | { ok: false; reason: 'format' | 'signature' | 'expired' };

export function verifyEventQrToken(token: string, now = Date.now()): EventQrVerification {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'format' };
  const [, body, sig] = parts;

  const expected = mac(body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'signature' };
  }

  let payload: EventQrPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!payload?.r || !payload?.e || !payload?.w || typeof payload.x !== 'number') {
    return { ok: false, reason: 'format' };
  }
  if (now > payload.x) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
