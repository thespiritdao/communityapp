// src/services/communityAgent/agentService.ts
//
// Core LLM content generation for community agents.
// Routes to Kairos prompt for TN pod, default prompt for others.

import Anthropic from '@anthropic-ai/sdk';
import { getAgentConfig } from './configService';
import { queryAgentCorpus } from './corpusService';
import { buildKairosSystemPrompt } from './prompts/kairos';
import { buildDefaultSystemPrompt } from './prompts/default';
import {
  TN_POD_ID,
  type AgentContentRequest,
  type AgentContentResponse,
  type ConversationMessage,
} from './types';

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

/** Task types that use the more capable model */
const SONNET_TASKS = new Set([
  'daily_discussion',
  'mention_reply',
  'comparative',
  'current_events',
]);

function getSeasonalContext(date: string): string {
  const d = new Date(date);
  const month = d.getMonth(); // 0-indexed
  const day = d.getDate();
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });

  let season: string;
  if (month >= 2 && month <= 4) season = month === 2 && day < 20 ? 'late winter' : 'spring';
  else if (month >= 5 && month <= 7) season = month === 5 && day < 21 ? 'late spring' : 'summer';
  else if (month >= 8 && month <= 10) season = month === 8 && day < 22 ? 'late summer' : 'autumn';
  else season = month === 11 && day < 21 ? 'late autumn' : 'winter';

  // Check for threshold dates
  const thresholds: string[] = [];
  // Solstices
  if (month === 5 && day >= 18 && day <= 24) thresholds.push('summer solstice approaching');
  if (month === 11 && day >= 18 && day <= 24) thresholds.push('winter solstice approaching');
  // Equinoxes
  if (month === 2 && day >= 17 && day <= 23) thresholds.push('spring equinox approaching');
  if (month === 8 && day >= 19 && day <= 25) thresholds.push('autumn equinox approaching');

  return `Date: ${date}
Day: ${dayOfWeek}
Season: ${season} (Northern Hemisphere)${thresholds.length > 0 ? `\nUpcoming thresholds: ${thresholds.join(', ')}` : ''}`;
}

/**
 * Generate content for a community agent task.
 */
export async function generateAgentContent(
  request: AgentContentRequest,
): Promise<AgentContentResponse> {
  const config = await getAgentConfig(request.podId);
  if (!config) {
    throw new Error(`No agent config found for pod ${request.podId}`);
  }

  // Build seasonal context
  const seasonalContext = getSeasonalContext(request.context.date);

  // Retrieve RAG context from pod corpus
  const queryText = request.context.userMessage
    || request.context.eventTopic
    || `${request.context.season} ${request.context.dayOfWeek} ${request.taskType}`;

  const contexts = await queryAgentCorpus(request.podId, queryText);

  const contextString = contexts.length > 0
    ? contexts
        .map((ctx, idx) => `[Context ${idx + 1}] (${(ctx.score * 100).toFixed(0)}%)\n${ctx.content}`)
        .join('\n\n---\n\n')
    : '';

  // Build system prompt based on pod type
  let systemPrompt: string;
  if (request.podId === TN_POD_ID) {
    systemPrompt = buildKairosSystemPrompt(
      request.taskType,
      contextString,
      seasonalContext,
    );
  } else {
    systemPrompt = buildDefaultSystemPrompt(
      config.agentName,
      config.podName,
      config.systemPrompt,
      request.taskType,
      contextString,
      seasonalContext,
    );
  }

  // Add recent topics context if available
  if (request.context.recentTopics && request.context.recentTopics.length > 0) {
    systemPrompt += `\n\n## Recent Community Topics (avoid repetition)\n${request.context.recentTopics.join(', ')}`;
  }

  // Build messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (request.context.conversationHistory) {
    messages.push(...request.context.conversationHistory.slice(-6));
  }

  // Build the user message based on task type
  let userMessage: string;
  switch (request.taskType) {
    case 'daily_discussion':
      userMessage = `Generate a daily discussion prompt for ${request.context.dayOfWeek}, ${request.context.date}. Season: ${request.context.season}.`;
      break;
    case 'event_description':
      userMessage = `Generate a complete event description for this topic: ${request.context.eventTopic || 'community gathering'}. Include title, description, and what participants can expect.`;
      break;
    case 'current_events':
      userMessage = request.context.userMessage || 'Generate a current events framing post.';
      break;
    default:
      userMessage = request.context.userMessage || 'Hello';
      break;
  }

  messages.push({ role: 'user', content: userMessage });

  // Select model based on task type
  const useSonnet = SONNET_TASKS.has(request.taskType);
  const model = useSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const maxTokens = useSonnet ? 1500 : 1000;

  try {
    const response = await getAnthropic().messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.8,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent && 'text' in textContent ? textContent.text : '';

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return {
      content,
      metadata: {
        model,
        taskType: request.taskType,
        contextChunks: contexts.length,
        topScore: contexts.length > 0 ? contexts[0].score : 0,
        podId: request.podId,
        agentName: config.agentName,
      },
    };
  } catch (error: any) {
    console.error('[AgentService] LLM error:', error.message);
    throw error;
  }
}
