// src/services/communityAgent/chatHandler.ts
//
// Handles community agent mention detection in chat messages.
// When a user @mentions the agent, this generates a reply and inserts it.
// Runs asynchronously (fire-and-forget from the chat-messages API).

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { checkForAgentMention, extractChatContext } from './mentionService';
import { isAgentActive, getAgentConfig } from './configService';
import { generateAgentContent } from './agentService';
import { AGENT_PSEUDO_WALLET } from './types';
import { recordExplorerEvent } from '@/lib/explorerEvents';

const MAX_CHAT_REPLIES_PER_POD_PER_DAY = 20;

interface ChatMentionInput {
  content: string;
  senderWallet: string;
  chatGroupId: string;
  podId: string;
}

/**
 * Check if a chat message mentions the pod's community agent.
 * If so, generate a reply and insert it directly into chat_messages.
 */
export async function handleChatAgentMention(input: ChatMentionInput): Promise<void> {
  const { content, senderWallet, chatGroupId, podId } = input;

  // Check if agent is active for this pod
  const active = await isAgentActive(podId);
  if (!active) return;

  const config = await getAgentConfig(podId);
  if (!config) return;

  // Don't respond to own messages (check both per-pod wallet and legacy pseudo wallet)
  if (senderWallet === config.agentWallet || senderWallet === AGENT_PSEUDO_WALLET) return;

  // Check if message mentions the agent
  const isMentioned = await checkForAgentMention(content, podId);
  if (!isMentioned) return;

  // Check if this chat group is in the agent's configured list (empty = all groups in pod)
  if (config.chatGroupIds.length > 0 && !config.chatGroupIds.includes(chatGroupId)) {
    return;
  }

  // Rate limit: check daily reply count for this pod in chat
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabaseAdmin
    .from('community_agent_posts')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', podId)
    .eq('type', 'chat_reply')
    .gte('created_at', `${today}T00:00:00Z`);

  if ((count || 0) >= MAX_CHAT_REPLIES_PER_POD_PER_DAY) {
    console.log(`[ChatHandler] Rate limit reached for pod ${podId} (${count} replies today)`);
    return;
  }

  // Extract conversation context
  const context = await extractChatContext(chatGroupId, content);

  // Generate reply
  const now = new Date();
  const response = await generateAgentContent({
    podId,
    taskType: 'mention_reply',
    context: {
      date: now.toISOString().split('T')[0],
      season: getSeason(now),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      userMessage: context.userMessage,
      conversationHistory: context.conversationHistory,
    },
  });

  // Insert the agent's reply as a chat message (using admin to bypass RLS/auth)
  // Get the required_token from the chat group
  const { data: group } = await supabaseAdmin
    .from('chat_groups')
    .select('required_token')
    .eq('id', chatGroupId)
    .single();

  const { data: reply, error: replyError } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      content: response.content,
      sender_wallet_id: config.agentWallet,
      chat_group_id: chatGroupId,
      required_token: group?.required_token || '',
      attachments: '[]',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (replyError) {
    console.error(`[ChatHandler] Failed to insert agent reply:`, replyError);
    return;
  }

  // Log to community_agent_posts
  await supabaseAdmin.from('community_agent_posts').insert({
    pod_id: podId,
    type: 'chat_reply',
    content: response.content,
    metadata: {
      ...response.metadata,
      chat_group_id: chatGroupId,
      message_id: reply.id,
      triggered_by: senderWallet,
    },
    status: 'posted',
  });

  // Fire Pulse event
  recordExplorerEvent({
    type: 'chat_agent_reply',
    title: `${config.agentName} replied in chat`,
    actor: config.agentWallet,
    pod_id: podId,
    url: `/chat/${chatGroupId}`,
    metadata: { agent: true, agent_name: config.agentName },
    dedupe_key: `agent-chat-reply-${reply.id}`,
  }).catch(() => {});

  console.log(`[ChatHandler] Agent ${config.agentName} replied in chat ${chatGroupId}`);
}

function getSeason(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}
