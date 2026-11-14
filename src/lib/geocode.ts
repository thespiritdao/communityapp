// src/lib/geocode.ts
// Server-only Nominatim (OpenStreetMap) forward geocoding, shared by
// /api/geocode (address search for the Places editor and Identity) and
// /api/account/location (server-side geocode when a member saves an
// address). Nominatim asks for a descriptive User-Agent and ~1 req/s;
// at pod scale that is fine. Never call this from the browser: CSP does
// not allow the host, and the UA header is required.

import { APP_NAME } from '@/config/deployment';
import { geocodeContactEmail } from '@/config/deployment.server';
export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy requires an identifying user agent with a contact.
const userAgent = () => `${APP_NAME} Community App (${geocodeContactEmail()})`;
const MAX_QUERY = 200;

export function normalizeGeocodeQuery(q: unknown): string {
  return typeof q === 'string' ? q.trim().slice(0, MAX_QUERY) : '';
}

/**
 * Forward-geocode free text. Returns up to `limit` results (default 5).
 * Throws on upstream failure so callers can map it to a 502.
 */
export async function geocode(
  query: string,
  opts: { limit?: number; acceptLanguage?: string | null } = {},
): Promise<GeocodeResult[]> {
  const q = normalizeGeocodeQuery(query);
  if (!q) return [];

  const url = new URL(NOMINATIM);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(Math.min(Math.max(opts.limit ?? 5, 1), 10)));
  url.searchParams.set('q', q);

  const headers: Record<string, string> = { 'User-Agent': userAgent() };
  if (opts.acceptLanguage) headers['Accept-Language'] = opts.acceptLanguage;

  const res = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Nominatim responded ${res.status}`);
  }
  const rows = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  const out: GeocodeResult[] = [];
  for (const r of rows ?? []) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!r.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ label: r.display_name, lat, lng });
  }
  return out;
}

/** Round to ~1 km so an "approximate" location never stores an exact point. */
export function coarsen(value: number): number {
  return Math.round(value * 100) / 100;
}
