// src/app/api/pods/[id]/face/route.ts
// GET/PUT/DELETE a pod's face (custom appearance). See docs/spec-pod-faces.md.
//
// Authorization follows the surveys precedent: writes require pod leadership
// OR the granular `appearanceManage` role permission (requirePodPermissionOrLeader),
// with the Executive Pod Leader bypass that all management routes honor.
// Published faces are public reads — they contain colors and icon names only.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireFaceManager } from '@/lib/faceGuard';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import {
  validateFaceColors,
  validateFaceContrast,
  validateFaceIconMap,
  FACE_ICON_UPLOAD,
  type FaceColors,
  type FaceIconMap,
} from '@/features/pods/faces/faceConfig';

export const runtime = 'nodejs';

function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/face/);
  return match?.[1] ?? '';
}

/** Upload sources must point into OUR storage bucket, under THIS pod's
 *  folder — a face can't hotlink arbitrary URLs or another pod's icons. */
function validateUploadOwnership(iconMap: FaceIconMap, podId: string): string[] {
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${FACE_ICON_UPLOAD.bucket}/${podId}/`;
  const errors: string[] = [];
  for (const [slot, src] of Object.entries(iconMap)) {
    if (src?.type === 'upload' && !src.value.startsWith(prefix)) {
      errors.push(`${slot}: upload URL must be this pod's own uploaded icon`);
    }
  }
  return errors;
}

// GET /api/pods/[id]/face — published face for anyone; draft only for managers.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const { data: face, error } = await supabaseAdmin
    .from('pod_faces')
    .select('*')
    .eq('pod_id', podId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Published faces (and the no-face case) are public and change rarely —
  // let the CDN serve them. Only for anonymous requests: authorized calls
  // may include drafts and must never be cached for other viewers.
  const cacheable = !req.headers.get('Authorization');
  const cached = (body: unknown) => {
    const res = NextResponse.json(body);
    if (cacheable) {
      res.headers.set(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=300',
      );
    }
    return res;
  };

  if (!face) return cached({ face: null });
  if (face.status === 'published') return cached({ face });

  // Draft: only face managers may see it.
  const managerOrDenied = await requireFaceManager(req, podId);
  if (managerOrDenied instanceof NextResponse) {
    return NextResponse.json({ face: null });
  }
  return NextResponse.json({ face });
}

// PUT /api/pods/[id]/face — upsert the pod's face (draft or published).
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = await requireFaceManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  // Module gate (same shape as surveys)
  const { data: modules } = await supabaseAdmin
    .from('pod_modules')
    .select('custom_appearance_enabled')
    .eq('pod_id', podId)
    .single();

  if (!modules?.custom_appearance_enabled) {
    return NextResponse.json(
      { error: 'Custom Appearance module is not enabled for this pod' },
      { status: 400 },
    );
  }

  const body = await req.json();
  const colors = body.colors ?? {};
  const iconMap = body.icon_map ?? {};
  const status = body.status ?? 'draft';

  if (status !== 'draft' && status !== 'published') {
    return NextResponse.json(
      { error: "status must be 'draft' or 'published'" },
      { status: 400 },
    );
  }

  const colorCheck = validateFaceColors(colors);
  if (!colorCheck.ok) {
    return NextResponse.json(
      { error: 'Invalid colors', details: colorCheck.errors },
      { status: 400 },
    );
  }

  const iconCheck = validateFaceIconMap(iconMap);
  if (!iconCheck.ok) {
    return NextResponse.json(
      { error: 'Invalid icon_map', details: iconCheck.errors },
      { status: 400 },
    );
  }

  const ownershipErrors = validateUploadOwnership(iconMap as FaceIconMap, podId);
  if (ownershipErrors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid icon_map', details: ownershipErrors },
      { status: 400 },
    );
  }

  // Contrast is enforced only at publish so drafts can be works-in-progress.
  if (status === 'published') {
    const contrastCheck = validateFaceContrast(colors as FaceColors);
    if (!contrastCheck.ok) {
      return NextResponse.json(
        { error: 'Face fails accessibility contrast checks', details: contrastCheck.errors },
        { status: 400 },
      );
    }
  }

  // Prior state — used to detect the pod's first publish for the Pulse event.
  const { data: prior } = await supabaseAdmin
    .from('pod_faces')
    .select('status')
    .eq('pod_id', podId)
    .maybeSingle();

  const { data: face, error } = await supabaseAdmin
    .from('pod_faces')
    .upsert(
      {
        pod_id: podId,
        colors,
        icon_map: iconMap,
        status,
        updated_by: wallet,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pod_id' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pulse: surface a pod's first face publish so members discover it.
  // dedupe_key without a timestamp → fires once per pod, ever.
  if (status === 'published' && prior?.status !== 'published') {
    const { data: podRow } = await supabaseAdmin
      .from('pods')
      .select('name')
      .eq('id', podId)
      .single();
    recordExplorerEvent({
      type: 'pod_face_published',
      title: `${podRow?.name || 'A pod'} published a custom look — wear it from Identity → Appearance`,
      actor: wallet,
      pod_id: podId,
      url: `/pods/${podId}`,
      metadata: { primary: (colors as Record<string, string>).primary ?? null },
      dedupe_key: `pod_face_published:${podId}`,
    }).catch((err) => console.warn('[pod face] explorer event failed:', err));

    // Notify members (preference-checked, push-delivered) that a new look is
    // available. Fire-and-forget: fan-out must not block the publish response.
    notifyMembersOfFace(podId, podRow?.name || 'Your pod', wallet).catch(
      (err) => console.warn('[pod face] member notification failed:', err),
    );
  }

  return NextResponse.json({ face });
}

/** Fan out a first-publish notification to every active pod member (except
 *  the publisher). Preference checks and push delivery are handled per-
 *  recipient by sendServerNotificationBatch. */
async function notifyMembersOfFace(
  podId: string,
  podName: string,
  publisherWallet: string,
): Promise<void> {
  const [{ data: memberRows }, { data: pod }] = await Promise.all([
    supabaseAdmin
      .from('pod_members')
      .select('wallet')
      .eq('pod_id', podId)
      .eq('is_active', true),
    supabaseAdmin.from('pods').select('pod_leads').eq('id', podId).single(),
  ]);

  const recipients = Array.from(
    new Set([
      ...(memberRows ?? []).map((r: { wallet: string }) => r.wallet.toLowerCase()),
      ...((pod?.pod_leads ?? []) as string[]).map((w) => w.toLowerCase()),
    ]),
  ).filter((w) => w !== publisherWallet.toLowerCase());

  if (recipients.length === 0) return;

  await sendServerNotificationBatch(
    recipients.map((recipient) => ({
      recipient_address: recipient,
      sender_address: publisherWallet,
      notification_type: 'pod_face_published',
      title: `${podName} has a new look`,
      message: `${podName} published a custom appearance. Wear it from Identity → Appearance.`,
      context_url: '/identity',
      context_type: 'pod',
      context_id: podId,
      priority: 'low' as const,
    })),
  );
}

// DELETE /api/pods/[id]/face — remove the face; members wearing it fall back
// to the default appearance client-side (active_face_pod_id stays set but
// resolves to no published face).
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = await requireFaceManager(req, podId);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;

  const { error } = await supabaseAdmin
    .from('pod_faces')
    .delete()
    .eq('pod_id', podId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
