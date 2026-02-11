import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST - Mark task as complete and create artifact if from Chief-of-Staff
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { content, artifactTitle, artifactType } = await request.json();

    // Get task details
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Update task to done
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // If task came from Chief-of-Staff proposal, create artifact
    let artifactCreated = false;
    let artifactId = null;

    if (task.metadata?.source === 'chief_of_staff' && task.metadata?.proposal_id && content) {
      const { data: artifact, error: artifactError } = await supabase
        .from('agent_artifacts')
        .insert({
          title: artifactTitle || task.title,
          content: content,
          artifact_type: artifactType || 'document',
          proposal_id: task.metadata.proposal_id,
          metadata: {
            source: 'agent_squad',
            task_id: id,
          },
        })
        .select()
        .single();

      if (!artifactError && artifact) {
        artifactCreated = true;
        artifactId = artifact.id;

        // Update proposal status to executed
        await supabase
          .from('agent_proposals')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
          })
          .eq('id', task.metadata.proposal_id);

        // Log activity
        await supabase.from('activities').insert({
          activity_type: 'artifact_created',
          message: `Artifact created from completed task: ${task.title}`,
          metadata: {
            artifact_id: artifact.id,
            task_id: id,
            proposal_id: task.metadata.proposal_id,
          },
        });
      }
    }

    // Log activity
    await supabase.from('activities').insert({
      activity_type: 'task_completed',
      message: `Task completed: ${task.title}`,
      metadata: { task_id: id },
    });

    return NextResponse.json({
      success: true,
      message: artifactCreated
        ? 'Task completed and artifact created'
        : 'Task completed',
      data: {
        artifactCreated,
        artifactId,
      },
    });
  } catch (error: any) {
    console.error('Complete task error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
