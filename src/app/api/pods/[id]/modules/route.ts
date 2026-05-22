// src/app/api/pods/[id]/modules/route.ts
// GET/PUT pod_modules — uses supabaseAdmin to bypass RLS.
// Auth: caller must be a pod leader (pod_leads array or pod_members with role=leader).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { ensureAgentProfile } from '@/services/communityAgent/configService';
import { deriveAgentWallet } from '@/services/communityAgent/types';

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
  'community_agent_enabled',
  'surveys_enabled',
  'governance_enabled',
] as const;

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

async function isPodLeader(podId: string, wallet: string): Promise<boolean> {
  // Check pod_leads array
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.includes(wallet.toLowerCase())) return true;

  // Check pod_members table
  const { data: member } = await supabaseAdmin
    .from('pod_members')
    .select('id')
    .eq('pod_id', podId)
    .eq('wallet', wallet.toLowerCase())
    .eq('role', 'leader')
    .eq('is_active', true)
    .single();

  return !!member;
}

function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/modules/);
  return match?.[1] ?? '';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('pod_modules')
    .select('*')
    .eq('pod_id', podId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ modules: data || null });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) return NextResponse.json({ error: 'Forbidden: not a pod leader' }, { status: 403 });

  const body = await req.json();

  const updates: Record<string, boolean> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body && typeof body[key] === 'boolean') {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid module keys provided' }, { status: 400 });
  }

  // Snapshot prior state so we can fire Pulse events only on actual transitions.
  const { data: prior } = await supabaseAdmin
    .from('pod_modules')
    .select('*')
    .eq('pod_id', podId)
    .single();

  const { data, error } = await supabaseAdmin
    .from('pod_modules')
    .upsert(
      { pod_id: podId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'pod_id' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Pause / resume subscription timer when community_agent_enabled toggles ──
  if ('community_agent_enabled' in updates) {
    const wasEnabled = prior?.community_agent_enabled ?? false;
    const nowEnabled = updates.community_agent_enabled;
    if (wasEnabled && !nowEnabled) {
      // PAUSE: snapshot remaining days, clear expires_at
      try {
        const { data: sub } = await supabaseAdmin
          .from('community_agent_subscriptions')
          .select('expires_at, status')
          .eq('pod_id', podId)
          .eq('status', 'active')
          .single();
        if (sub?.expires_at) {
          const remaining = Math.max(0, (new Date(sub.expires_at).getTime() - Date.now()) / 86400000);
          await supabaseAdmin
            .from('community_agent_subscriptions')
            .update({
              status: 'paused',
              remaining_days: remaining,
              paused_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('pod_id', podId)
            .eq('status', 'active');
        }
      } catch (err) {
        console.warn('[pod modules] subscription pause failed:', err);
      }
    } else if (!wasEnabled && nowEnabled) {
      // RESUME: restore remaining days → new expires_at
      try {
        const { data: sub } = await supabaseAdmin
          .from('community_agent_subscriptions')
          .select('remaining_days, status')
          .eq('pod_id', podId)
          .eq('status', 'paused')
          .single();
        if (sub?.remaining_days && sub.remaining_days > 0) {
          const newExpiry = new Date(Date.now() + sub.remaining_days * 86400000);
          await supabaseAdmin
            .from('community_agent_subscriptions')
            .update({
              status: 'active',
              expires_at: newExpiry.toISOString(),
              remaining_days: null,
              paused_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('pod_id', podId)
            .eq('status', 'paused');
        }
      } catch (err) {
        console.warn('[pod modules] subscription resume failed:', err);
      }
    }
  }

  // Ensure agent user_profiles row exists so it appears in @mention autocomplete
  if (updates.community_agent_enabled === true) {
    try {
      const agentCfg = prior?.community_agent_config || {};
      const agentWallet = agentCfg.agent_wallet || deriveAgentWallet(podId);
      const agentName = agentCfg.agent_name || 'Community Agent';
      await ensureAgentProfile(agentWallet, agentName);
    } catch (err) {
      console.warn('[pod modules] ensureAgentProfile failed:', err);
    }
  }

  // Pulse: emit one event per module toggled. Module name is normalized
  // (chat_enabled → chat) and event type encodes the new state.
  for (const [key, newValue] of Object.entries(updates)) {
    const priorValue = prior?.[key] ?? false;
    if (priorValue === newValue) continue; // no-op edits don't fire
    const moduleName = key.replace(/_enabled$/, '');
    const eventType = newValue ? 'pod_module_enabled' : 'pod_module_disabled';
    recordExplorerEvent({
      type: eventType,
      title: `${newValue ? 'Enabled' : 'Disabled'} ${moduleName} module`,
      actor: wallet,
      pod_id: podId,
      url: `/pods/${podId}`,
      metadata: { module: moduleName, new_value: newValue },
      // Per-(pod, module, transition-direction) — re-toggling fires again.
      // Including timestamp via Date.now() ensures successive toggles record.
      dedupe_key: `${eventType}:${podId}:${moduleName}:${Date.now()}`,
    }).catch((err) => console.warn('[pod modules] explorer event failed:', err));
  }

  // Special Pulse event when community agent is enabled — richer card in explorer
  if (updates.community_agent_enabled === true && !(prior?.community_agent_enabled)) {
    // Resolve pod name + agent name for a descriptive title
    const { data: podRow } = await supabaseAdmin
      .from('pods')
      .select('name')
      .eq('id', podId)
      .single();
    const agentCfg = prior?.community_agent_config || {};
    const agentName = agentCfg.agent_name || 'Community Agent';

    recordExplorerEvent({
      type: 'agent_enabled' as any,
      title: `${podRow?.name || 'A pod'} enabled a Community AI Agent`,
      actor: wallet,
      pod_id: podId,
      url: `/pods/${podId}`,
      metadata: { agent_name: agentName },
      dedupe_key: `agent_enabled:${podId}`,
    }).catch((err) => console.warn('[pod modules] agent_enabled event failed:', err));
  }

  // When sub_pods_enabled changes, sync subPodCreation on all role permissions for this pod
  if ('sub_pods_enabled' in updates) {
    try {
      const { data: roles } = await supabaseAdmin
        .from('pod_role_permissions')
        .select('id, permissions')
        .eq('pod_id', podId);

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

  return NextResponse.json({ modules: data });
}
