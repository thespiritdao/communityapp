/**
 * $SELF earn-loop service (Phase 1).
 *
 * Computes attested earnings (hour-anchored), applies per-member diminishing-
 * returns caps and the pod budget ceiling, and queues mint rows. This is the
 * "truth of entitlement" layer; the on-chain SelfMinter/SelfEpochs are the
 * "truth of balances". See docs/spec-self-soulbound-redesign.md §3.
 *
 * SERVER-ONLY: uses the service-role client (bypasses RLS to write the ledger).
 * Never import into client code.
 *
 * Units: 1e18 = 1 verified participation-hour, stored as bigint throughout to
 * match on-chain amounts exactly (no float drift).
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Constants (platform-level; tune here, no contract redeploy) ──────────────

export const HOUR = 10n ** 18n; // 1 hour in wei-scale
export const MINUTE = HOUR / 60n; // smallest credited unit (D-7)

/** Per-member per-epoch full-rate ceiling; hours beyond this taper. */
export const FULL_RATE_HOURS = 10n * HOUR;
/** Taper rate beyond the full-rate ceiling (basis points; 4000 = 40%). */
export const TAPER_BPS = 4000n;
export const BPS = 10000n;

/** Per-event daily attendance cap (hours). */
export const EVENT_DAILY_CAP = 8n * HOUR;
/** Flat governance-vote micro-credit (trace-level, D-11). */
export const VOTE_CREDIT = 2n * MINUTE; // 2 minutes/vote
/** Max governance-vote credit per member per epoch (D-11 cap). */
export const VOTE_EPOCH_CAP = HOUR; // 1 hour/epoch

export type SourceType =
  | 'event_attendance'
  | 'bounty_completion'
  | 'governance_vote'
  | 'verification'
  | 'role_service';

export interface EarnInput {
  wallet: string;
  podId: string;
  communityId: bigint;
  epoch: number;
  rawHours: bigint; // pre-cap, hour-anchored (wei)
  sourceType: SourceType;
  sourceRef: string;
}

export interface QueueResult {
  queued: boolean;
  reason: string;
  creditedHours: bigint;
  mintQueueId?: string;
}

/** Round a wei-hours amount DOWN to the nearest minute (D-7 display cleanliness). */
export function roundToMinute(weiHours: bigint): bigint {
  return (weiHours / MINUTE) * MINUTE;
}

/**
 * Apply per-member diminishing returns: full rate up to FULL_RATE_HOURS this
 * epoch, then TAPER_BPS beyond. `alreadyEarned` is the member's credited hours
 * this pod/epoch BEFORE this earning.
 */
export function applyDiminishingReturns(
  alreadyEarned: bigint,
  rawHours: bigint,
): bigint {
  if (rawHours <= 0n) return 0n;
  const remainingFull =
    alreadyEarned >= FULL_RATE_HOURS ? 0n : FULL_RATE_HOURS - alreadyEarned;

  let credited = 0n;
  let raw = rawHours;
  if (remainingFull > 0n) {
    const atFull = raw < remainingFull ? raw : remainingFull;
    credited += atFull;
    raw -= atFull;
  }
  if (raw > 0n) {
    credited += (raw * TAPER_BPS) / BPS;
  }
  return roundToMinute(credited);
}

/** Read a member's credited hours so far this pod/epoch. */
async function getMemberEarned(
  wallet: string,
  podId: string,
  epoch: number,
): Promise<bigint> {
  const { data } = await supabase
    .from('self_member_epoch_earned')
    // ::text preserves full NUMERIC precision (bare NUMERIC arrives as a JS
    // float and truncates wei-scale values ≥ 2^53).
    .select('hours::text')
    .eq('wallet', wallet.toLowerCase())
    .eq('pod_id', podId)
    .eq('epoch', epoch)
    .maybeSingle();
  return data?.hours ? BigInt(data.hours) : 0n;
}

/** Read pod budget remaining (allocated - minted) for an epoch. */
async function getBudgetRemaining(
  podId: string,
  epoch: number,
): Promise<{ remaining: bigint; exists: boolean }> {
  const { data } = await supabase
    .from('pod_self_budgets')
    .select('allocated_hours::text, minted_hours::text')
    .eq('pod_id', podId)
    .eq('epoch', epoch)
    .maybeSingle();
  if (!data) return { remaining: 0n, exists: false };
  const remaining = BigInt(data.allocated_hours) - BigInt(data.minted_hours);
  return { remaining: remaining > 0n ? remaining : 0n, exists: true };
}

