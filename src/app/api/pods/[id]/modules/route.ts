// src/app/api/pods/[id]/modules/route.ts
// GET/PUT pod_modules for a specific pod — uses supabaseAdmin to bypass RLS.
// Caller must be a pod leader (enforced by withPodManagement middleware).

import type { NextRequest } from 'next/server';
import { withPodManagement, PodAuthResponse, type PodAuthContext } from '@/features/pods/middleware/podAuthMiddleware';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

const ALLOWED_KEYS = [
  'chat_enabled',
  'forum_enabled',
  'treasury_enabled',
  'events_enabled',
  'bounties_enabled',
  'marketplace_enabled',
  'knowledge_base_enabled',
  'sub_pods_enabled',
] as const;

export async function GET(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async (_req, context: PodAuthContext) => {
    const { data, error } = await supabaseAdmin
      .from('pod_modules')
      .select('*')
      .eq('pod_id', context.podId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return PodAuthResponse.error(error.message, 500);
    }

    return PodAuthResponse.success({ modules: data || null });
  });
}

export async function PUT(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async (req, context: PodAuthContext) => {
    const body = await req.json();

    // Only allow toggling known boolean module keys
    const updates: Record<string, boolean> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body && typeof body[key] === 'boolean') {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return PodAuthResponse.error('No valid module keys provided', 400);
    }

    // Upsert so first toggle creates the row if it doesn't exist
    const { data, error } = await supabaseAdmin
      .from('pod_modules')
      .upsert(
        { pod_id: context.podId, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'pod_id' },
      )
      .select()
      .single();

    if (error) return PodAuthResponse.error(error.message, 500);

    // When sub_pods_enabled changes, sync subPodCreation on all leader roles for this pod
    if ('sub_pods_enabled' in updates) {
      try {
        const { data: roles } = await supabaseAdmin
          .from('pod_role_permissions')
          .select('id, permissions')
          .eq('pod_id', context.podId);

        if (roles) {
          for (const role of roles) {
            const perms = typeof role.permissions === 'string'
              ? JSON.parse(role.permissions)
              : { ...(role.permissions || {}) };
            perms.subPodCreation = updates.sub_pods_enabled;
            await supabaseAdmin
              .from('pod_role_permissions')
              .update({ permissions: perms })
              .eq('id', role.id);
          }
        }
      } catch (permErr) {
        console.warn('Could not sync subPodCreation permission:', permErr);
      }
    }

    return PodAuthResponse.success({ modules: data });
  });
}
