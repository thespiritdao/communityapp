import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Map proposal categories to agents
 */
const AGENT_MAPPING: Record<string, string[]> = {
  'social_post': ['agent:social:main'], // Beacon
  'linkedin_post': ['agent:social:main', 'agent:content:main'], // Beacon + Lyric
  'content_creation': ['agent:content:main'], // Lyric
  'research': ['agent:research:main'], // Scout
  'strategy': ['agent:strategy:main'], // Atlas
  'marketing_campaign': ['agent:strategy:main', 'agent:content:main'], // Atlas + Lyric
};

/**
 * Determine which agents should be assigned based on proposal
 */
function getAgentsForProposal(proposal: any): string[] {
  const title = proposal.title?.toLowerCase() || '';
  const deliverable = proposal.deliverable?.toLowerCase() || '';
  const combined = `${title} ${deliverable}`;

  // Check for specific keywords
  if (combined.includes('linkedin') || combined.includes('social') || combined.includes('post')) {
    return AGENT_MAPPING['social_post'];
  }
  if (combined.includes('research') || combined.includes('analyze') || combined.includes('competitor')) {
    return AGENT_MAPPING['research'];
  }
  if (combined.includes('strategy') || combined.includes('plan') || combined.includes('campaign')) {
    return AGENT_MAPPING['strategy'];
  }
  if (combined.includes('write') || combined.includes('draft') || combined.includes('content')) {
    return AGENT_MAPPING['content_creation'];
  }

  // Default: assign to Atlas (strategy coordinator)
  return ['agent:strategy:main'];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const proposalId = id;

    // Get proposal details first
    const { data: proposal, error: fetchError } = await supabase
      .from('agent_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    // Execute single proposal (generates artifact)
    const artifact = await AgentService.executeSingleProposal(proposalId);

    // If B-category, also create Squad task
    let taskCreated = false;
    let taskId = null;

    if (proposal.category === 'B') {
      // Determine which agents should handle this
      const assigneeSessionKeys = getAgentsForProposal(proposal);

      // Get agent IDs
      const assigneeIds: string[] = [];
      for (const sessionKey of assigneeSessionKeys) {
        const { data: agent } = await supabase
          .from('agents')
          .select('id, name')
          .eq('session_key', sessionKey)
          .single();

        if (agent) {
          assigneeIds.push(agent.id);

          // Create notification
          await supabase.from('notifications').insert({
            mentioned_agent_id: agent.id,
            content: `New task from Chief-of-Staff execution: ${proposal.title}`,
            source_type: 'assignment',
            delivered: false,
          });
        }
      }

      // Create task
      if (assigneeIds.length > 0) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: proposal.title,
            description: `${proposal.rationale}\n\nDeliverable: ${proposal.deliverable || 'N/A'}\n\nSteps:\n${proposal.steps?.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') || ''}`,
            status: 'assigned',
            assignee_ids: assigneeIds,
            priority: proposal.priority || 5,
            metadata: {
              source: 'chief_of_staff',
              proposal_id: proposalId,
              artifact_id: artifact?.id,
            },
          })
          .select()
          .single();

        if (!taskError && task) {
          taskCreated = true;
          taskId = task.id;

          // Log activity
          await supabase.from('activities').insert({
            activity_type: 'task_created',
            message: `Task auto-created from executed proposal: ${proposal.title}`,
            metadata: {
              task_id: task.id,
              proposal_id: proposalId,
              assignees: assigneeSessionKeys,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: artifact,
      taskCreated,
      taskId,
      message: taskCreated
        ? 'Proposal executed, artifact created, and task assigned to Squad'
        : 'Proposal executed and artifact created',
    });
  } catch (error: any) {
    console.error('Execute proposal error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
