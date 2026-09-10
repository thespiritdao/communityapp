// src/app/api/pods/[id]/places/[placeId]/route.ts
//   PUT    — edit a pin (fields + optional full replacement of links)
//   DELETE — remove a pin (cascades links; removes its cover image)
// Gate: pod leader OR placesManage grantee OR Exec Leader.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requirePlacesManager, PLACES_BUCKET } from '@/lib/placesGuard';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { normalisePlaceInput, loadPlace } from '@/features/places/server/placesServer';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; placeId: string }> };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function ownedPlace(podId: string, placeId: string) {
  const { data } = await supabaseAdmin
    .from('pod_places')
    .select('id, pod_id, title, cover_image_path')
    .eq('id', placeId)
    .maybeSingle();
  if (!data || data.pod_id !== podId) return null;
  return data;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id: podId, placeId } = await ctx.params;
  if (!podId || !placeId) return bad('Missing ids');

  const walletOrDenied = await requirePlacesManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const existing = await ownedPlace(podId, placeId);
  if (!existing) return bad('Place not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON');
  }
  const parsed = normalisePlaceInput(body, true);
  if ('error' in parsed) return bad(parsed.error);

  if (Object.keys(parsed.row).length) {
    const { error } = await supabaseAdmin
      .from('pod_places')
      .update({ ...parsed.row, updated_by: wallet })
      .eq('id', placeId);
    if (error) return bad(error.message, 500);
  }

  if (parsed.links) {
    await supabaseAdmin.from('pod_place_links').delete().eq('place_id', placeId);
    if (parsed.links.length) {
      await supabaseAdmin
        .from('pod_place_links')
        .insert(parsed.links.map((l) => ({ ...l, place_id: placeId })));
    }
  }

  const place = await loadPlace(placeId);
  recordExplorerEvent({
    type: 'place_updated',
    title: `Place updated: ${place?.title ?? existing.title}`,
    actor: wallet,
    pod_id: podId,
    url: `/pods/${podId}#places`,
    metadata: { place_id: placeId },
  }).catch((err) => console.warn('[places] explorer event failed:', err));

  return NextResponse.json({ place });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id: podId, placeId } = await ctx.params;
  if (!podId || !placeId) return bad('Missing ids');

  const walletOrDenied = await requirePlacesManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const existing = await ownedPlace(podId, placeId);
  if (!existing) return bad('Place not found', 404);

  const { error } = await supabaseAdmin.from('pod_places').delete().eq('id', placeId);
  if (error) return bad(error.message, 500);

  if (existing.cover_image_path) {
    await supabaseAdmin.storage.from(PLACES_BUCKET).remove([existing.cover_image_path]).catch(() => {});
  }

  recordExplorerEvent({
    type: 'place_removed',
    title: `Place removed: ${existing.title}`,
    actor: wallet,
    pod_id: podId,
    url: `/pods/${podId}#places`,
    metadata: { place_id: placeId },
  }).catch((err) => console.warn('[places] explorer event failed:', err));

  return NextResponse.json({ success: true });
}
