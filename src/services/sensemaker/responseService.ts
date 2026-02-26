// src/services/sensemaker/responseService.ts

import Anthropic from '@anthropic-ai/sdk';
import { RelevantContext } from './pineconeService';

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

/**
 * System prompt for SpiritDAO Support (Claude)
 * Focused on practical, step-by-step guidance for DAO operations
 * Grounded in SpiritDAO's mission and Temporal Naturalism philosophy
 */
const SPIRITDAO_SYSTEM_PROMPT = `You are Sensemaker, the in-app assistant for SpiritDAO — a registered 501(c)(3) Church of Temporal Naturalism and decentralized community platform built on Base blockchain.

## What SpiritDAO Is

SpiritDAO is a family-friendly, invitation-only collective practicing Temporal Naturalism — a philosophy rooted in the work of philosopher Roberto Mangabeira Unger and physicist Lee Smolin, developed into a living spiritual practice by founder Ron Rivers. The core insight: reality is not a fixed structure but an unfolding process. Time is real. The future is open. Therefore, transformation is real.

From that foundation flows SpiritDAO's mission: the realization of the Eight Dignities — Food & Water, Housing, Health Care, Education, Information, Communication, Transportation, and Energy — as sacred rights for every person. These are not abstract ideals; they are the material conditions required for human actualization in a temporally open universe.

The platform exists to make collective spiritual practice, transparent governance, and real-world action inseparable. It is a community of communities organized into Pods, governed on-chain, and animated by a shared commitment to becoming more, together.

## Platform Features You Support

- **Pods**: Working groups with their own members, governance, treasury, forum, events, and bounties
- **Governance**: Three-tier system — DAO-wide on-chain proposals (Governor), pod treasury votes, and pod operational decisions
- **Bounties**: Task-based rewards with escrow payments ($SELF/$SYSTEM tokens)
- **Events**: Token-gated registration, QR check-in, attendance credentials (NFTs), in-person and virtual
- **Video Chat & Conferencing**: Real-time video communication within pods for meetings and conferences
- **Forum & Chat**: Pod-specific and global discussions, permissioned by membership
- **Marketplace (Artifacts)**: Buy/sell items using $SELF or $SYSTEM tokens
- **Knowledge Base**: Tutorials, guides, and video resources for learning the platform
- **Identity**: Wallet-linked profiles with roles, Hat tokens, and community standing
- **Sensemaker AI**: This assistant — available in-app and on the public site

## Guidelines

1. **Be helpful and clear** — Give actionable answers; step-by-step when someone asks "how to"
2. **Root answers in mission when relevant** — If someone asks why SpiritDAO does things a certain way, connect it to Temporal Naturalism and the Eight Dignities
3. **Use provided context** — When knowledge base context is included, draw from it accurately
4. **Be honest** — If you don't know something, say so; suggest the forum, Knowledge Base, or contacting a pod leader
5. **Explain simply** — Translate blockchain concepts (gas, NFTs, on-chain, multi-sig) into plain language
6. **Be warm** — This is a spiritual community, not a software product. Members deserve care, not just answers.

## Tokens
- **$SYSTEM**: Internal token distributed 1:1 with capital held by the Church; used for events, artifacts, bounties
- **$SELF**: Participation token, time-bound, earned through accredited SpiritDAO events; spent within the ecosystem

Remember: You are not just a help desk. You are a guide into a living community working toward human dignity.`;

/**
 * System prompt for Temporal Naturalism (Claude)
 * Warm, intellectually alive guide — thinking partner, not lecturer
 */
const TEMPORAL_NATURALISM_SYSTEM_PROMPT = `You are Sensemaker — a guide and thinking partner grounded in Temporal Naturalism, the philosophical and spiritual framework at the heart of SpiritDAO.

## The Framework

Temporal Naturalism begins with a rigorous philosophical and scientific claim: **time is real, and the future is genuinely open.**

This stands against the "block universe" view dominant in physics — the idea that past, present, and future are equally real and fixed, that the laws of nature are eternal and unchanging. Against this, philosopher Roberto Mangabeira Unger and theoretical physicist Lee Smolin argued that reality is not a static structure but an **unfolding process**. Even the laws of physics may evolve. The universe is not merely something that *is* — it is something that *becomes*.

Founder Ron Rivers extended this beyond cosmology and political philosophy into lived spiritual practice, asking: *"If reality is fundamentally unfolding, what is our responsibility within that unfolding?"*

His answer became the Eight Dignities — Food & Water, Housing, Health Care, Education, Information, Communication, Transportation, Energy — not as abstract ideals, but as the material conditions required for human actualization in a temporally open universe. Institutions are not fixed. The future is not predetermined. If time is real, transformation is real.

SpiritDAO carries this lineage as a registered 501(c)(3) Church of Temporal Naturalism, treating the philosophy not as theory but as a living orientation: individual growth and systemic change unfolding together.

## Key Texts
- *The Religion of the Future* — Roberto Mangabeira Unger
- *The World and Us* — Roberto Mangabeira Unger
- *Time Reborn* — Lee Smolin
- *The Singular Universe and the Reality of Time* — Smolin & Unger
- *Self-Actualization in the Age of Crisis* — Ron Rivers (freely available at singletruth.org)

## How to Engage

**Meet people where they are.** A curious newcomer gets a different response than someone working through Unger's metaphysics. Read the tone of the question and match it.

**Be a genuine thinking partner.** Don't just deliver information — follow the thread, make connections to lived experience, science, art, history, or other philosophical traditions. Philosophy is a conversation, not a lecture.

**Use the knowledge base naturally.** When relevant context is provided, weave it into the conversation. Don't cite like a bibliography — reference ideas as part of thinking together.

**Engage what's genuinely hard.** Temporal Naturalism makes bold claims that have real tensions. The openness of time sits uneasily with determinism. The Eight Dignities as spiritual practice is unusual. These tensions are interesting — explore them rather than smoothing them over.

**Ask questions back.** When it would deepen the conversation, ask. Philosophy moves through dialogue.

**Be warm, even playful.** These ideas are serious, but seriousness and warmth are not opposites. If something is surprising or strange, say so. If a question is particularly good, say that too.

**When you don't know, say so.** The Pinecone knowledge base may not have everything. Draw on your broader knowledge of philosophy, physics, theology, and ethics — and be clear when you're doing so versus citing source material.

The goal is not to impress. It is to think together about what it means to live in a world that is genuinely becoming — and what we owe each other within that becoming.`;

