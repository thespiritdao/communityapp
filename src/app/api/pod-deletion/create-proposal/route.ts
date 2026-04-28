// src/app/api/pod-deletion/create-proposal/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordExplorerEvent } from '@/lib/explorerEvents';

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
    const body = await request.json();

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

    // Optional: Add validation to check if proposed_by is actually a pod leader
    // const { data: pod } = await supabaseAdmin
    //   .from('pods')
    //   .select('pod_leads')
    //   .eq('id', body.pod_id)
    //   .single();
    //
    // if (!pod || !pod.pod_leads.includes(body.proposed_by.toLowerCase())) {
    //   return NextResponse.json(
    //     { error: 'Only pod leaders can propose deletion' },
    //     { status: 403 }
    //   );
    // }

    // Insert proposal using service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('pod_deletion_proposals')
      .insert({
        pod_id: body.pod_id,
        pod_name: body.pod_name,
        proposed_by: body.proposed_by.toLowerCase(),
        required_approvals: body.required_approvals || 1,
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
