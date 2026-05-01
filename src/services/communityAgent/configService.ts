// src/services/communityAgent/configService.ts

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  AgentConfig,
  SubscriptionStatus,
  EXEMPT_POD_IDS,
  AGENT_PSEUDO_WALLET,
  TN_POD_ID,
  deriveAgentWallet,
} from './types';

/**
 * Get agent configuration for a specific pod.
 * Returns null if module is not enabled.
 */
export async function getAgentConfig(podId: string): Promise<AgentConfig | null> {
  const { data: modules } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_enabled, community_agent_config')
    .eq('pod_id', podId)
    .single();

  if (!modules?.community_agent_enabled) return null;

  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('name')
    .eq('id', podId)
    .single();

  const cfg = modules.community_agent_config || {};

  // Use per-pod derived wallet, falling back to config override or legacy pseudo wallet
  const agentWallet = cfg.agent_wallet || deriveAgentWallet(podId);

  return {
    podId,
    podName: pod?.name || 'Unknown Pod',
    agentName: cfg.agent_name || 'Community Agent',
    agentWallet,
    pineconeNamespace: cfg.pinecone_namespace || `agent-${podId}`,
    dailyPostHourUtc: cfg.daily_post_hour_utc ?? 12,
    dailyCategoryId: cfg.daily_category_id || null,
    eventsCategoryId: cfg.events_category_id || null,
    persona: cfg.persona || 'default',
    systemPrompt: cfg.system_prompt || null,
    autoPublishEvents: cfg.auto_publish_events ?? false,
    chatGroupIds: cfg.chat_group_ids || [],
  };
}

/**
 * Check if the community agent is fully active for a pod
 * (module enabled + subscription valid OR exempt)
 */
export async function isAgentActive(podId: string): Promise<boolean> {
  const config = await getAgentConfig(podId);
  if (!config) return false;

  const sub = await getSubscriptionStatus(podId);
  return sub.isActive || sub.isExempt;
}

/**
 * Get subscription status for a pod's community agent
 */
export async function getSubscriptionStatus(podId: string): Promise<SubscriptionStatus> {
  if (EXEMPT_POD_IDS.includes(podId)) {
    return { isActive: true, expiresAt: null, isExempt: true };
  }

  const { data: sub } = await supabaseAdmin
    .from('community_agent_subscriptions')
    .select('status, expires_at, remaining_days')
    .eq('pod_id', podId)
    .single();

  if (!sub) {
    return { isActive: false, expiresAt: null, isExempt: false };
  }

  // Paused subscriptions retain their remaining days
  if (sub.status === 'paused') {
    return {
      isActive: false,
      expiresAt: null,
      isExempt: false,
      isPaused: true,
      remainingDays: sub.remaining_days ?? 0,
    };
  }

  if (sub.status !== 'active') {
    return { isActive: false, expiresAt: null, isExempt: false };
  }

  const now = new Date();
  const expires = sub.expires_at ? new Date(sub.expires_at) : null;
  const isActive = !expires || expires > now;

  return {
    isActive,
    expiresAt: sub.expires_at,
    isExempt: false,
  };
}

/**
 * Get all pods with active community agents.
 * Used by cron jobs to iterate.
 */
export async function getActiveAgentPods(): Promise<AgentConfig[]> {
  const { data: rows } = await supabaseAdmin
    .from('pod_modules')
    .select('pod_id, community_agent_config')
    .eq('community_agent_enabled', true);

  if (!rows || rows.length === 0) return [];

  const configs: AgentConfig[] = [];

  for (const row of rows) {
    const podId = row.pod_id;
    const active = await isAgentActive(podId);
    if (!active) continue;

    const config = await getAgentConfig(podId);
    if (config) configs.push(config);
  }

  return configs;
}

/**
 * Update the community_agent_config JSONB for a pod.
 * Merges with existing config.
 * Also ensures the agent's user_profiles row exists with the correct name.
 */
export async function updateAgentConfig(
  podId: string,
  updates: Record<string, any>,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config')
    .eq('pod_id', podId)
    .single();

  const previousConfig = existing?.community_agent_config || {};

  // Auto-assign a per-pod wallet if not already set
  if (!previousConfig.agent_wallet && !updates.agent_wallet) {
    updates.agent_wallet = deriveAgentWallet(podId);
  }

  const merged = { ...previousConfig, ...updates };

  await supabaseAdmin
    .from('pod_modules')
    .update({
      community_agent_config: merged,
      updated_at: new Date().toISOString(),
    })
    .eq('pod_id', podId);

  // Ensure user_profiles row exists for the agent wallet
  const agentWallet = merged.agent_wallet || deriveAgentWallet(podId);
  const agentName = merged.agent_name || 'Community Agent';
  const agentAvatar = merged.agent_avatar_url || null;

  await ensureAgentProfile(agentWallet, agentName, agentAvatar);
}

/**
 * Create or update the user_profiles row for an agent wallet.
 * This is how the agent's name shows up in forum posts, chat messages, etc.
 */
export async function ensureAgentProfile(
  walletAddress: string,
  agentName: string,
  avatarUrl?: string | null,
): Promise<void> {
  const wallet = walletAddress.toLowerCase();

  // Check if profile already exists
  const { data: existing } = await supabaseAdmin
    .from('user_profiles')
    .select('wallet_address, first_name, profile_picture')
    .eq('wallet_address', wallet)
    .single();

  if (existing) {
    // Update name/avatar if changed
    const profileUpdates: Record<string, any> = { last_name: '(Agent)' };
    if (existing.first_name !== agentName) profileUpdates.first_name = agentName;
    if (avatarUrl && existing.profile_picture !== avatarUrl) profileUpdates.profile_picture = avatarUrl;

    if (Object.keys(profileUpdates).length > 1 || profileUpdates.first_name || profileUpdates.profile_picture) {
      await supabaseAdmin
        .from('user_profiles')
        .update(profileUpdates)
        .eq('wallet_address', wallet);
    }
  } else {
    // Insert new profile — use supabaseAdmin to bypass RLS (no auth.uid() for agents)
    await supabaseAdmin
      .from('user_profiles')
      .insert({
        wallet_address: wallet,
        first_name: agentName,
        last_name: '(Agent)',
        bio: `AI community agent`,
        has_membership: false,
        ...(avatarUrl ? { profile_picture: avatarUrl } : {}),
      });
  }
}
