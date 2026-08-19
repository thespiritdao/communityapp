// src/app/api/cron/community-agent/sync-forum-corpus/route.ts
//
// Congregant Phase 5: nightly discourse ingestion.
//
// For every active agent pod that has opted into forum ingestion
// (community_agent_config.corpus_includes_forum), incrementally embeds the
// pod's forum discourse into the agent's corpus under the consent rules in
// forumCorpusService (member opt-outs enforced, agent's own posts excluded,
// no author identity in vectors).
//
// Schedule: 0 3 * * * (daily, 3:00 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireCron } from '@/lib/cronAuth';
import { isAgentActive } from '@/services/communityAgent/configService';
import { syncForumCorpus } from '@/services/communityAgent/forumCorpusService';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const results: Record<string, any> = {};

  try {
    const { data: pods } = await supabaseAdmin
      .from('pod_modules')
      .select('pod_id, community_agent_config')
      .eq('community_agent_enabled', true);

    for (const row of pods ?? []) {
      const podId = row.pod_id;
      const cfg = row.community_agent_config || {};

      if (cfg.corpus_includes_forum !== true) {
        results[podId] = 'skipped (forum ingestion not enabled)';
        continue;
      }
      if (!(await isAgentActive(podId))) {
        results[podId] = 'skipped (agent not active)';
        continue;
      }

      const syncStartedAt = new Date().toISOString();
      try {
        const sync = await syncForumCorpus(podId, cfg);

        // Persist watermark + running forum-vector count (used by the
        // transparency card). Net count: prior + upserted new IDs is an
        // overestimate on edits (same ID re-upserted); acceptable for display.
        const priorCount = cfg.forum_corpus_vector_count ?? 0;
        await supabaseAdmin
          .from('pod_modules')
          .update({
            community_agent_config: {
              ...cfg,
              forum_corpus_last_synced_at: syncStartedAt,
              forum_corpus_vector_count: Math.max(0, priorCount + sync.upserted - sync.deleted),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('pod_id', podId);

        results[podId] = sync;
      } catch (e: any) {
        results[podId] = `error: ${e.message}`;
      }
    }

    console.log('[SyncForumCorpus]', JSON.stringify(results));
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('[SyncForumCorpus] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
