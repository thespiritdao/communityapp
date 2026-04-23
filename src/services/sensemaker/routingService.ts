// src/services/sensemaker/routingService.ts

import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export type QueryType = 'spiritdao' | 'temporal-naturalism';

/**
 * Classify user query to determine which knowledge base to use
 * Uses Claude Haiku for fast, cheap, accurate classification
 */
export async function classifyQuery(userMessage: string): Promise<QueryType> {
  try {
    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      temperature: 0,
      system: `You are a query classifier for SpiritDAO's Sensemaker AI.

Classify user queries into ONE of these categories:

1. "spiritdao" - Questions about:
   - DAO operations (voting, proposals, pods, governance)
   - App features (marketplace, events, bounties, forum, video chat, conferencing)
   - Technical help (wallet, transactions, permissions, roles)
   - Community operations (pod management, member applications)
   - Getting started (onboarding, setup, identity, invite codes)
   - Any "how do I..." or "where is..." about SpiritDAO features
   - Troubleshooting app issues
   - The Eight Dignities as community practice, mission, or lived values
   - SpiritDAO events, retreats, or community gatherings
   - Tokens: Proof of Curiosity, Advocate, $SYSTEM, $SELF
   - Donations, claims, gifting tokens
   - Membership types and credentials
   - Explorer, members directory, profiles
   - Knowledge base and tutorials

2. "temporal-naturalism" - Questions about:
   - Philosophy, metaphysics, theology
   - Time, causality, nature, existence
   - The work of Unger, Smolin, or Ron Rivers
   - Theoretical/academic discussions
   - Abstract concepts and existential questions
   - Spiritual or religious topics not tied to specific app features
   - The meaning or foundations of Temporal Naturalism
   - The philosophical basis of the Eight Dignities (why they matter, their intellectual roots)

Note on the Eight Dignities: If the question is about the philosophical roots or meaning of the Eight Dignities, classify as "temporal-naturalism". If it's about how SpiritDAO practices them, what they are as a list, or their role in the community mission, classify as "spiritdao". When ambiguous, default to "spiritdao".

Respond with ONLY ONE WORD: "spiritdao" or "temporal-naturalism"

Examples:
- "How do I vote on a proposal?" → spiritdao
- "What is temporal naturalism?" → temporal-naturalism
- "How do I join a pod?" → spiritdao
- "What is the nature of time?" → temporal-naturalism
- "Where is the marketplace?" → spiritdao
- "Explain causality in naturalism" → temporal-naturalism
- "What is a Proof of Curiosity token?" → spiritdao
- "What does theology say about creation?" → temporal-naturalism
- "What are the Eight Dignities?" → spiritdao
- "How do I use video chat in a pod?" → spiritdao
- "How do I donate?" → spiritdao
- "What is an Advocate token?" → spiritdao
- "How does $SYSTEM work?" → spiritdao
- "Why does Unger argue institutions must change?" → temporal-naturalism
- "What philosophical tradition do the Eight Dignities come from?" → temporal-naturalism
- "How do I earn $SELF tokens?" → spiritdao
- "What is the claims process?" → spiritdao
- "How do bounties work?" → spiritdao`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    const classification = textContent && 'text' in textContent
      ? textContent.text.trim().toLowerCase()
      : null;

    if (
      classification === 'spiritdao' ||
      classification === 'temporal-naturalism'
    ) {
      console.log(
        `[Routing] Classified "${userMessage.substring(0, 50)}..." as: ${classification}`,
      );
      return classification as QueryType;
    }

    console.log(`[Routing] Unclear classification, defaulting to: spiritdao`);
    return 'spiritdao';
  } catch (error) {
    console.error('[Routing] Classification error:', error);
    return 'spiritdao';
  }
}

/**
 * Helper function to validate if a string is a valid QueryType
 */
export function isValidQueryType(value: string): value is QueryType {
  return value === 'spiritdao' || value === 'temporal-naturalism';
}