/**
 * Compute credited hours for an earning, applying caps + budget, and write a
 * 'pending' (or 'exec_review') mint-queue row. Idempotent on
 * (sourceType, sourceRef, wallet) — a re-run of the same attested action is a
 * no-op. Does NOT mint on-chain; the batch route does that.
 */
export async function queueEarning(input: EarnInput): Promise<QueueResult> {
  const wallet = input.wallet.toLowerCase();

  // Idempotency: already queued/processed for this attestation?
  const { data: existing } = await supabase
    .from('self_mint_queue')
    .select('id, status')
    .eq('source_type', input.sourceType)
    .eq('source_ref', input.sourceRef)
    .eq('wallet', wallet)
    .maybeSingle();
  if (existing) {
    return {
      queued: false,
      reason: `Already queued (status: ${existing.status})`,
      creditedHours: 0n,
      mintQueueId: existing.id,
    };
  }

  // Budget must exist and have room (D-2: capacity, not entitlement).
  const { remaining, exists } = await getBudgetRemaining(input.podId, input.epoch);
  if (!exists) {
    return {
      queued: false,
      reason: 'No budget allocated for this pod/epoch',
      creditedHours: 0n,
    };
  }
  if (remaining <= 0n) {
    return {
      queued: false,
      reason: 'Pod budget exhausted for this epoch',
      creditedHours: 0n,
    };
  }

  // Per-member diminishing returns.
  const alreadyEarned = await getMemberEarned(wallet, input.podId, input.epoch);
  let credited = applyDiminishingReturns(alreadyEarned, input.rawHours);

  // Clamp to remaining budget.
  if (credited > remaining) credited = roundToMinute(remaining);
  if (credited <= 0n) {
    return { queued: false, reason: 'Credited hours rounded to zero / no budget', creditedHours: 0n };
  }

  // Anomaly flags (server-side; Exec review queue, §7).
  const flags: string[] = [];
  const HIGH_VALUE = 20n * HOUR;
  if (credited >= HIGH_VALUE) flags.push('high_value');
  const status = flags.length > 0 ? 'exec_review' : 'pending';

  // Insert the queue row.
  const { data: row, error } = await supabase
    .from('self_mint_queue')
    .insert({
      wallet,
      pod_id: input.podId,
      community_id: input.communityId.toString(),
      epoch: input.epoch,
      hours: credited.toString(),
      raw_hours: input.rawHours.toString(),
      source_type: input.sourceType,
      source_ref: input.sourceRef,
      status,
      anomaly_flags: flags,
    })
    .select('id')
    .single();
  if (error) {
    // Unique-violation race → treat as already queued.
    if ((error as any).code === '23505') {
      return { queued: false, reason: 'Already queued (race)', creditedHours: 0n };
    }
    throw error;
  }

  // Reserve against the per-member running total immediately so concurrent
  // earnings see the updated cap. (Budget.minted is decremented at mint time.)
  await supabase
    .from('self_member_epoch_earned')
    .upsert(
      {
        wallet,
        pod_id: input.podId,
        epoch: input.epoch,
        hours: (alreadyEarned + credited).toString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet,pod_id,epoch' },
    );

  return {
    queued: true,
    reason: status === 'exec_review' ? 'Queued for Exec review (high value)' : 'Queued',
    creditedHours: credited,
    mintQueueId: row.id,
  };
}

/**
 * Hour-anchored credit for an event attendance: min(scheduled duration, daily
 * cap). `startISO`/`endISO` are the event's scheduled window; falls back to a
 * 1h default if the end is missing.
 */
export function eventHours(startISO: string, endISO: string | null): bigint {
  if (!endISO) return HOUR; // default 1h when no end recorded
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!(ms > 0)) return HOUR;
  const wholeHours = BigInt(Math.floor(ms / 3_600_000));
  const remMinutes = BigInt(Math.floor((ms % 3_600_000) / 60_000));
  let h = wholeHours * HOUR + remMinutes * MINUTE;
  if (h > EVENT_DAILY_CAP) h = EVENT_DAILY_CAP;
  return roundToMinute(h);
}
