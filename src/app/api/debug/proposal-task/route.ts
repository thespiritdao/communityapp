import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const proposalId = request.nextUrl.searchParams.get('proposalId');

    if (!proposalId) {
      return NextResponse.json({ error: 'proposalId required' }, { status: 400 });
    }

    // Get proposal
    const { data: proposal } = await supabase
      .from('agent_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    // Get all agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, session_key, status');

    // Get tasks for this proposal
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .contains('metadata', { proposal_id: proposalId });

    // Get artifacts for this proposal
    const { data: artifacts } = await supabase
      .from('agent_artifacts')
      .select('*')
      .eq('proposal_id', proposalId);

    return NextResponse.json({
      proposal: {
        id: proposal?.id,
        title: proposal?.title,
        category: proposal?.category,
        status: proposal?.status,
      },
      agents: agents?.map(a => ({
        id: a.id,
        name: a.name,
        session_key: a.session_key,
        status: a.status,
      })) || [],
      tasks: tasks || [],
      artifacts: artifacts || [],
      diagnosis: {
        hasProposal: !!proposal,
        isBCategory: proposal?.category === 'B',
        agentCount: agents?.length || 0,
        taskCount: tasks?.length || 0,
        artifactCount: artifacts?.length || 0,
        shouldHaveTask: proposal?.category === 'B' && (agents?.length || 0) > 0,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
