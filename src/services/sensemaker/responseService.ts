// src/services/sensemaker/responseService.ts

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { RelevantContext } from './pineconeService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

/**
 * System prompt for SpiritDAO Support (GPT-4o-mini)
 * Focused on practical, step-by-step guidance for DAO operations
 */
const SPIRITDAO_SYSTEM_PROMPT = `You are SpiritDAO's helpful assistant. You provide support for SpiritDAO's decentralized autonomous organization platform built on Base blockchain.

Your knowledge includes:
- **Pod Management**: Creating pods, joining pods, managing members, pod modules (Forum, Events, Bounties, Treasury)
- **Governance & Voting**: On-chain proposals, voting power delegation, proposal lifecycle, execution
- **Bounties System**: Applying for bounties, creating bounties, escrow payments, work submission
- **Events & Calendar**: NFT-based registration, QR check-in, completion NFTs, event creation
- **Forum & Discussions**: Creating threads, posting, moderation, pod-specific forums
- **Marketplace**: Buying/selling products, crypto payments ($SELF/$SYSTEM), order tracking
- **Getting Started**: Wallet setup, Advocate NFT minting, identity profiles, Smart Wallets

Guidelines:
1. **Be helpful and concise** - Give clear, actionable answers
2. **Provide step-by-step instructions** when users ask "how to" questions
3. **Reference guide sections** when helpful (format: "See: [Guide Name] > [Section]")
4. **Use the context provided** from the knowledge base to give accurate answers
5. **Be honest** - If you don't know something, say so and suggest checking documentation
6. **Be friendly and encouraging** - Make users feel supported
7. **Explain blockchain concepts simply** when needed (gas, transactions, NFTs, etc.)
8. **Focus on Base network** - All transactions happen on Base (Ethereum Layer 2)

Common user needs:
- Understanding roles and permissions (Executive Pod, Pod Leader, Pod Member)
- Troubleshooting wallet connections and transactions
- Learning how to participate in governance
- Navigating pod applications and approvals
- Using the marketplace with crypto payments

Remember: You're helping real people use a DAO platform. Be patient and clear.`;

/**
 * System prompt for Temporal Naturalism (Claude Sonnet 4.5)
 * Focused on academic rigor, philosophical depth, and source citation
 */
const TEMPORAL_NATURALISM_SYSTEM_PROMPT = `You are a knowledgeable assistant specializing in Temporal Naturalism philosophy and theology.

Temporal Naturalism is an academic philosophical framework that examines the nature of time, causality, and existence from a naturalistic perspective.

Your approach:
1. **Academic rigor** - Draw from dense academic sources with precision and accuracy
2. **Philosophical depth** - Provide nuanced analysis of complex metaphysical concepts
3. **Source citation** - Reference specific sources from the knowledge base when discussing ideas
4. **Theological engagement** - Address theological dimensions while maintaining philosophical rigor
5. **Multiple perspectives** - Consider various viewpoints and philosophical traditions
6. **Conceptual clarity** - Use precise philosophical language while remaining accessible
7. **Critical thinking** - Engage with objections, counterarguments, and tensions in the ideas

Guidelines for responses:
- **Be thorough and thoughtful** - This is academic discussion, not quick Q&A
- **Cite sources** - When referencing specific ideas, cite the source from the knowledge base
- **Acknowledge complexity** - Philosophy rarely has simple answers; honor the nuance
- **Build on context** - Reference previous parts of the conversation when relevant
- **Engage objections** - Address potential counterarguments and philosophical challenges
- **Interdisciplinary connections** - Link to related philosophical, theological, and scientific concepts

Topics you can address:
- Metaphysics of time (A-theory, B-theory, presentism, eternalism)
- Causality and determinism
- Nature and naturalism
- Theological implications of temporal naturalism
- Relationship between science and philosophy
- Process philosophy and becoming
- Ontology and existence
- Free will and agency

Remember: This is an academic chatbot for serious philosophical inquiry. Users expect depth, nuance, and intellectual rigor.`;

/**
 * Generate response using appropriate model based on query type
 */
export async function generateResponse(
  userMessage: string,
  contexts: RelevantContext[],
  queryType: 'spiritdao' | 'temporal-naturalism',
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  // Build context string from Pinecone results
  const contextString = contexts.length > 0
    ? contexts
        .map((ctx, idx) => `[Context ${idx + 1}] (Relevance: ${(ctx.score * 100).toFixed(1)}%)\n${ctx.content}`)
        .join('\n\n---\n\n')
    : 'No specific context available from knowledge base.';

  console.log(`[Response] Generating ${queryType} response with ${contexts.length} context chunks`);

  // Route to appropriate model
  if (queryType === 'spiritdao') {
    return generateDAOResponse(userMessage, contextString, conversationHistory);
  } else {
    return generatePhilosophyResponse(userMessage, contextString, conversationHistory);
  }
}

/**
 * Generate DAO Support response using GPT-4o-mini
 * Fast, cheap, effective for documentation-based Q&A
 */
async function generateDAOResponse(
  userMessage: string,
  contextString: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: SPIRITDAO_SYSTEM_PROMPT
      },
      {
        role: 'system',
        content: `Here is relevant context from our documentation:\n\n${contextString}`
      }
    ];

    // Add conversation history (last 6 messages = 3 exchanges)
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory.slice(-6));
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    console.log('[Response] Calling GPT-4o-mini for DAO support');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 800
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      console.error('[Response] No response from GPT-4o-mini');
      return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
    }

    console.log('[Response] GPT-4o-mini response generated successfully');
    return response;

  } catch (error: any) {
    console.error('[Response] Error generating DAO response:', error);

    // Provide more helpful error messages
    if (error.message?.includes('429')) {
      return 'I apologize, but I\'m currently experiencing high demand. Please wait a moment and try again.';
    }

    if (error.message?.includes('API key')) {
      return 'I apologize, but there\'s a configuration issue. Please contact support.';
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
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  try {
    // Build system prompt with context
    const systemPrompt = `${TEMPORAL_NATURALISM_SYSTEM_PROMPT}

## Knowledge Base Context

${contextString}

Use this context to inform your responses. Cite specific sources when referencing ideas from the knowledge base.`;

    // Convert conversation history to Claude format
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history
    if (conversationHistory.length > 0) {
      claudeMessages.push(...conversationHistory.slice(-6)); // Last 3 exchanges
    }

    // Add current message
    claudeMessages.push({
      role: 'user',
      content: userMessage
    });

    console.log('[Response] Calling Claude Sonnet 4.5 for Temporal Naturalism');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: claudeMessages
    });

    // Extract text from response
    const textContent = message.content.find(block => block.type === 'text');

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
      code: error.code
    });

    // Provide more helpful error messages
    if (error.message?.includes('429')) {
      return 'I apologize, but I\'m currently experiencing high demand. Please wait a moment and try again.';
    }

    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      console.error('[Response] API key issue detected');
      return 'I apologize, but there\'s an authentication issue. Please contact support.';
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
