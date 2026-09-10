// src/lib/explorerEvents.ts
//
// Single entry point for writing Pulse activity rows.
// Every feature that wants to surface an event in /explorer goes through
// recordExplorerEvent() — that gives us one place to evolve the schema,
// one place to enforce throttling, and one place to add validation later.
//
// Server-only: uses the service-role admin client because the explorer_events
// table is INSERT-restricted to service_role.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Type registry ─────────────────────────────────────────────────────────────
// Adding a new event type = add an entry here, then call recordExplorerEvent()
// from the writer. The Pulse UI category mapping flows from `category`.

export type ExplorerCategory =
  | 'pods'
  | 'governance'
  | 'treasury'
  | 'members'
  | 'bounties'
  | 'events'
  | 'marketplace'
  | 'forum'
  | 'knowledge'
  | 'surveys'
  | 'places';

export type ExplorerEventType =
  // pods
  | 'pod_created'
  | 'pod_activated'
  | 'pod_vetoed'
  | 'pod_deletion_proposed'
  | 'pod_module_enabled'
  | 'pod_module_disabled'
  | 'pod_face_published'
  // members
  | 'member_introduced'
  | 'member_joined'
  | 'member_joined_via_referral'
  | 'pod_member_applied'
  | 'pod_member_approved'
  | 'pod_member_rejected'
  | 'hat_minted'
  | 'hat_burned'
  | 'hat_renounced'
  | 'profile_updated'
  // governance
  | 'proposal_created'
  | 'proposal_queued'
  | 'proposal_executed'
  | 'proposal_defeated'
  | 'proposal_canceled'
  | 'vote_cast'
  // treasury
  | 'treasury_movement'
  | 'donation'
  | 'gift'
  | 'burn'
  // bounties
  | 'bounty_created'
  | 'bounty_completed'
  | 'work_submitted'
  | 'work_approved'
  | 'work_rejected'
  | 'bid_placed'
  | 'bid_accepted'
  | 'bid_rejected'
  | 'bid_review_submitted'
  | 'milestone_reached'
  | 'dispute_opened'
  | 'dispute_evidence_added'
  | 'dispute_mediator_assigned'
  | 'dispute_resolved'
  // events
  | 'event_published'
  | 'event_rsvp'
  | 'event_escrow_held'
  | 'event_escrow_released'
  | 'event_tokens_distributed'
  // marketplace
  | 'marketplace_purchase'
  | 'marketplace_listing_created'
  | 'marketplace_listing_updated'
  | 'marketplace_order_fulfilled'
  | 'marketplace_order_shipped'
  | 'marketplace_order_refunded'
  | 'marketplace_order_cancelled'
  // forum
  | 'forum_thread_created'
  | 'forum_post_created'
  | 'forum_poll_created'
  | 'forum_poll_voted'
  | 'forum_post_reaction'
  | 'forum_moderator_action'
  | 'forum_thread_summary_published'
  | 'forum_thread_resolved'
  | 'forum_thread_bookmarked'
  // knowledge
  | 'knowledge_item_published'
  | 'knowledge_item_updated'
  // chat milestones
  | 'chat_channel_created'
  | 'chat_first_message_in_pod'
  | 'chat_agent_reply'
  // community agent
  | 'agent_enabled'
  // surveys
  | 'survey_published'
  | 'survey_response_submitted'
  // places (pod shared map)
  | 'place_added'
  | 'place_updated'
  | 'place_removed';

export const EVENT_CATEGORY: Record<ExplorerEventType, ExplorerCategory> = {
  pod_created: 'pods',
  pod_activated: 'pods',
  pod_vetoed: 'pods',
  pod_deletion_proposed: 'pods',
  pod_module_enabled: 'pods',
  pod_module_disabled: 'pods',
  pod_face_published: 'pods',

  member_introduced: 'members',
  member_joined: 'members',
  member_joined_via_referral: 'members',
  pod_member_applied: 'members',
  pod_member_approved: 'members',
  pod_member_rejected: 'members',
  hat_minted: 'members',
  hat_burned: 'members',
  hat_renounced: 'members',
  profile_updated: 'members',

  proposal_created: 'governance',
  proposal_queued: 'governance',
  proposal_executed: 'governance',
  proposal_defeated: 'governance',
  proposal_canceled: 'governance',
  vote_cast: 'governance',

  treasury_movement: 'treasury',
  donation: 'treasury',
  gift: 'treasury',
  burn: 'treasury',

  bounty_created: 'bounties',
  bounty_completed: 'bounties',
  work_submitted: 'bounties',
  work_approved: 'bounties',
  work_rejected: 'bounties',
  bid_placed: 'bounties',
  bid_accepted: 'bounties',
  bid_rejected: 'bounties',
  bid_review_submitted: 'bounties',
  milestone_reached: 'bounties',
  dispute_opened: 'bounties',
  dispute_evidence_added: 'bounties',
  dispute_mediator_assigned: 'bounties',
  dispute_resolved: 'bounties',

  event_published: 'events',
  event_rsvp: 'events',
  event_escrow_held: 'events',
  event_escrow_released: 'events',
  event_tokens_distributed: 'events',

  marketplace_purchase: 'marketplace',
  marketplace_listing_created: 'marketplace',
  marketplace_listing_updated: 'marketplace',
  marketplace_order_fulfilled: 'marketplace',
  marketplace_order_shipped: 'marketplace',
  marketplace_order_refunded: 'marketplace',
  marketplace_order_cancelled: 'marketplace',

  forum_thread_created: 'forum',
  forum_post_created: 'forum',
  forum_poll_created: 'forum',
  forum_poll_voted: 'forum',
  forum_post_reaction: 'forum',
  forum_moderator_action: 'forum',
  forum_thread_summary_published: 'forum',
  forum_thread_resolved: 'forum',
  forum_thread_bookmarked: 'forum',

  knowledge_item_published: 'knowledge',
  knowledge_item_updated: 'knowledge',

  chat_channel_created: 'members',
  chat_first_message_in_pod: 'members',
  chat_agent_reply: 'members',

  agent_enabled: 'pods',

  survey_published: 'surveys',
  survey_response_submitted: 'surveys',

  place_added: 'places',
  place_updated: 'places',
  place_removed: 'places',
};