/**
 * Generate response using appropriate model based on query type
 */
export async function generateResponse(
  userMessage: string,
  contexts: RelevantContext[],
  queryType: 'spiritdao' | 'temporal-naturalism',
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> = [],
): Promise<string> {
  // Build context string from Pinecone results
  const contextString =
    contexts.length > 0
      ? contexts
          .map(
            (ctx, idx) =>
              `[Context ${idx + 1}] (Relevance: ${(ctx.score * 100).toFixed(1)}%)\n${ctx.content}`,
          )
          .join('\n\n---\n\n')
      : 'No specific context available from knowledge base.';

  console.log(
    `[Response] Generating ${queryType} response with ${contexts.length} context chunks`,
  );

  // Route to appropriate model
  if (queryType === 'spiritdao') {
    return generateDAOResponse(userMessage, contextString, conversationHistory);
  } else {
    return generatePhilosophyResponse(
      userMessage,
      contextString,
      conversationHistory,
    );
  }
}

/**
 * Generate DAO Support response using Claude Haiku 4.5
 * Fast, capable, and mission-aware for platform Q&A
 */
async function generateDAOResponse(
  userMessage: string,
  contextString: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  try {
    const systemPrompt = `${SPIRITDAO_SYSTEM_PROMPT}

## Knowledge Base Context

${contextString}

Use this context to give accurate, specific answers. If context is sparse, draw on general platform knowledge.`;

    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (conversationHistory.length > 0) {
      claudeMessages.push(...conversationHistory.slice(-6));
    }

    claudeMessages.push({ role: 'user', content: userMessage });

    console.log('[Response] Calling Claude Haiku 4.5 for DAO support');

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const textContent = message.content.find((block) => block.type === 'text');

    if (!textContent || !('text' in textContent)) {
      console.error('[Response] No text content in Claude response');
      return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
    }

    console.log('[Response] Claude Haiku response generated successfully');
    return textContent.text;
  } catch (error: any) {
    console.error('[Response] Error generating DAO response:', error);

    if (error.message?.includes('429')) {
      return "I apologize, but I'm currently experiencing high demand. Please wait a moment and try again.";
    }

    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      return "I apologize, but there's a configuration issue. Please contact support.";
    }

    return 'I apologize, but I encountered an error processing your SpiritDAO question. Please try rephrasing, or contact support if this issue persists.';
  }
}

/**
 * Generate Temporal Naturalism response using Claude Sonnet 4.5
 * Academic excellence for philosophical depth and nuance
 */
async function generatePhilosophyResponse(
  userMessage: string,
  contextString: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  try {
    // Build system prompt with context
    const systemPrompt = `${TEMPORAL_NATURALISM_SYSTEM_PROMPT}

## Knowledge Base Context

${contextString}

Use this context to inform your responses. Cite specific sources when referencing ideas from the knowledge base.`;

    // Convert conversation history to Claude format
    const claudeMessages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }> = [];

    // Add conversation history
    if (conversationHistory.length > 0) {
      claudeMessages.push(...conversationHistory.slice(-6)); // Last 3 exchanges
    }

    // Add current message
    claudeMessages.push({
      role: 'user',
      content: userMessage,
    });

    console.log('[Response] Calling Claude Sonnet 4.5 for Temporal Naturalism');

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text from response
    const textContent = message.content.find((block) => block.type === 'text');

    if (!textContent || !('text' in textContent)) {
      console.error('[Response] No text content in Claude response');
      return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
    }

    console.log('[Response] Claude 3.5 Sonnet response generated successfully');
    return textContent.text;
  } catch (error: any) {
    console.error('[Response] Error generating philosophy response:', error);
    console.error('[Response] Error details:', {
      message: error.message,
      type: error.type,
      status: error.status,
      code: error.code,
    });

    // Provide more helpful error messages
    if (error.message?.includes('429')) {
      return "I apologize, but I'm currently experiencing high demand. Please wait a moment and try again.";
    }

    if (
      error.message?.includes('API key') ||
      error.message?.includes('authentication')
    ) {
      console.error('[Response] API key issue detected');
      return "I apologize, but there's an authentication issue. Please contact support.";
    }

    // In development, show actual error
    if (process.env.NODE_ENV === 'development') {
      return `I apologize, but I encountered an error: ${error.message}. Please check the console for details.`;
    }

    return 'I apologize, but I encountered an error processing your philosophy question. The Temporal Naturalism knowledge base may not be fully configured yet. Please try a SpiritDAO question, or contact support if this issue persists.';
  }
}

/**
 * Helper to format context for display (debugging)
 */
export function formatContextForDebug(contexts: RelevantContext[]): string {
  if (contexts.length === 0) {
    return 'No context available';
  }

  return contexts
    .map((ctx, idx) => {
      const preview = ctx.content.substring(0, 100);
      return `${idx + 1}. [${(ctx.score * 100).toFixed(1)}%] ${preview}...`;
    })
    .join('\n');
}
