// src/app/api/cron/community-agent/weekly-events/route.ts
//
// Cron job: generates weekly event suggestions for each active agent pod.
// Events are inserted as drafts for pod leader review.
// Schedule: 0 14 * * 0 (Sundays 2 PM UTC)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getActiveAgentPods } from '@/services/communityAgent/configService';
import { generateAgentContent } from '@/services/communityAgent/agentService';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const results: Array<{ podId: string; status: string; eventsCreated: number }> = [];

  try {
    const pods = await getActiveAgentPods();

    for (const config of pods) {
      try {
        // Check if events module is enabled for this pod
        const { data: modules } = await supabaseAdmin
          .from('pod_modules')
          .select('events_enabled')
          .eq('pod_id', config.podId)
          .single();

        if (!modules?.events_enabled) {
          results.push({ podId: config.podId, status: 'events_disabled', eventsCreated: 0 });
          continue;
        }

        // Generate 3 event suggestions for the coming week
        const eventTopics = [
          'community discussion circle',
          'weekly reflection and practice',
          'open study session',
        ];

        let created = 0;
        for (let i = 0; i < eventTopics.length; i++) {
          const eventDate = new Date(today);
          eventDate.setDate(eventDate.getDate() + i + 1); // Next Mon, Tue, Wed
          eventDate.setHours(18, 0, 0, 0); // 6 PM UTC default

          const response = await generateAgentContent({
            podId: config.podId,
            taskType: 'event_description',
            context: {
              date: eventDate.toISOString().split('T')[0],
              season: getSeason(eventDate),
              dayOfWeek: eventDate.toLocaleDateString('en-US', { weekday: 'long' }),
              eventTopic: eventTopics[i],
            },
          });

          // Parse title from response (first line) and description (rest)
          const lines = response.content.split('\n').filter((l) => l.trim());
          const title = lines[0]?.replace(/^#+\s*/, '').replace(/^\*+|\*+$/g, '').trim()
            || `${config.agentName} — ${eventTopics[i]}`;
          const description = lines.slice(1).join('\n').trim() || response.content;

          const eventEndDate = new Date(eventDate);
          eventEndDate.setHours(19, 30, 0, 0); // 1.5 hours later

          // Insert as draft event
          const status = config.autoPublishEvents ? 'published' : 'draft';
          const { error } = await supabaseAdmin.from('events').insert({
            title,
            description,
            event_date: eventDate.toISOString(),
            event_end_date: eventEndDate.toISOString(),
            location: 'Virtual — In-App Conference Room',
            max_attendees: 50,
            price_amount: 0,
            price_self_amount: 0,
            organizing_pod_id: config.podId,
            creator_address: config.agentWallet,
            status,
            event_metadata: {
              generated_by: 'community_agent',
              agent_name: config.agentName,
              task_metadata: response.metadata,
            },
          });

          if (!error) created++;
        }

        // Log to community_agent_posts
        await supabaseAdmin.from('community_agent_posts').insert({
          pod_id: config.podId,
          type: 'event_creation',
          content: `Generated ${created} event suggestions for the week`,
          metadata: { events_created: created, week_of: today.toISOString() },
          status: 'posted',
        });

        results.push({ podId: config.podId, status: 'ok', eventsCreated: created });
      } catch (podErr: any) {
        console.error(`[WeeklyEvents] Error for pod ${config.podId}:`, podErr.message);
        results.push({ podId: config.podId, status: 'error', eventsCreated: 0 });
      }
    }

    console.log(`[WeeklyEvents] Completed: ${results.length} pods processed`);
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('[WeeklyEvents] Fatal error:', err);
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
