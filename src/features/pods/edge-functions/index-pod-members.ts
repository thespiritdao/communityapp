/**
 * Supabase Edge Function for indexing pod members
 *
 * This function would be deployed as a Supabase Edge Function and called:
 * 1. By a cron job (every 15-30 minutes)
 * 2. Manually when pods are created/updated
 * 3. Via webhook when HAT transfers occur (future enhancement)
 *
 * To deploy:
 * supabase functions deploy index-pod-members
 *
 * To call manually:
 * supabase functions invoke index-pod-members
 */

import { createClient } from '@supabase/supabase-js';
import { MemberIndexingService } from '../services/MemberIndexingService';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Initialize Supabase client with service role for full access
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
      );

      // Get request parameters
      const url = new URL(request.url);
      const podId = url.searchParams.get('pod_id');
      const force = url.searchParams.get('force') === 'true';

      console.log('🚀 Starting pod member indexing...', { podId, force });

      let result;

      if (podId) {
        // Index specific pod
        console.log(`🔍 Indexing specific pod: ${podId}`);

        // Get pod details
        const { data: pod, error } = await supabase
          .from('pods')
          .select('id, management_hat_id, membership_hat_id')
          .eq('id', podId)
          .single();

        if (error || !pod) {
          throw new Error(`Pod not found: ${podId}`);
        }

        const stats = {
          pods_processed: 0,
          members_added: 0,
          members_removed: 0,
          members_updated: 0,
          errors: [],
        };

        await MemberIndexingService.indexPodMembership(pod, stats);
        result = { pod_id: podId, ...stats };
      } else {
        // Index all pods
        console.log('🔍 Indexing all pods...');
        result = await MemberIndexingService.indexAllPodMemberships();
      }

      console.log('✅ Indexing completed:', result);

      return new Response(
        JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          ...result,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 200,
        },
      );
    } catch (error) {
      console.error('❌ Indexing failed:', error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 500,
        },
      );
    }
  },
};

// Cron job configuration (add to supabase/functions/_shared/cron.ts)
export const cronConfig = {
  // Run every 30 minutes
  schedule: '0 */30 * * * *',
  handler: async () => {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/index-pod-members`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const result = await response.json();
    console.log('🕒 Scheduled indexing result:', result);
    return result;
  },
};
