// src/services/communityAgent/crisisService.ts
//
// Crisis protocol for community agents (Congregant Phase 7; Kairos spec §7).
//
// When a member's message to the agent contains language suggesting acute
// distress or self-harm, the agent must NOT improvise. The response below is
// FIXED TEXT — written by humans, reviewed by humans, never generated — and
// the model is never invoked for these messages. Pod leadership is notified
// discreetly (that the protocol fired, never the message content).
//
// The detection is deliberately high-recall within a narrow domain: a false
// positive costs a warm message with a hotline number; a false negative
// costs far more.

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';

/** Patterns indicating acute distress / self-harm ideation. Lowercase match. */
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(ing)? myself\b/,
  /\bend(ing)? my (own )?life\b/,
  /\bsuicid(e|al)\b/,
  /\bself[- ]?harm\b/,
  /\bhurt(ing)? myself\b/,
  /\bcut(ting)? myself\b/,
  /\bdon'?t want to (live|be alive|exist|go on)\b/,
  /\bno reason to (live|keep going|go on)\b/,
  /\bbetter off dead\b/,
  /\bbetter off without me\b/,
  /\bwant to die\b/,
  /\bend it all\b/,
  /\btake my (own )?life\b/,
];

export function detectCrisis(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return CRISIS_PATTERNS.some((p) => p.test(normalized));
}

/**
 * The fixed crisis response. Human-written; the agent names its own limits
 * and routes toward human help. Never modify via config or prompt.
 */
export function crisisResponse(agentName: string): string {
  return [
    `I hear you, and I'm glad you said something. What you're carrying sounds heavy, and it matters.`,
    ``,
    `I need to be honest with you: I'm ${agentName}, an AI, and this is beyond what I can hold with you. You deserve a human being — someone who can really listen, right now.`,
    ``,
    `**If you're in the US, please call or text 988** (Suicide & Crisis Lifeline — free, confidential, 24/7). Outside the US, you can find international lines at findahelpline.com.`,
    ``,
    `And if you can, reach out to someone in this community — you are known here, and people would want to know how you're doing. You don't have to carry this alone.`,
  ].join('\n');
}

/**
 * Discreet leader notification: the protocol fired for the pod — never the
 * member's identity or message content. Leaders are stewards of the space,
 * not surveillance.
 */
export async function notifyCrisisProtocolFired(podId: string, surface: 'forum' | 'chat'): Promise<void> {
  try {
    const { data: pod } = await supabaseAdmin
      .from('pods')
      .select('pod_leads, name')
      .eq('id', podId)
      .single();
    if (!pod?.pod_leads?.length) return;

    await sendServerNotificationBatch(
      pod.pod_leads.map((lead: string) => ({
        recipient_address: lead.toLowerCase(),
        sender_address: 'system',
        notification_type: 'community_agent_expiring', // reuse an allowed type; title carries meaning
        title: 'Community agent crisis protocol activated',
        message:
          `A message to ${pod.name}'s community agent (in ${surface}) triggered the crisis protocol. ` +
          `The member received crisis resources (988 lifeline). No message content or identity is shared here — ` +
          `please be gently attentive to the community.`,
        context_url: `/pods/${podId}/manage`,
        context_type: 'pod',
        context_id: podId,
        priority: 'urgent' as const,
      })),
    );
  } catch (err) {
    console.error('[crisisService] leader notification failed:', err);
  }
}
