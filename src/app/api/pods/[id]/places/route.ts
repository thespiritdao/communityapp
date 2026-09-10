// src/app/api/pods/[id]/places/route.ts
//
// Places add-on (pod shared map). Members-only.
//   GET   — the pod's pins, links, opted-in member locations, and whether the
//           caller may manage. Any active member (or Exec Leader).
//   POST  — add a pin. Pod leader OR placesManage grantee OR Exec Leader.
//   PATCH — section settings (label, default centre). Same gate as POST.
// Spec: docs/spec-pod-places-and-journal.md

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requirePodMember } from '@/lib/apiPodGuard';
import { requirePlacesManager, canManagePlaces, getPlacesModule } from '@/lib/placesGuard';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import {
  normalisePlaceInput,
  loadPlace,
  signCovers,
  resolveLinkTitles,
} from '@/features/places/server/placesServer';
import type { PlaceLink, PodPlace, MemberPin } from '@/features/places/types';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id: podId } = await ctx.params;
  if (!podId) return bad('Missing pod ID');

  const walletOrDenied = await requirePodMember(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const { enabled, config } = await getPlacesModule(podId);
  if (!enabled) {
    return NextResponse.json({
      enabled: false, label: 'Places', defaultCenter: null, places: [], members: [], canManage: false,
    });
  }

  const [{ data: rows }, manage] = await Promise.all([
    supabaseAdmin.from('pod_places').select('*').eq('pod_id', podId).order('created_at', { ascending: false }),
    canManagePlaces(podId, wallet),
  ]);
  const places = (rows ?? []) as PodPlace[];
  const ids = places.map((p) => p.id);

  const { data: linkRows } = ids.length
    ? await supabaseAdmin.from('pod_place_links').select('*').in('place_id', ids)
    : { data: [] as (PlaceLink & { place_id: string })[] };

  const placesById = new Map(places.map((p) => [p.id, p.title]));
  const allLinks = (linkRows ?? []) as (PlaceLink & { place_id: string })[];
  await resolveLinkTitles(allLinks, placesById);
  const linksByPlace = new Map<string, PlaceLink[]>();
  for (const l of allLinks) {
    const arr = linksByPlace.get(l.place_id) ?? [];
    arr.push(l);
    linksByPlace.set(l.place_id, arr);
  }

  const covers = await signCovers(places.map((p) => p.cover_image_path).filter(Boolean) as string[]);
  for (const p of places) {
    p.links = linksByPlace.get(p.id) ?? [];
    p.cover_image_url = p.cover_image_path ? covers.get(p.cover_image_path) ?? null : null;
  }

  // Opted-in member locations for this pod's active members. Never returns
  // email or any profile field beyond name + avatar.
  const { data: memberRows } = await supabaseAdmin
    .from('pod_members')
    .select('wallet')
    .eq('pod_id', podId)
    .eq('is_active', true);
  const wallets = [...new Set((memberRows ?? []).map((m) => String(m.wallet).toLowerCase()))];
  let members: MemberPin[] = [];
  if (wallets.length) {
    const { data: locs } = await supabaseAdmin
      .from('member_locations')
      .select('wallet, lat, lng, precision')
      .in('wallet', wallets)
      .eq('share_with_pods', true);
    const locWallets = (locs ?? []).map((l) => l.wallet);
    const { data: profiles } = locWallets.length
      ? await supabaseAdmin
          .from('user_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .in('wallet_address', locWallets)
      : { data: [] as { wallet_address: string; first_name: string | null; last_name: string | null; profile_picture: string | null }[] };
    const profByWallet = new Map((profiles ?? []).map((p) => [String(p.wallet_address).toLowerCase(), p]));
    members = (locs ?? []).map((l) => {
      const p = profByWallet.get(String(l.wallet).toLowerCase());
      return {
        wallet: l.wallet,
        name: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || `${String(l.wallet).slice(0, 6)}…`,
        avatar: p?.profile_picture ?? null,
        lat: Number(l.lat),
        lng: Number(l.lng),
        precision: (l.precision === 'exact' ? 'exact' : 'approximate') as MemberPin['precision'],
      };
    });
  }

  return NextResponse.json({
    enabled: true,
    label: (config.label && String(config.label).trim().slice(0, 20)) || 'Places',
    defaultCenter: config.default_center ?? null,
    places,
    members,
    canManage: manage,
  });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: podId } = await ctx.params;
  if (!podId) return bad('Missing pod ID');

  const walletOrDenied = await requirePlacesManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const { enabled } = await getPlacesModule(podId);
  if (!enabled) return bad('Places module is not enabled for this pod');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON');
  }
  const parsed = normalisePlaceInput(body);
  if ('error' in parsed) return bad(parsed.error);

  const { data: place, error } = await supabaseAdmin
    .from('pod_places')
    .insert({ ...parsed.row, pod_id: podId, created_by: wallet, updated_by: wallet })
    .select('*')
    .single();
  if (error || !place) return bad(error?.message ?? 'Insert failed', 500);

  if (parsed.links?.length) {
    await supabaseAdmin
      .from('pod_place_links')
      .insert(parsed.links.map((l) => ({ ...l, place_id: place.id })));
  }

  recordExplorerEvent({
    type: 'place_added',
    title: `New place on the map: ${place.title}`,
    actor: wallet,
    pod_id: podId,
    url: `/pods/${podId}#places`,
    metadata: { place_id: place.id, kind: place.kind, status: place.status },
    dedupe_key: `place_added:${place.id}`,
  }).catch((err) => console.warn('[places] explorer event failed:', err));

  return NextResponse.json({ place: await loadPlace(place.id) }, { status: 201 });
}

// ── PATCH (section settings) ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: podId } = await ctx.params;
  if (!podId) return bad('Missing pod ID');

  const walletOrDenied = await requirePlacesManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON');
  }

  const { config } = await getPlacesModule(podId);
  const next = { ...config };
  if ('label' in body) {
    const label = String(body.label ?? '').trim();
    if (label.length > 20) return bad('Label must be 20 characters or fewer');
    if ([...label].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return bad('Label contains invalid characters');
    if (label) next.label = label;
    else delete next.label;
  }
  if ('default_center' in body) {
    const c = body.default_center as { lat?: unknown; lng?: unknown; zoom?: unknown } | null;
    if (c == null) {
      delete next.default_center;
    } else {
      const lat = Number(c.lat), lng = Number(c.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return bad('Invalid default centre');
      }
      const zoom = c.zoom == null ? undefined : Math.min(20, Math.max(1, Number(c.zoom)));
      next.default_center = { lat, lng, ...(zoom != null && !Number.isNaN(zoom) ? { zoom } : {}) };
    }
  }

  const { error } = await supabaseAdmin
    .from('pod_modules')
    .update({ places_config: next })
    .eq('pod_id', podId);
  if (error) return bad(error.message, 500);

  return NextResponse.json({ success: true, config: next });
}
