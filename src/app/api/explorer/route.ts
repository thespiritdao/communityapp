// src/app/api/explorer/route.ts
//
// Pulse activity feed. Reads from the unified `explorer_events` firehose —
// every feature that wants to surface activity writes a row there via
// recordExplorerEvent() in @/lib/explorerEvents.
//
// Response shape is preserved for backward compatibility with src/app/explorer
// and any other consumer (my-activity, etc.).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAbi, formatUnits } from 'viem';
import { createConfiguredPublicClient } from '@/utils/rpcClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Kept exported for callers (frontend imports this type).
export interface ExplorerEvent {
  id: string;
  type: string;
  timestamp: string;
  pod_id?: string;
  pod_name?: string;
  actor?: string;
  actor_address?: string;
  recipient_address?: string;
  title: string;
  amount?: string;
  url?: string;
  metadata?: Record<string, any>;
}

const LIMIT = 40;

// Frontend filter tab → DB category column.
// 'all' returns everything.
const TAB_TO_CATEGORY: Record<string, string> = {
  pods: 'pods',
  governance: 'governance',
  treasury: 'treasury',
  members: 'members',
  bounties: 'bounties',
  events: 'events',
  marketplace: 'marketplace',
  forum: 'forum',
  knowledge: 'knowledge',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get('type');
  const podFilter = searchParams.get('pod_id');
  const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    // ── Page of events ────────────────────────────────────────────────────────
    let query = supabaseAdmin
      .from('explorer_events')
      .select(
        'id, type, category, title, actor, recipient_address, pod_id, amount_value, amount_token, url, metadata, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offsetParam, offsetParam + LIMIT - 1);

    if (typeFilter && TAB_TO_CATEGORY[typeFilter]) {
      query = query.eq('category', TAB_TO_CATEGORY[typeFilter]);
    }
    if (podFilter) {
      query = query.eq('pod_id', podFilter);
    }

    const { data: rows, count, error } = await query;
    if (error) throw error;

    // ── Resolve pod names in one batch ────────────────────────────────────────
    const podIds = [
      ...new Set((rows ?? []).map((r: any) => r.pod_id).filter(Boolean) as string[]),
    ];
    let podNameMap: Record<string, string> = {};
    if (podIds.length > 0) {
      const { data: pods } = await supabaseAdmin
        .from('pods')
        .select('id, name')
        .in('id', podIds);
      (pods ?? []).forEach((p: any) => {
        podNameMap[p.id] = p.name;
      });
    }

    // ── Resolve actor wallet addresses → display names ────────────────────────
    const wallets = [
      ...new Set(
        (rows ?? [])
          .flatMap((r: any) => [r.actor, r.recipient_address])
          .filter(Boolean) as string[],
      ),
    ].map((w) => w.toLowerCase());

    let nameMap: Record<string, string> = {};
    if (wallets.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('wallet_address, first_name, last_name')
        .in('wallet_address', wallets);
      (profiles ?? []).forEach((p: any) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        if (name) nameMap[p.wallet_address.toLowerCase()] = name;
      });
    }

    const items: ExplorerEvent[] = (rows ?? []).map((r: any) => {
      // Compose the legacy `amount` display string. Prefer metadata.amount_display
      // if a writer pre-formatted it; otherwise build from amount_value + token.
      let amount: string | undefined;
      if (r.metadata?.amount_display) {
        amount = String(r.metadata.amount_display);
      } else if (r.amount_value && r.amount_token) {
        amount = `${r.amount_value} $${r.amount_token}`;
      }

      const actorLower = r.actor ? String(r.actor).toLowerCase() : undefined;
      return {
        id: r.id,
        type: r.type,
        timestamp: r.created_at,
        pod_id: r.pod_id ?? undefined,
        pod_name: r.pod_id ? podNameMap[r.pod_id] : r.metadata?.pod_name,
        actor: actorLower ? nameMap[actorLower] : undefined,
        actor_address: r.actor ?? undefined,
        recipient_address: r.recipient_address ?? undefined,
        title: r.title,
        amount,
        url: r.url ?? undefined,
        metadata: r.metadata ?? undefined,
      };
    });

    // ── Stat chips: upcoming events count + new-this-week count ───────────────
    const now = new Date().toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: totalActiveEvents }, { count: weeklyActiveEvents }] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('event_date', now),
      supabaseAdmin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('created_at', oneWeekAgo),
    ]);

    // ── Token supply (on-chain totalSupply) ───────────────────────────────────
    const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}` | undefined;
    const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}` | undefined;
    const erc20Abi = parseAbi(['function totalSupply() view returns (uint256)']);

    let systemTotal: string | null = null;
    let selfTotal: string | null = null;
    try {
      const publicClient = createConfiguredPublicClient();
      const calls: Promise<any>[] = [];
      if (SYSTEM_TOKEN) {
        calls.push(
          publicClient
            .readContract({ address: SYSTEM_TOKEN, abi: erc20Abi, functionName: 'totalSupply' })
            .then((v) => { systemTotal = formatUnits(v as bigint, 18); })
            .catch((e) => console.warn('[explorer] $SYSTEM totalSupply failed:', e.message)),
        );
      }
      if (SELF_TOKEN) {
        calls.push(
          publicClient
            .readContract({ address: SELF_TOKEN, abi: erc20Abi, functionName: 'totalSupply' })
            .then((v) => { selfTotal = formatUnits(v as bigint, 18); })
            .catch((e) => console.warn('[explorer] $SELF totalSupply failed:', e.message)),
        );
      }
      await Promise.all(calls);
    } catch (e) {
      console.warn('[explorer] Token supply query failed:', e);
    }

    return NextResponse.json({
      items,
      total: count ?? items.length,
      offset: offsetParam,
      limit: LIMIT,
      stats: {
        totalActiveEvents: totalActiveEvents ?? 0,
        weeklyActiveEvents: weeklyActiveEvents ?? 0,
      },
      tokenSupply: { systemTotal, selfTotal },
    });
  } catch (err) {
    console.error('[explorer] Error:', err);
    return NextResponse.json({ error: 'Failed to load explorer data' }, { status: 500 });
  }
}
