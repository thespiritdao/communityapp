// src/app/api/account/faces/route.ts
// GET the published faces available to the caller — one per pod they belong
// to (active member or pod lead) that has published a face. Feeds the
// Identity → Appearance switcher (docs/spec-pod-faces.md §7).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  // Pods the caller belongs to: active membership rows + pod_leads arrays.
  const [{ data: memberRows }, { data: leadPods }] = await Promise.all([
    supabaseAdmin
      .from('pod_members')
      .select('pod_id')
      .eq('wallet', wallet)
      .eq('is_active', true),
    supabaseAdmin
      .from('pods')
      .select('id')
      .contains('pod_leads', [wallet]),
  ]);

  const podIds = Array.from(
    new Set([
      ...(memberRows ?? []).map((r: { pod_id: string }) => r.pod_id),
      ...(leadPods ?? []).map((r: { id: string }) => r.id),
    ]),
  );

  if (podIds.length === 0) return NextResponse.json({ faces: [] });

  const { data: faces, error } = await supabaseAdmin
    .from('pod_faces')
    .select('pod_id, colors, icon_map, updated_at')
    .in('pod_id', podIds)
    .eq('status', 'published');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!faces?.length) return NextResponse.json({ faces: [] });

  const { data: pods } = await supabaseAdmin
    .from('pods')
    .select('id, name, pod_image_url')
    .in('id', faces.map((f: { pod_id: string }) => f.pod_id));

  const podById = new Map((pods ?? []).map((p: any) => [p.id, p]));

  return NextResponse.json({
    faces: faces.map((f: any) => ({
      podId: f.pod_id,
      podName: podById.get(f.pod_id)?.name ?? 'Unknown pod',
      podImageUrl: podById.get(f.pod_id)?.pod_image_url ?? null,
      colors: f.colors ?? {},
      iconMap: f.icon_map ?? {},
      updatedAt: f.updated_at,
    })),
  });
}
