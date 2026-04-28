// src/app/api/pods/[id]/modules/route.ts
// GET/PUT pod_modules — uses supabaseAdmin to bypass RLS.
// Auth: caller must be a pod leader (pod_leads array or pod_members with role=leader).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { recordExplorerEvent } from '@/lib/explorerEvents';

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
