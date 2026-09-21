// src/app/api/pod-deletion/create-proposal/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import {
  getEligibleVoterCount,
  getPodGovernanceConfig,
} from '@/features/pods/services/podGovernanceConfigService';

// Server-side Supabase client with service role (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function POST(request: Request) {
  try {
    // G2 guard: pod deletion proposals may only be created by an
    // authenticated pod leader, and proposed_by is taken from the verified
    // session — never from the request body. Fails closed.
    const { requireWallet } = await import('@/lib/apiPodGuard');
    const { isPodLeader } = await import('@/lib/serverPodAuth');
    const walletOrDenied = await requireWallet(request);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const wallet = walletOrDenied;

    const body = await request.json();
    // Force the proposer identity to the verified caller.
    body.proposed_by = wallet;

    console.log('📝 API: Creating pod deletion proposal:', {
      pod_id: body.pod_id,
      pod_name: body.pod_name,
      proposed_by: body.proposed_by,
    });

    // Validate required fields
    if (!body.pod_id || !body.pod_name || !body.proposed_by) {
      return NextResponse.json(
        { error: 'Missing required fields: pod_id, pod_name, proposed_by' },
        { status: 400 },
      );
    }

    if (!(await isPodLeader(body.pod_id, wallet))) {
      return NextResponse.json(
        { error: 'Only pod leaders can propose deletion' },
        { status: 403 },
      );
    }

    // Resolve required_approvals from the pod's operational governance
    // config (or platform default if none is set). Caller's body.required_approvals
    // is honored only when it's >= the configured count — never lower —
    // so a deletion proposal can't quietly bypass the configured bar.
    const podConfig = await getPodGovernanceConfig(body.pod_id);
    const eligibleManagers = await getEligibleVoterCount(
      body.pod_id,
      'POD_OPERATIONAL',
    );
    const configuredRequired = Math.max(
      1,
      Math.ceil(
        (Math.max(1, eligibleManagers) * podConfig.operational.approval_bps) /
          10000,
      ),
    );
    const effectiveRequired = Math.max(
      configuredRequired,
      typeof body.required_approvals === 'number' ? body.required_approvals : 0,
    );

    // Insert proposal using service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('pod_deletion_proposals')
      .insert({
        pod_id: body.pod_id,
        pod_name: body.pod_name,
        proposed_by: body.proposed_by.toLowerCase(),
        required_approvals: effectiveRequired,
        approval_threshold_bps: podConfig.operational.approval_bps,
        current_approvals: body.current_approvals || [],
        status: 'pending',
        management_hat_id: body.management_hat_id || null,
        membership_hat_id: body.membership_hat_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ API: Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ API: Proposal created successfully:', data.id);

    recordExplorerEvent({
      type: 'pod_deletion_proposed',
      title: `Pod deletion proposed: ${body.pod_name}`,
      actor: body.proposed_by,
      pod_id: body.pod_id,
      url: `/pods/${body.pod_id}`,
      metadata: { proposal_id: data.id, pod_name: body.pod_name },
      dedupe_key: `pod_deletion_proposed:${data.id}`,
    }).catch((err) => console.warn('[pod-deletion] explorer event failed:', err));

    return NextResponse.json({
      success: true,
      proposal: data,
    });
  } catch (error) {
    console.error('❌ API: Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
