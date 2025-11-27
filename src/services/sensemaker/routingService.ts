// src/services/sensemaker/routingService.ts

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QueryType = 'spiritdao' | 'temporal-naturalism';

/**
 * Classify user query to determine which knowledge base to use
 * Uses GPT-4o-mini for fast, cheap, accurate classification
 */
export async function classifyQuery(userMessage: string): Promise<QueryType> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a query classifier for SpiritDAO's Sensemaker AI.

Classify user queries into ONE of these categories:

1. "spiritdao" - Questions about:
   - DAO operations (voting, proposals, pods, governance)
   - App features (marketplace, events, bounties, forum)
   - Technical help (wallet, transactions, permissions, NFTs)
   - Community operations (pod management, member applications)
   - Getting started (onboarding, setup, identity)
   - Any "how do I..." or "where is..." about SpiritDAO features
   - Troubleshooting app issues

2. "temporal-naturalism" - Questions about:
   - Philosophy, metaphysics, theology
   - Time, causality, nature, existence
   - Theoretical/academic discussions
   - Abstract concepts
   - Existential questions
   - Religious or spiritual topics
   - Academic philosophical inquiry

Respond with ONLY ONE WORD: "spiritdao" or "temporal-naturalism"

Examples:
- "How do I vote on a proposal?" → spiritdao
- "What is temporal naturalism?" → temporal-naturalism
- "How do I join a pod?" → spiritdao
- "What is the nature of time?" → temporal-naturalism
- "Where is the marketplace?" → spiritdao
- "Explain causality in naturalism" → temporal-naturalism
- "How do I mint an Advocate NFT?" → spiritdao
- "What does theology say about creation?" → temporal-naturalism`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    const classification = completion.choices[0]?.message?.content?.trim().toLowerCase();

    if (classification === 'spiritdao' || classification === 'temporal-naturalism') {
      console.log(`[Routing] Classified "${userMessage.substring(0, 50)}..." as: ${classification}`);
      return classification as QueryType;
    }

    // Default to spiritdao if unclear (most users will ask about DAO)
    console.log(`[Routing] Unclear classification, defaulting to: spiritdao`);
    return 'spiritdao';

  } catch (error) {
    console.error('[Routing] Classification error:', error);
    // Default to spiritdao on error
    return 'spiritdao';
  }
}

/**
 * Helper function to validate if a string is a valid QueryType
 */
export function isValidQueryType(value: string): value is QueryType {
  return value === 'spiritdao' || value === 'temporal-naturalism';
}
