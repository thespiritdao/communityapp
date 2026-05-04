// src/app/api/cron/community-agent/daily-post/route.ts
//
// Cron job: generates one daily discussion post per active agent pod.
// Schedule: 0 12 * * * (noon UTC / 7 AM ET)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getActiveAgentPods } from '@/services/communityAgent/configService';
import { generateAgentContent } from '@/services/communityAgent/agentService';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { AGENT_PSEUDO_WALLET } from '@/services/communityAgent/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const results: Array<{ podId: string; status: string; threadId?: string }> = [];

  try {
    const pods = await getActiveAgentPods();

    for (const config of pods) {
      try {
        // Skip if no daily category configured
        if (!config.dailyCategoryId) {
          results.push({ podId: config.podId, status: 'skipped_no_category' });
          continue;
        }

        // Dedup: check if we already posted today for this pod
        const { data: existing } = await supabaseAdmin
          .from('community_agent_posts')
          .select('id')
          .eq('pod_id', config.podId)
          .eq('type', 'daily_discussion')
          .gte('created_at', `${today}T00:00:00Z`)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ podId: config.podId, status: 'already_posted' });
          continue;
        }

        // Get recent thread titles to avoid repetition
        const { data: recentThreads } = await supabaseAdmin
          .from('forum_threads')
          .select('title')
          .eq('category_id', config.dailyCategoryId)
          .order('created_at', { ascending: false })
          .limit(7);

        const recentTopics = recentThreads?.map((t) => t.title) || [];

        // Generate the daily post
        const now = new Date();
        const response = await generateAgentContent({
          podId: config.podId,
          taskType: 'daily_discussion',
          context: {
            date: today,
            season: getSeason(now),
            dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
            recentTopics,
          },
        });

        // Extract a title from the first line or generate one
        const lines = response.content.split('\n').filter((l) => l.trim());
        const title = lines[0]?.length <= 80
          ? lines[0].replace(/^#+\s*/, '')
          : `${config.agentName}'s Daily — ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;

        // Create forum thread via supabaseAdmin (bypasses PoC check)
        const { data: thread, error: threadError } = await supabaseAdmin
          .from('forum_threads')
          .insert({
            category_id: config.dailyCategoryId,
            title,
            content: response.content,
            author_address: config.agentWallet,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (threadError) {
          console.error(`[DailyPost] Thread creation failed for pod ${config.podId}:`, threadError);
          results.push({ podId: config.podId, status: 'error_thread' });
          continue;
        }

        // Log to community_agent_posts
        await supabaseAdmin.from('community_agent_posts').insert({
          pod_id: config.podId,
          type: 'daily_discussion',
          thread_id: thread.id,
          content: response.content,
          metadata: response.metadata,
          status: 'posted',
        });

        // Fire Pulse event
        recordExplorerEvent({
          type: 'forum_thread_created',
          title: `${config.agentName} posted: ${title}`,
          actor: config.agentWallet,
          pod_id: config.podId,
          url: `/forum/thread/${thread.id}`,
          metadata: { agent: true, agent_name: config.agentName },
          dedupe_key: `agent-daily-${config.podId}-${today}`,
        }).catch(() => {});

        results.push({ podId: config.podId, status: 'posted', threadId: thread.id });
      } catch (podErr: any) {
        console.error(`[DailyPost] Error for pod ${config.podId}:`, podErr.message);
        results.push({ podId: config.podId, status: 'error' });
      }
    }

    console.log(`[DailyPost] Completed: ${results.length} pods processed`);
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('[DailyPost] Fatal error:', err);
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
