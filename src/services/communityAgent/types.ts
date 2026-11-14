// src/services/communityAgent/types.ts
import { PODS } from '@/config/deployment';
import { AGENT_GRANT_FUNDED_POD_IDS } from '@/config/deployment.server';

/** Default fallback pseudo-wallet. Each pod gets a unique derived address. */
export const AGENT_PSEUDO_WALLET = '0x000000000000000000000000000000000000ca10';

/**
 * Derive a unique deterministic pseudo-wallet for a pod's agent.
 * Format: 0x + "ca10" prefix + pod UUID hex (32 chars) + zero-padding to 40 hex total.
 * Result: valid 42-char Ethereum address (0x + 40 hex).
 */
export function deriveAgentWallet(podId: string): string {
  const hex = podId.replace(/-/g, ''); // 32 hex chars from UUID
  const padded = `ca10${hex}`.padEnd(40, '0'); // 4 + 32 + 4 zeros = 40 hex chars
  return `0x${padded}`.toLowerCase();
}

/**
 * Pod whose agent runs the dedicated Kairos persona and also draws on the
 * shared philosophy corpus. Configured with NEXT_PUBLIC_KAIROS_POD_ID; when
 * unset, every pod's agent uses the default persona.
 */
export const KAIROS_POD_ID: string | undefined = PODS.kairos;

/**
 * Pods whose agent operation is funded by DAO grant rather than a treasury
 * subscription payment. Grant funding waives the PAYMENT only — every agent,
 * grant-funded or not, is subject to the recurring existence referendum
 * (Congregant Phase 4). No pod's agent runs by default forever.
 */
export const GRANT_FUNDED_POD_IDS: string[] = AGENT_GRANT_FUNDED_POD_IDS;

/** @deprecated Use GRANT_FUNDED_POD_IDS — "exempt" meant payment only, never referendum */
export const EXEMPT_POD_IDS = GRANT_FUNDED_POD_IDS;

/** Days before renewal/expiry that the existence referendum opens */
export const REFERENDUM_LEAD_DAYS = 7;

/** Default referendum cadence for grant-funded agents (days) */
export const GRANT_REFERENDUM_CADENCE_DAYS = 90;

export type AgentTaskType =
  | 'daily_discussion'
  | 'mention_reply'
  | 'ritual'
  | 'comparative'
  | 'locate_me'
  | 'event_description'
  | 'current_events';

export type AgentPostStatus = 'draft' | 'posted' | 'failed';

export interface AgentConfig {
  podId: string;
  podName: string;
  agentName: string;
  agentWallet: string;
  pineconeNamespace: string;
  dailyPostHourUtc: number;
  dailyCategoryId: string | null;
  eventsCategoryId: string | null;
  persona: string;
  systemPrompt: string | null;
  autoPublishEvents: boolean;
  chatGroupIds: string[];
  /** Max @mention forum replies per day — pod-governable, not a code constant */
  maxForumRepliesPerDay: number;
  /** Max @mention chat replies per day — pod-governable, not a code constant */
  maxChatRepliesPerDay: number;
}

export interface AgentContentRequest {
  podId: string;
  taskType: AgentTaskType;
  context: {
    date: string;
    season: string;
    dayOfWeek: string;
    recentTopics?: string[];
    userMessage?: string;
    conversationHistory?: ConversationMessage[];
    eventTopic?: string;
  };
}

export interface AgentContentResponse {
  content: string;
  metadata: Record<string, any>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RelevantContext {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface SubscriptionStatus {
  isActive: boolean;
  expiresAt: string | null;
  isExempt: boolean;
  isPaused?: boolean;
  remainingDays?: number | null;
}
