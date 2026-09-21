// src/app/api/geocode/route.ts
// GET /api/geocode?q=<text> — members-only forward geocoding proxy.
// Response: { results: Array<{ label: string; lat: number; lng: number }> }
// Consumed by the Places editor and Identity → Location. Keep the shape.

import { type NextRequest, NextResponse } from 'next/server';
import { requireWallet } from '@/lib/apiPodGuard';
import { geocode, normalizeGeocodeQuery } from '@/lib/geocode';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  const q = normalizeGeocodeQuery(req.nextUrl.searchParams.get('q'));
  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = await geocode(q, {
      limit: 5,
      acceptLanguage: req.headers.get('accept-language'),
    });
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Geocoding failed';
    console.warn('[geocode] upstream error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
