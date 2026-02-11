import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET all tasks with optional status filter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('tasks')
      .select(`
        *,
        agents!tasks_created_by_agent_id_fkey (
          name,
          role
        )
      `)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: tasks || [],
    });
  } catch (error: any) {
    console.error('Get tasks error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const { title, description, assigneeSessionKeys, priority } = await request.json();

    if (!title || !assigneeSessionKeys || assigneeSessionKeys.length === 0) {
      return NextResponse.json(
        { error: 'Title and assignees are required' },
        { status: 400 }
      );
    }

    // Get agent IDs from session keys
    const assigneeIds: string[] = [];
    for (const sessionKey of assigneeSessionKeys) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name')
        .eq('session_key', sessionKey)
        .single();

      if (agent) {
        assigneeIds.push(agent.id);

        // Create notification for assigned agent
        await supabase.from('notifications').insert({
          mentioned_agent_id: agent.id,
          content: `You've been assigned to: ${title}`,
          source_type: 'assignment',
          delivered: false,
        });
      }
    }

    // Create task
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description: description || '',
        status: 'assigned',
        assignee_ids: assigneeIds,
        priority: priority || 5,
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('activities').insert({
      activity_type: 'task_created',
      message: `Task created: ${title}`,
      metadata: { task_id: data.id, assignees: assigneeSessionKeys },
    });

    return NextResponse.json({
      success: true,
      data,
      message: 'Task created successfully',
    });
  } catch (error: any) {
    console.error('Create task error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
