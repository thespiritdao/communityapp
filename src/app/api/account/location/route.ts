// src/app/api/account/location/route.ts
// A member's opt-in location, shared only with the pods they belong to
// (member_locations table; see migration 20260910000002). The wallet is
// always the session wallet — never taken from the body.
//
//   GET    → { location: MemberLocation | null }
//   PUT    { address?, lat?, lng?, precision?, share_with_pods? }
//          → { location: MemberLocation }
//   DELETE → { success: true }
//
// "approximate" (default) stores coordinates rounded to ~1 km so an exact
// point never persists unless the member explicitly chooses "exact".

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { geocode, coarsen } from '@/lib/geocode';

export const runtime = 'nodejs';

type Precision = 'exact' | 'approximate';

export interface MemberLocation {
  wallet: string;
  lat: number;
  lng: number;
  precision: Precision;
  address: string | null;
  share_with_pods: boolean;
  updated_at: string;
}

const SELECT = 'wallet, lat, lng, precision, address, share_with_pods, updated_at';

export async function GET(req: NextRequest) {
  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const { data, error } = await supabaseAdmin
    .from('member_locations')
    .select(SELECT)
    .eq('wallet', wallet)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: (data as MemberLocation | null) ?? null });
}

export async function PUT(req: NextRequest) {
  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  let body: {
    address?: unknown;
    lat?: unknown;
    lng?: unknown;
    precision?: unknown;
    share_with_pods?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const precision: Precision = body.precision === 'exact' ? 'exact' : 'approximate';
  const shareWithPods = body.share_with_pods === undefined ? true : Boolean(body.share_with_pods);
  const address =
    typeof body.address === 'string' && body.address.trim()
      ? body.address.trim().slice(0, 300)
      : null;

  let lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  let lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  let resolvedAddress = address;

  if ((lat === null || lng === null) && address) {
    try {
      const [hit] = await geocode(address, {
        limit: 1,
        acceptLanguage: req.headers.get('accept-language'),
      });
      if (!hit) {
        return NextResponse.json(
          { error: 'Could not find that address. Try a more specific search.' },
          { status: 422 },
        );
      }
      lat = hit.lat;
      lng = hit.lng;
      resolvedAddress = resolvedAddress ?? hit.label;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Geocoding failed';
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: 'Provide either lat/lng or an address' },
      { status: 400 },
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  if (precision === 'approximate') {
    lat = coarsen(lat);
    lng = coarsen(lng);
  }

  const { data, error } = await supabaseAdmin
    .from('member_locations')
    .upsert(
      {
        wallet,
        lat,
        lng,
        precision,
        address: resolvedAddress,
        share_with_pods: shareWithPods,
      },
      { onConflict: 'wallet' },
    )
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data as MemberLocation });
}

export async function DELETE(req: NextRequest) {
  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const { error } = await supabaseAdmin
    .from('member_locations')
    .delete()
    .eq('wallet', wallet);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
