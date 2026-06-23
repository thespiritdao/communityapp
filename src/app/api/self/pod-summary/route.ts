// src/app/api/self/pod-summary/route.ts
// Read-only per-epoch $SELF summary for a pod, for the treasury tab.
//
// Returns, per epoch (newest first): allocated hours (capacity), minted hours
// (distributed), remaining ("held" capacity), and the count of distinct
// recipients that epoch. Any authenticated user may read (governance-
// transparency data, same as the Pulse feed / ledger RLS).
//
// GET ?podId=<uuid>

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    const podId = req.nextUrl.searchParams.get('podId');
    if (!podId) {
      return NextResponse.json({ error: 'Missing podId' }, { status: 400 });
    }

    // Budgets (allocated vs minted) per epoch.
    const { data: budgets, error: bErr } = await supabase
      .from('pod_self_budgets')
      // ::text — preserve full NUMERIC precision (bare NUMERIC → JS float
      // truncates values ≥ 2^53, e.g. 500e18 budgets). BigInt parses the string.
      .select('epoch, allocated_hours::text, minted_hours::text, source')
      .eq('pod_id', podId)
      .order('epoch', { ascending: false });
    if (bErr) throw bErr;

    // Distinct minted recipients per epoch (distribution breadth).
    const { data: minted, error: mErr } = await supabase
      .from('self_mint_queue')
      .select('epoch, wallet')
      .eq('pod_id', podId)
      .eq('status', 'minted');
    if (mErr) throw mErr;

    const recipientsByEpoch = new Map<number, Set<string>>();
    for (const r of minted || []) {
      if (!recipientsByEpoch.has(r.epoch)) recipientsByEpoch.set(r.epoch, new Set());
      recipientsByEpoch.get(r.epoch)!.add(String(r.wallet).toLowerCase());
    }

    const HOUR = 10n ** 18n;
    const toH = (wei: string): number => {
      try { return Number((BigInt(wei) * 100n) / HOUR) / 100; } catch { return 0; }
    };

    const epochs = (budgets || []).map((b) => {
      const allocated = toH(b.allocated_hours);
      const minted_ = toH(b.minted_hours);
      return {
        epoch: b.epoch,
        allocatedHours: allocated,
        distributedHours: minted_,
        remainingHours: Math.max(0, allocated - minted_),
        recipients: recipientsByEpoch.get(b.epoch)?.size ?? 0,
        source: b.source,
      };
    });

    const current = epochs[0] ?? null;
    return NextResponse.json({ current, epochs });
  } catch (error) {
    console.error('❌ self/pod-summary error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
