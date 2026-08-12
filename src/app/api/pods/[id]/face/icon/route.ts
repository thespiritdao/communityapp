// src/app/api/pods/[id]/face/icon/route.ts
// POST a custom icon for one face slot (docs/spec-pod-faces.md — pods using
// their own iconography). Multipart form: `slot` + `file`. Uploads to the
// public `pod-faces` storage bucket under the pod's folder and returns the
// public URL; the client then writes {type:'upload', value:url} into the
// face's icon_map and saves via the normal face PUT (which verifies the URL
// belongs to this pod).
//
// Same guard as all face writes: leader OR appearanceManage OR exec.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireFaceManager } from '@/lib/faceGuard';
import {
  FACE_ICON_SLOTS,
  FACE_ICON_UPLOAD,
} from '@/features/pods/faces/faceConfig';

export const runtime = 'nodejs';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/face\/icon/);
  return match?.[1] ?? '';
}

/** The bucket is created lazily on first upload (public read; writes only
 *  come through this route via the service key). */
async function ensureBucket(): Promise<void> {
  const { data } = await supabaseAdmin.storage.getBucket(FACE_ICON_UPLOAD.bucket);
  if (data) return;
  await supabaseAdmin.storage.createBucket(FACE_ICON_UPLOAD.bucket, {
    public: true,
    fileSizeLimit: FACE_ICON_UPLOAD.maxBytes,
    allowedMimeTypes: [...FACE_ICON_UPLOAD.allowedTypes],
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = await requireFaceManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;

  const form = await req.formData();
  const slot = form.get('slot');
  const file = form.get('file');

  if (typeof slot !== 'string' || !(FACE_ICON_SLOTS as readonly string[]).includes(slot)) {
    return NextResponse.json({ error: `Unknown icon slot: ${String(slot)}` }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (!(FACE_ICON_UPLOAD.allowedTypes as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. PNG, JPEG, or WebP only.' },
      { status: 400 },
    );
  }
  if (file.size > FACE_ICON_UPLOAD.maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum is ${Math.round(FACE_ICON_UPLOAD.maxBytes / 1024)}KB.` },
      { status: 400 },
    );
  }

  await ensureBucket();

  const storage = supabaseAdmin.storage.from(FACE_ICON_UPLOAD.bucket);

  // Slot names contain dots (nav.home) — flatten for the filename.
  const slotKey = slot.replace(/\./g, '_');

  // Remove this slot's previous uploads so replaced icons don't accumulate.
  const { data: existing } = await storage.list(podId, { limit: 100 });
  const stale = (existing ?? [])
    .filter((f) => f.name.startsWith(`${slotKey}-`))
    .map((f) => `${podId}/${f.name}`);
  if (stale.length > 0) await storage.remove(stale);

  // Timestamped name → new URL per upload, so CDN/browser caches never serve
  // the old icon after a replacement.
  const ext = EXT_BY_TYPE[file.type];
  const objectPath = `${podId}/${slotKey}-${Date.now()}.${ext}`;

  const { error: uploadError } = await storage.upload(
    objectPath,
    Buffer.from(await file.arrayBuffer()),
    { contentType: file.type, cacheControl: '31536000' },
  );
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = storage.getPublicUrl(objectPath);
  return NextResponse.json({ slot, url: pub.publicUrl });
}
