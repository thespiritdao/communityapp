// src/app/api/cron/community-agent/process-mentions/route.ts
//
// Cron job: processes queued forum mention requests and generates agent replies.
// Schedule: */2 * * * * (every 2 minutes)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { isAgentActive, getAgentConfig } from '@/services/communityAgent/configService';
import { generateAgentContent } from '@/services/communityAgent/agentService';
import { extractForumContext } from '@/services/communityAgent/mentionService';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { requireCron } from '@/lib/cronAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_REPLIES_PER_POD_PER_DAY = 10;
const MAX_ATTEMPTS = 3;

// Transient failure: requeue with attempts+1, fail permanently after MAX_ATTEMPTS.
// Requires the community_agent_queue.attempts column
// (migration 20260721000001_community_agent_queue_attempts.sql).
async function requeueOrFail(item: any) {
  const attempts = (item.attempts ?? 0) + 1;
  await supabaseAdmin
    .from('community_agent_queue')
    .update(
      attempts >= MAX_ATTEMPTS
        ? { status: 'failed', attempts }
        : { status: 'pending', attempts },
    )
    .eq('id', item.id);
  return attempts >= MAX_ATTEMPTS;
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  let processed = 0;
  let skipped = 0;
  let errored = 0;

  try {
    // Sweep items orphaned in 'processing' by a crashed run. Safe because
    // maxDuration is 60s and runs are >=2min apart — nothing can still be
    // legitimately processing when a new run starts.
    const { data: orphaned } = await supabaseAdmin
      .from('community_agent_queue')
      .select('*')
      .eq('status', 'processing');
    for (const item of orphaned || []) {
      await requeueOrFail(item);
    }

    // Fetch pending items from the queue
    const { data: queue } = await supabaseAdmin
      .from('community_agent_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (!queue || queue.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No pending items' });
    }

    for (const item of queue) {
      try {
        // Mark as processing
        await supabaseAdmin
          .from('community_agent_queue')
          .update({ status: 'processing' })
          .eq('id', item.id);

        // Check pod is still active
        const active = await isAgentActive(item.pod_id);
        if (!active) {
          await supabaseAdmin
            .from('community_agent_queue')
            .update({ status: 'failed' })
            .eq('id', item.id);
          skipped++;
          continue;
        }

        const config = await getAgentConfig(item.pod_id);
        if (!config) {
          await supabaseAdmin
            .from('community_agent_queue')
            .update({ status: 'failed' })
            .eq('id', item.id);
          skipped++;
          continue;
        }

        // Rate limit: check daily reply count for this pod
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabaseAdmin
          .from('community_agent_posts')
          .select('id', { count: 'exact', head: true })
          .eq('pod_id', item.pod_id)
          .eq('type', 'mention_reply')
          .gte('created_at', `${today}T00:00:00Z`);

        if ((count || 0) >= MAX_REPLIES_PER_POD_PER_DAY) {
          await supabaseAdmin
            .from('community_agent_queue')
            .update({ status: 'failed' })
            .eq('id', item.id);
          skipped++;
          continue;
        }

        // Extract thread context
        const context = await extractForumContext(item.thread_id, item.trigger_post_id);

        // Generate reply
        const now = new Date();
        const response = await generateAgentContent({
          podId: item.pod_id,
          taskType: 'mention_reply',
          context: {
            date: now.toISOString().split('T')[0],
            season: getSeason(now),
            dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
            userMessage: context.userMessage,
            conversationHistory: context.conversationHistory,
          },
        });

        // Insert reply as a forum post
        const { data: post, error: postError } = await supabaseAdmin
          .from('forum_posts')
          .insert({
            thread_id: item.thread_id,
            content: response.content,
            author_address: config.agentWallet,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (postError) {
          console.error(`[ProcessMentions] Post insert failed:`, postError);
          await requeueOrFail(item);
          errored++;
          continue;
        }

        // Log to community_agent_posts
        await supabaseAdmin.from('community_agent_posts').insert({
          pod_id: item.pod_id,
          type: 'mention_reply',
          thread_id: item.thread_id,
          post_id: post.id,
          content: response.content,
          metadata: response.metadata,
          status: 'posted',
        });

        // Mark queue item as completed
        await supabaseAdmin
          .from('community_agent_queue')
          .update({ status: 'completed' })
          .eq('id', item.id);

        // Fire Pulse event
        recordExplorerEvent({
          type: 'forum_post_created',
          title: `${config.agentName} replied in thread`,
          actor: config.agentWallet,
          pod_id: item.pod_id,
          url: `/forum/thread/${item.thread_id}`,
          metadata: { agent: true, agent_name: config.agentName },
          dedupe_key: `agent-reply-${post.id}`,
        }).catch(() => {});

        processed++;
      } catch (itemErr: any) {
        console.error(`[ProcessMentions] Error processing item ${item.id}:`, itemErr.message);
        const gaveUp = await requeueOrFail(item);
        if (gaveUp) {
          console.error(`[ProcessMentions] Item ${item.id} failed permanently after ${MAX_ATTEMPTS} attempts`);
        }
        errored++;
      }
    }

    console.log(`[ProcessMentions] Done: ${processed} processed, ${skipped} skipped, ${errored} errored`);
    return NextResponse.json({ success: true, processed, skipped, errored });
  } catch (err: any) {
    console.error('[ProcessMentions] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getSeason(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}