// ── Helper ────────────────────────────────────────────────────────────────────

export interface ExplorerEventInput {
  type: ExplorerEventType;
  title: string;
  actor?: string | null;
  recipient_address?: string | null;
  pod_id?: string | null;
  amount_value?: number | string | null;
  amount_token?: string | null;
  url?: string | null;
  metadata?: Record<string, any> | null;
  /**
   * Stable string that uniquely identifies this event. If provided, repeated
   * inserts with the same dedupe_key are silently no-ops. Use for backfills
   * and for writers that may retry on the same source row (e.g. status
   * transitions where the trigger could fire twice).
   * Convention: `<type>:<source_id>`, e.g. "proposal_executed:0xabc..."
   */
  dedupe_key?: string | null;
}

let cachedAdmin: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  cachedAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return cachedAdmin;
}

/**
 * Write a single Pulse event. Failures are logged, never thrown — recording
 * an activity row should NEVER break the user-facing operation that produced
 * it. If you need to know whether the write succeeded, inspect the return.
 */
export async function recordExplorerEvent(
  input: ExplorerEventInput,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const category = EVENT_CATEGORY[input.type];
    if (!category) {
      console.warn('[explorerEvents] unknown type:', input.type);
      return { ok: false, error: 'unknown_type' };
    }

    const row = {
      type: input.type,
      category,
      title: input.title,
      actor: input.actor ? input.actor.toLowerCase() : null,
      recipient_address: input.recipient_address
        ? input.recipient_address.toLowerCase()
        : null,
      pod_id: input.pod_id ?? null,
      amount_value:
        input.amount_value === undefined || input.amount_value === null
          ? null
          : String(input.amount_value),
      amount_token: input.amount_token ?? null,
      url: input.url ?? null,
      metadata: input.metadata ?? {},
      dedupe_key: input.dedupe_key ?? null,
    };

    const { error } = await getAdminClient()
      .from('explorer_events')
      .insert(row);

    if (error) {
      // 23505 = unique_violation on dedupe_key — expected for retries/backfill.
      if (error.code === '23505') return { ok: true, skipped: true };
      console.error('[explorerEvents] insert failed:', error.message, input.type);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('[explorerEvents] unexpected error:', e?.message);
    return { ok: false, error: e?.message ?? 'unknown' };
  }
}

// ── Throttle helpers ──────────────────────────────────────────────────────────
//
// Some event types are noisy (forum posts, profile updates). These helpers
// check the most recent matching row for a key and skip the insert if it's
// inside the cooldown window.

interface ThrottleArgs {
  type: ExplorerEventType;
  key: string;            // e.g. "user:0xabc:thread:42" — what we throttle on
  windowSeconds: number;  // skip if a row matched within this window
}

/**
 * Returns true if a write is allowed (no recent matching row), false if it
 * should be skipped. Stores the throttle key in metadata.throttle_key so we
 * can query it back. Cheap (indexed by created_at + filtered jsonb).
 */
export async function shouldRecordThrottled(args: ThrottleArgs): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - args.windowSeconds * 1000).toISOString();
    const { data } = await getAdminClient()
      .from('explorer_events')
      .select('id')
      .eq('type', args.type)
      .gte('created_at', cutoff)
      .contains('metadata', { throttle_key: args.key })
      .limit(1)
      .maybeSingle();
    return !data;
  } catch (e) {
    // On error, default to allow — better to over-record than under-record.
    console.warn('[explorerEvents] throttle check failed, allowing write:', e);
    return true;
  }
}
