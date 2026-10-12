// src/app/api/explorer/export/route.ts
//
// GET: Public, versioned export of the activity ledger (Congregant Phase 6).
//
// "Parasocieties should be built to be studiable by their own members. The
//  graph of interaction between kinds of minds should not be a proprietary
//  exhaust stream; it should be part of the commons the community governs."
//
// Human and artificial acts are commensurable entries: every event carries
// actor_type ('human' | 'agent'), stamped by the database, not the writer.
//
// Query params:
//   from, to    — ISO timestamps (period filter; to is exclusive)
//   actor_type  — 'human' | 'agent'
//   pod_id      — filter to one pod
//   cursor      — opaque pagination cursor from a previous response
//   limit       — page size, max 1000 (default 200)
//   anchors=1   — return Merkle anchor records instead of events
//
// Verification: recompute leaves per the leaf_formula in any anchor record
// over the same period and compare with the LedgerAnchor contract on Base.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { rateLimiters, getClientIp } from '@/lib/ratelimit';
import { LEAF_FORMULA } from '@/lib/ledgerMerkle';
import { getWalletFromRequest } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

const EXPORT_VERSION = 'v1';
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

const LEDGER_ANCHOR = process.env.NEXT_PUBLIC_LEDGER_ANCHOR ||
  '0xDbcE1A7cA8a3C887D4E112FE36994D545e032b21';

/** Public fields only — mirrors exactly what the Merkle leaf covers, plus display fields */
const EVENT_FIELDS = 'id, type, category, title, actor, actor_type, recipient_address, pod_id, amount_value, amount_token, url, created_at';

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Rate limit per IP — fail open on limiter errors (read-only endpoint)
  try {
    const { success, reset } = await rateLimiters.explorerExport.limit(getClientIp(req));
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } },
      );
    }
  } catch {
    // limiter unavailable — allow
  }

  const params = req.nextUrl.searchParams;

  // ── Anchor records mode ────────────────────────────────────────────────
  if (params.get('anchors') === '1') {
    const { data: anchors } = await supabaseAdmin
      .from('ledger_anchors')
      .select('period_start, period_end, event_count, merkle_root, leaf_formula, onchain_index, tx_hash, anchored_at')
      .order('period_end', { ascending: false })
      .limit(100);
    return NextResponse.json({
      version: EXPORT_VERSION,
      anchorContract: LEDGER_ANCHOR,
      anchorContractUrl: `https://basescan.org/address/${LEDGER_ANCHOR}`,
      anchors: anchors ?? [],
    });
  }

  // ── Events mode ────────────────────────────────────────────────────────
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT));

  let query = supabaseAdmin
    .from('explorer_events')
    .select(EVENT_FIELDS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  const from = params.get('from');
  const to = params.get('to');
  const actorType = params.get('actor_type');
  const podId = params.get('pod_id');
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lt('created_at', to);
  if (actorType && ['human', 'agent'].includes(actorType)) query = query.eq('actor_type', actorType);
  if (podId) query = query.eq('pod_id', podId);

  const cursor = params.get('cursor');
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    // Keyset pagination on (created_at, id)
    query = query.or(
      `created_at.gt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.gt.${decoded.id})`,
    );
  }

  const { data: events, error } = await query;
  if (error) {
    console.error('[explorer/export] query failed:', error);
    return NextResponse.json({ error: 'Export query failed' }, { status: 500 });
  }

  // Privacy: titles of member_introduced events embed the member's chosen
  // name. Redact for unauthenticated callers. `title` is not a leaf field
  // (see LEAF_FORMULA), so Merkle verification is unaffected.
  const viewer = await getWalletFromRequest(req);
  const out = viewer
    ? events ?? []
    : (events ?? []).map((e: any) =>
        e.type === 'member_introduced' ? { ...e, title: 'A member joined SpiritDAO' } : e,
      );

  const last = events?.[events.length - 1];
  return NextResponse.json({
    version: EXPORT_VERSION,
    leafFormula: LEAF_FORMULA,
    anchorContract: LEDGER_ANCHOR,
    count: events?.length ?? 0,
    nextCursor: last && events!.length === limit ? encodeCursor(last.created_at, last.id) : null,
    events: out,
  });
}
