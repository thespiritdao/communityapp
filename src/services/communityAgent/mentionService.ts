// src/services/communityAgent/mentionService.ts
//
// Detects @AgentName mentions in forum posts and chat messages.
// Extracts thread/conversation context for agent replies.

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getAgentConfig } from './configService';
import { AGENT_PSEUDO_WALLET, deriveAgentWallet, type ConversationMessage } from './types';

/**
 * Check if a message content contains a mention of the pod's community agent.
 * Mentions follow the pattern @[AgentName](walletAddress) from the UserTagging component.
 */
export async function checkForAgentMention(
  content: string,
  podId: string,
): Promise<boolean> {
  const config = await getAgentConfig(podId);
  if (!config) return false;

  const agentWallet = config.agentWallet || AGENT_PSEUDO_WALLET;
  const agentName = config.agentName;

  // Check for standard mention format: @[Name](address)
  if (content.includes(`(${agentWallet})`)) return true;

  // Check for name-based mention (case-insensitive)
  const namePattern = new RegExp(`@\\[${escapeRegex(agentName)}\\]`, 'i');
  if (namePattern.test(content)) return true;

  // Check for plain @AgentName mention (no markdown wrapper)
  const plainPattern = new RegExp(`@${escapeRegex(agentName)}\\b`, 'i');
  if (plainPattern.test(content)) return true;

  return false;
}

/**
 * Extract conversation context from a forum thread for the agent to respond to.
 */
export async function extractForumContext(
  threadId: string,
  triggerPostId: string,
): Promise<{
  userMessage: string;
  conversationHistory: ConversationMessage[];
  threadTitle: string;
}> {
  // Get the thread title and resolve pod for agent wallet lookup
  const { data: thread } = await supabaseAdmin
    .from('forum_threads')
    .select('title, content, category_id')
    .eq('id', threadId)
    .single();

  // Resolve per-pod agent wallet for message classification
  const agentWallets = new Set([AGENT_PSEUDO_WALLET]);
  if (thread?.category_id) {
    const podId = await getPodIdForCategory(thread.category_id);
    if (podId) {
      agentWallets.add(deriveAgentWallet(podId));
      const config = await getAgentConfig(podId);
      if (config?.agentWallet) agentWallets.add(config.agentWallet);
    }
  }

  // Get recent posts in the thread (last 10)
  const { data: posts } = await supabaseAdmin
    .from('forum_posts')
    .select('id, content, author_address, created_at')
    .eq('thread_id', threadId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(10);

  const history: ConversationMessage[] = [];
  let userMessage = '';

  if (posts) {
    for (const post of posts) {
      if (post.id === triggerPostId) {
        userMessage = stripMentionMarkup(post.content);
      } else {
        const isAgent = agentWallets.has(post.author_address);
        history.push({
          role: isAgent ? 'assistant' : 'user',
          content: stripMentionMarkup(post.content),
        });
      }
    }
  }

  // If triggerPostId is the thread's initial content (no post row), use thread content
  if (!userMessage && thread?.content) {
    userMessage = thread.content;
  }

  return {
    userMessage: userMessage || 'Hello',
    conversationHistory: history.slice(-6), // Last 3 exchanges
    threadTitle: thread?.title || '',
  };
}

/**
 * Extract conversation context from a chat group for the agent to respond to.
 */
export async function extractChatContext(
  chatGroupId: string,
  triggerMessageContent: string,
): Promise<{
  userMessage: string;
  conversationHistory: ConversationMessage[];
}> {
  // Resolve per-pod agent wallet for message classification
  const agentWallets = new Set([AGENT_PSEUDO_WALLET]);
  const podId = await getPodIdForChatGroup(chatGroupId);
  if (podId) {
    agentWallets.add(deriveAgentWallet(podId));
    const config = await getAgentConfig(podId);
    if (config?.agentWallet) agentWallets.add(config.agentWallet);
  }

  // Get recent messages in the chat (last 10)
  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('content, sender_wallet_id, created_at')
    .eq('chat_group_id', chatGroupId)
    .eq('is_direct_message', false)
    .order('created_at', { ascending: false })
    .limit(10);

  const history: ConversationMessage[] = [];

  if (messages) {
    const chronological = [...messages].reverse();
    for (const msg of chronological) {
      const isAgent = agentWallets.has(msg.sender_wallet_id);
      history.push({
        role: isAgent ? 'assistant' : 'user',
        content: stripMentionMarkup(msg.content),
      });
    }
  }

  return {
    userMessage: stripMentionMarkup(triggerMessageContent),
    conversationHistory: history.slice(-6),
  };
}

/**
 * Resolve which pod a forum category belongs to.
 */
async function getPodIdForCategory(categoryId: string): Promise<string | null> {
  const { data: category } = await supabaseAdmin
    .from('forum_categories')
    .select('pod_id')
    .eq('id', categoryId)
    .single();

  return category?.pod_id || null;
}

/**
 * Resolve which pod a forum thread belongs to (via category → pod_id).
 */
export async function getPodIdForThread(threadId: string): Promise<string | null> {
  const { data: thread } = await supabaseAdmin
    .from('forum_threads')
    .select('category_id')
    .eq('id', threadId)
    .single();

  if (!thread?.category_id) return null;

  return getPodIdForCategory(thread.category_id);
}

/**
 * Resolve which pod a chat group belongs to.
 */
export async function getPodIdForChatGroup(chatGroupId: string): Promise<string | null> {
  const { data: group } = await supabaseAdmin
    .from('chat_groups')
    .select('pod_id')
    .eq('id', chatGroupId)
    .single();

  return group?.pod_id || null;
}

/** Strip @[Name](address) markup from content, leaving just the name */
function stripMentionMarkup(content: string): string {
  return content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
