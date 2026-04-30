// src/services/communityAgent/types.ts

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

export const TN_POD_ID = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
export const EXEC_POD_ID = 'e35c9e25-c5f6-4b97-a1d3-4c2e5b6d8f90';

/** Pods exempt from subscription payment */
export const EXEMPT_POD_IDS = [TN_POD_ID, EXEC_POD_ID];

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
}
