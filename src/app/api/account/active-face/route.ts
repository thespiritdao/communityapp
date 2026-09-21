// src/app/api/account/active-face/route.ts
// GET/PUT the caller's active face — which pod's published appearance they
// wear app-wide. See docs/spec-pod-faces.md §7. Purely cosmetic setting;
// membership in the target pod is enforced on set, and the client falls back
// to the default appearance whenever the face is unpublished or membership
// lapses.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';

export const runtime = 'nodejs';

// GET /api/account/active-face — the caller's selection plus the resolved
// published face (null when unset, unpublished, or deleted).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const { data: profile, error } = await supabaseAdmin
    .from('user_profiles')
    .select('active_face_pod_id')
    .eq('wallet_address', wallet)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activeFacePodId = profile?.active_face_pod_id ?? null;
  if (!activeFacePodId) {
    return NextResponse.json({ activeFacePodId: null, face: null });
  }

  const { data: face } = await supabaseAdmin
    .from('pod_faces')
    .select('*')
    .eq('pod_id', activeFacePodId)
    .eq('status', 'published')
    .maybeSingle();

  return NextResponse.json({ activeFacePodId, face: face ?? null });
}

// PUT /api/account/active-face — body { podId: string | null }.
// null reverts to the default appearance.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  const body = await req.json();
  const podId: unknown = body.podId;

  if (podId !== null && typeof podId !== 'string') {
    return NextResponse.json(
      { error: 'podId must be a pod UUID or null' },
      { status: 400 },
    );
  }

  if (podId) {
    // The pod must have a published face…
    const { data: face } = await supabaseAdmin
      .from('pod_faces')
      .select('id')
      .eq('pod_id', podId)
      .eq('status', 'published')
      .maybeSingle();

    if (!face) {
      return NextResponse.json(
        { error: 'This pod has no published face' },
        { status: 400 },
      );
    }

    // …and the caller must be an active member (leader or regular).
    const [{ data: member }, { data: pod }] = await Promise.all([
      supabaseAdmin
        .from('pod_members')
        .select('id')
        .eq('pod_id', podId)
        .eq('wallet', wallet)
        .eq('is_active', true)
        .maybeSingle(),
      supabaseAdmin
        .from('pods')
        .select('pod_leads')
        .eq('id', podId)
        .maybeSingle(),
    ]);

    const isLead = pod?.pod_leads?.some(
      (lead: string) => lead.toLowerCase() === wallet,
    );
    if (!member && !isLead) {
      return NextResponse.json(
        { error: 'You must be a member of this pod to wear its face' },
        { status: 403 },
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({ active_face_pod_id: podId })
    .eq('wallet_address', wallet);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ activeFacePodId: podId });
}
