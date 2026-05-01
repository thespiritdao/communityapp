// src/app/api/forum/agent-mention/route.ts
//
// Fire-and-forget endpoint called by the client after a forum post is created.
// Checks if the post mentions a pod's community agent, and if so, queues
// a reply request in community_agent_queue for the process-mentions cron.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { checkForAgentMention, getPodIdForThread } from '@/services/communityAgent/mentionService';
import { isAgentActive } from '@/services/communityAgent/configService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { threadId, postId, content } = body;

    if (!threadId || !postId || !content) {
      return NextResponse.json({ queued: false, reason: 'missing_params' });
    }

    // Resolve which pod this thread belongs to
    const podId = await getPodIdForThread(threadId);
    if (!podId) {
      return NextResponse.json({ queued: false, reason: 'no_pod' });
    }

    // Check if agent is active for this pod
    const active = await isAgentActive(podId);
    if (!active) {
      return NextResponse.json({ queued: false, reason: 'agent_inactive' });
    }

    // Check if the post content mentions the agent
    const isMentioned = await checkForAgentMention(content, podId);
    if (!isMentioned) {
      return NextResponse.json({ queued: false, reason: 'no_mention' });
    }

    // Dedupe: check if this post is already queued
    const { data: existing } = await supabaseAdmin
      .from('community_agent_queue')
      .select('id')
      .eq('trigger_post_id', postId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ queued: false, reason: 'already_queued' });
    }

    // Queue the mention for processing by the cron job
    const { error } = await supabaseAdmin
      .from('community_agent_queue')
      .insert({
        pod_id: podId,
        thread_id: threadId,
        trigger_post_id: postId,
        type: 'forum_mention',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[forum/agent-mention] Queue insert failed:', error);
      return NextResponse.json({ queued: false, reason: 'insert_error' });
    }

    console.log(`[forum/agent-mention] Queued reply for post ${postId} in thread ${threadId}`);
    return NextResponse.json({ queued: true });
  } catch (err: any) {
    // Never break the caller — this is fire-and-forget
    console.error('[forum/agent-mention] Error:', err?.message);
    return NextResponse.json({ queued: false, reason: 'error' });
  }
}
