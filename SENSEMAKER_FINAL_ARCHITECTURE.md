# Sensemaker AI - Final Architecture Plan

## Executive Summary

**Approach:** Hybrid architecture with unified backend
- Keep existing iframe for external sites (singletruth.org, spiritdao.org)
- Add native chat interface for in-app with better integration
- Use intelligent routing to dual knowledge bases
- **Claude 3.5 Sonnet** for Temporal Naturalism (academic excellence)
- **GPT-4o-mini** for DAO Support (fast documentation lookup)
- Pinecone free tier (sufficient for your needs)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│         Unified Backend (Next.js API Routes)            │
│                                                         │
│  POST /api/sensemaker/chat                              │
│                                                         │
│  1. Routing (GPT-4o-mini)                               │
│     ├─> Classify: "spiritdao" or "temporal-naturalism" │
│     └─> Fast, cheap, accurate classification            │
│                                                         │
│  2. Context Retrieval (Pinecone)                        │
│     ├─> Query namespace based on classification        │
│     ├─> Return top 5 relevant chunks                    │
│     └─> Free tier: 100k vectors (you'll use <2k)       │
│                                                         │
│  3. Response Generation                                 │
│     ├─> DAO Support Path                                │
│     │   └─> GPT-4o-mini ($0.15/$0.60 per 1M tokens)    │
│     │       - Simple Q&A from guides                    │
│     │       - Fast, cheap, effective                    │
│     │                                                   │
│     └─> Temporal Naturalism Path                        │
│         └─> Claude 3.5 Sonnet ($3/$15 per 1M tokens)   │
│             - Academic depth & nuance                   │
│             - Dense source citation                     │
│             - 200k context window                       │
│             - Superior philosophical reasoning          │
└─────────────────────────────────────────────────────────┘
                    ↓           ↓           ↓
        ┌───────────┴───┐  ┌────┴────┐  ┌──┴──────┐
        │  In-App       │  │ Book    │  │ Church  │
        │  React Chat   │  │ iframe  │  │ iframe  │
        └───────────────┘  └─────────┘  └─────────┘
          Native UX         Existing      Existing
          Full integration  Keep as-is    Keep as-is
```

---

## Implementation Details

### 1. Backend Services

#### A. Routing Service
**File:** `src/services/sensemaker/routingService.ts`
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QueryType = 'spiritdao' | 'temporal-naturalism';

export async function classifyQuery(userMessage: string): Promise<QueryType> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Fast & cheap for classification
    messages: [
      {
        role: 'system',
        content: `You are a query classifier for SpiritDAO's Sensemaker AI.

Classify user queries into ONE of these categories:

1. "spiritdao" - Questions about:
   - DAO operations (voting, proposals, pods, governance)
   - App features (marketplace, events, bounties, forum)
   - Technical help (wallet, transactions, permissions)
   - Community operations
   - Any "how do I..." about SpiritDAO features

2. "temporal-naturalism" - Questions about:
   - Philosophy, metaphysics, theology
   - Time, causality, nature, existence
   - Theoretical/academic discussions
   - Abstract concepts
   - Existential questions

Respond with ONLY ONE WORD: "spiritdao" or "temporal-naturalism"

Examples:
- "How do I vote?" → spiritdao
- "What is temporal naturalism?" → temporal-naturalism
- "How do I join a pod?" → spiritdao
- "What is the nature of time?" → temporal-naturalism
- "Where is the marketplace?" → spiritdao
- "Explain causality in naturalism" → temporal-naturalism`
      },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.1,
    max_tokens: 10
  });

  const classification = completion.choices[0]?.message?.content?.trim().toLowerCase();
  return (classification === 'spiritdao' || classification === 'temporal-naturalism')
    ? classification as QueryType
    : 'spiritdao'; // Default to DAO support if unclear
}
```

#### B. Pinecone Service
**File:** `src/services/sensemaker/pineconeService.ts`
```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Namespace = 'spiritdao' | 'temporal-naturalism';

export interface RelevantContext {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  });
  return response.data[0].embedding;
}

export async function queryPinecone(
  userMessage: string,
  namespace: Namespace,
  topK: number = 5
): Promise<RelevantContext[]> {
  const indexName = process.env.PINECONE_INDEX_NAME || 'sensemaker';
  const index = pinecone.index(indexName);

  // Get embedding for user's message
  const embedding = await getEmbedding(userMessage);

  // Query Pinecone in the specified namespace
  const queryResponse = await index.namespace(namespace).query({
    vector: embedding,
    topK,
    includeMetadata: true
  });

  // Format and return results
  return queryResponse.matches.map(match => ({
    content: (match.metadata?.text as string) || '',
    score: match.score || 0,
    metadata: match.metadata
  }));
}
```

#### C. Response Service (Dual Models)
**File:** `src/services/sensemaker/responseService.ts`
```typescript
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { RelevantContext } from './pineconeService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * System prompt for DAO Support (GPT-4o-mini)
 */
const SPIRITDAO_SYSTEM_PROMPT = `You are SpiritDAO's helpful assistant. You provide support for SpiritDAO's decentralized autonomous organization platform.

Your knowledge includes:
- Pod management (creating, joining, managing)
- Governance and voting (proposals, delegation)
- Bounties system (applying, creating, payments)
- Events and calendar (NFT registration, check-in)
- Forum and discussions (threads, posts, moderation)
- Marketplace (buying/selling, crypto payments)
- Getting started (wallet setup, Advocate NFT)

Guidelines:
1. Be helpful and concise
2. Provide step-by-step instructions
3. Reference specific guide sections when helpful
4. Use the context provided accurately
5. If unsure, suggest checking documentation
6. Be friendly and encouraging
7. Explain blockchain concepts simply

Format references as: "See: [Guide Name] > [Section]"`;

/**
 * System prompt for Temporal Naturalism (Claude 3.5 Sonnet)
 */
const TEMPORAL_NATURALISM_SYSTEM_PROMPT = `You are a knowledgeable assistant specializing in Temporal Naturalism philosophy and theology.

Your approach:
1. Draw from dense academic sources with accuracy
2. Provide nuanced philosophical analysis
3. Cite sources when referencing specific ideas
4. Engage with complex metaphysical concepts
5. Maintain academic rigor while being accessible
6. Address theological and philosophical dimensions
7. Consider multiple perspectives when appropriate

Guidelines:
- Be thorough and thoughtful
- Use precise philosophical language
- Acknowledge complexity and nuance
- Provide citations from the knowledge base
- Engage with objections and counterpoints
- Build on previous conversation context

This is an academic chatbot intended for serious philosophical inquiry.`;

/**
 * Generate response using appropriate model
 */
export async function generateResponse(
  userMessage: string,
  contexts: RelevantContext[],
  queryType: 'spiritdao' | 'temporal-naturalism',
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  // Build context string
  const contextString = contexts
    .map((ctx, idx) => `[Context ${idx + 1}] (Relevance: ${(ctx.score * 100).toFixed(1)}%)\n${ctx.content}`)
    .join('\n\n---\n\n');

  // Route to appropriate model
  if (queryType === 'spiritdao') {
    return generateDAOResponse(userMessage, contextString, conversationHistory);
  } else {
    return generatePhilosophyResponse(userMessage, contextString, conversationHistory);
  }
}

/**
 * DAO Support with GPT-4o-mini (fast, cheap, effective)
 */
async function generateDAOResponse(
  userMessage: string,
  contextString: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SPIRITDAO_SYSTEM_PROMPT },
    { role: 'system', content: `Relevant context:\n\n${contextString}` },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 800
  });

  return completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
}

/**
 * Temporal Naturalism with Claude 3.5 Sonnet (academic excellence)
 */
async function generatePhilosophyResponse(
  userMessage: string,
  contextString: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  // Convert conversation history to Claude format
  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add conversation history
  conversationHistory.forEach(msg => {
    claudeMessages.push({ role: msg.role, content: msg.content });
  });

  // Add current message
  claudeMessages.push({ role: 'user', content: userMessage });

  // Build system prompt with context
  const systemPrompt = `${TEMPORAL_NATURALISM_SYSTEM_PROMPT}

## Knowledge Base Context

${contextString}

Use this context to inform your responses. Cite specific sources when referencing ideas from the knowledge base.`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    temperature: 0.7,
    system: systemPrompt,
    messages: claudeMessages
  });

  const textContent = message.content.find(block => block.type === 'text');
  return textContent && 'text' in textContent
    ? textContent.text
    : 'I apologize, but I could not generate a response.';
}
```

#### D. Main Chat API
**File:** `src/app/api/sensemaker/chat/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { classifyQuery } from '@/services/sensemaker/routingService';
import { queryPinecone } from '@/services/sensemaker/pineconeService';
import { generateResponse } from '@/services/sensemaker/responseService';

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    console.log('[Sensemaker] Received:', message);

    // Step 1: Classify query (GPT-4o-mini)
    const queryType = await classifyQuery(message);
    console.log('[Sensemaker] Classified as:', queryType);

    // Step 2: Retrieve context from Pinecone
    const contexts = await queryPinecone(message, queryType, 5);
    console.log('[Sensemaker] Retrieved contexts:', contexts.length);

    // Step 3: Generate response (appropriate model based on type)
    const response = await generateResponse(
      message,
      contexts,
      queryType,
      conversationHistory || []
    );
    console.log('[Sensemaker] Generated response');

    return NextResponse.json({
      response,
      queryType,
      contextCount: contexts.length,
      model: queryType === 'spiritdao' ? 'gpt-4o-mini' : 'claude-3.5-sonnet'
    });

  } catch (error: any) {
    console.error('[Sensemaker] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process message' },
      { status: 500 }
    );
  }
}
```

---

### 2. Frontend Implementation

#### In-App Chat Interface
**File:** `src/app/sensemaker-ai/page.tsx`
```typescript
'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './SensemakerAI.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  queryType?: 'spiritdao' | 'temporal-naturalism';
  model?: string;
}

export default function SensemakerAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I can help you with SpiritDAO operations or discuss Temporal Naturalism philosophy. What would you like to know?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/sensemaker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.slice(-6) // Last 3 exchanges
        })
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        queryType: data.queryType,
        model: data.model
      }]);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.chatContainer}>
        <div className={styles.messagesArea}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`${styles.message} ${
                msg.role === 'user' ? styles.userMessage : styles.assistantMessage
              }`}
            >
              <div className={styles.messageContent}>{msg.content}</div>
              {msg.queryType && (
                <div className={styles.badges}>
                  <span className={styles.queryTypeBadge}>
                    {msg.queryType === 'spiritdao' ? '🏛️ DAO Support' : '🌀 Philosophy'}
                  </span>
                  {msg.model && (
                    <span className={styles.modelBadge}>
                      {msg.model}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className={`${styles.message} ${styles.assistantMessage}`}>
              <div className={styles.loadingDots}>
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.inputArea}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about SpiritDAO or Temporal Naturalism..."
            className={styles.input}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className={styles.sendButton}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### 3. Environment Variables

```env
# OpenAI (for routing, embeddings, DAO support)
OPENAI_API_KEY=sk-...

# Anthropic (for Temporal Naturalism)
ANTHROPIC_API_KEY=sk-ant-...

# Pinecone (free tier)
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=...
PINECONE_INDEX_NAME=sensemaker
```

---

### 4. Dependencies

```bash
npm install @pinecone-database/pinecone @anthropic-ai/sdk
```

---

## Cost Analysis (Revised)

### Monthly Costs (Estimated 1000 queries/day)

**Routing (GPT-4o-mini):**
- 30,000 queries/month × 50 tokens = 1.5M tokens
- Cost: ~$0.25/month (negligible)

**DAO Support (GPT-4o-mini):**
- ~15,000 queries/month (50% of traffic)
- Input: 2k tokens avg, Output: 500 tokens avg
- Cost: ~$10/month

**Temporal Naturalism (Claude 3.5 Sonnet):**
- ~15,000 queries/month (50% of traffic)
- Input: 3k tokens avg, Output: 1k tokens avg
- Cost: ~$360/month

**Embeddings (OpenAI, one-time):**
- ~50k tokens total for guides
- Cost: ~$0.05 (one-time)

**Pinecone (Free Tier):**
- Cost: $0/month

**Total: ~$370/month**

### Cost Optimization Options

If cost is a concern, you can:
1. Use GPT-4o instead of Claude 3.5 Sonnet (saves ~$100/month, slight quality drop)
2. Implement caching for common questions
3. Use shorter context windows for less complex queries
4. Monitor and optimize token usage

---

## Implementation Timeline

### Week 1: Core Infrastructure (3-4 days)
- [ ] Set up Pinecone account and index
- [ ] Create namespaces (spiritdao, temporal-naturalism)
- [ ] Add environment variables
- [ ] Install dependencies
- [ ] Create routing service
- [ ] Create Pinecone service
- [ ] Create response service (dual models)

### Week 2: API & Embedding (3-4 days)
- [ ] Create chat API endpoint
- [ ] Test API with Postman
- [ ] Create embedding script
- [ ] Embed DAO guides
- [ ] Verify Pinecone retrieval

### Week 3: Frontend & Integration (3-4 days)
- [ ] Build React chat interface
- [ ] Update CSS
- [ ] Test end-to-end flow
- [ ] Handle error cases
- [ ] Add loading states

### Week 4: Migration & Testing (3-4 days)
- [ ] Embed Temporal Naturalism content
- [ ] Test both knowledge paths
- [ ] Quality assurance testing
- [ ] Performance optimization
- [ ] Deploy to production

**Total: 2-3 weeks for complete implementation**

---

## Testing Strategy

### Unit Tests
```typescript
// Test routing classification
describe('Query Classification', () => {
  it('classifies DAO questions correctly', async () => {
    expect(await classifyQuery('How do I vote?')).toBe('spiritdao');
  });

  it('classifies philosophy questions correctly', async () => {
    expect(await classifyQuery('What is time?')).toBe('temporal-naturalism');
  });
});

// Test context retrieval
describe('Pinecone Retrieval', () => {
  it('retrieves relevant DAO context', async () => {
    const results = await queryPinecone('How to join pod', 'spiritdao');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0.7);
  });
});
```

### Integration Tests
```typescript
// Test full chat flow
describe('Chat API', () => {
  it('handles DAO support query end-to-end', async () => {
    const response = await fetch('/api/sensemaker/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'How do I vote on proposals?' })
    });
    const data = await response.json();
    expect(data.queryType).toBe('spiritdao');
    expect(data.model).toBe('gpt-4o-mini');
    expect(data.response).toContain('vote');
  });
});
```

---

## Migration Plan for External Sites

### Option 1: Keep Current Iframe (Recommended)
**No changes needed** - External sites continue using current iframe

### Option 2: Update Iframe to New Backend
```html
<!-- Update iframe source to point to new Next.js API -->
<iframe
  src="https://yourdomain.com/sensemaker-widget"
  title="Sensemaker AI"
  allow="microphone"
/>
```

You'd create a public widget page that calls the same API.

---

## Key Benefits of This Architecture

✅ **Unified Backend** - One codebase for all sites
✅ **Flexible Frontends** - Native app chat + iframe for external sites
✅ **Optimal Models** - GPT-4o-mini for simple tasks, Claude 3.5 Sonnet for complex philosophy
✅ **Cost Effective** - Only pay for what you need, free Pinecone tier
✅ **Academic Excellence** - Claude 3.5 Sonnet provides superior philosophical depth
✅ **Scalable** - Can handle growth without major changes
✅ **Maintainable** - Clear separation of concerns

---

## Next Steps

1. **Confirm approach** - Does this architecture align with your vision?
2. **Set up accounts** - Pinecone (free), Anthropic API access
3. **Begin implementation** - I can start building immediately
4. **Iterative testing** - Test as we build each component

**Ready to proceed?** I can start with Week 1 (Core Infrastructure) immediately.
