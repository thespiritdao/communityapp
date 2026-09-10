// src/app/api/pods/[id]/places/[placeId]/image/route.ts
//   POST multipart/form-data { file } — set the pin's cover image.
// Stored in the PRIVATE bucket `place-images`; served only as short-lived
// signed URLs from the places GET route, so members-only stays members-only.
// Gate: pod leader OR placesManage grantee OR Exec Leader.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requirePlacesManager, PLACES_BUCKET, PLACES_SIGNED_URL_TTL } from '@/lib/placesGuard';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; placeId: string }> };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: podId, placeId } = await ctx.params;
  if (!podId || !placeId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });

  const walletOrDenied = await requirePlacesManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const { data: place } = await supabaseAdmin
    .from('pod_places')
    .select('id, pod_id, cover_image_path')
    .eq('id', placeId)
    .maybeSingle();
  if (!place || place.pod_id !== podId) {
    return NextResponse.json({ error: 'Place not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 5 MB or smaller' }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG or WebP images are allowed' }, { status: 400 });

  const path = `${podId}/${placeId}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage
    .from(PLACES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: dbErr } = await supabaseAdmin
    .from('pod_places')
    .update({ cover_image_path: path, updated_by: wallet })
    .eq('id', placeId);
  if (dbErr) {
    await supabaseAdmin.storage.from(PLACES_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  if (place.cover_image_path && place.cover_image_path !== path) {
    await supabaseAdmin.storage.from(PLACES_BUCKET).remove([place.cover_image_path]).catch(() => {});
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(PLACES_BUCKET)
    .createSignedUrl(path, PLACES_SIGNED_URL_TTL);

  return NextResponse.json({ cover_image_path: path, cover_image_url: signed?.signedUrl ?? null });
}
