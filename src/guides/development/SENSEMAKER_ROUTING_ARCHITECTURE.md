# Sensemaker AI Routing Architecture Plan

## Current State Analysis

### Existing Implementation
1. **External iframe**: Points to `https://spiritdao.pythonanywhere.com/widget`
   - Handles Temporal Naturalism chatbot
   - External hosting (not in our control)
   - Limited integration with our app

2. **Forum Summarization API**: `/api/sensemaker/summarize`
   - Uses OpenAI GPT-4o-mini
   - Siloed feature for thread summaries
   - No Pinecone integration currently

### Limitations
- No unified chat interface
- Cannot route between different knowledge bases
- External dependency for main chatbot
- No SpiritDAO operational support

---

## Proposed Architecture

### High-Level Flow
```
User Input
    ↓
Processing LLM (Router)
    ↓
Decision: DAO Support or Temporal Naturalism?
    ↓
    ├─→ SpiritDAO Knowledge Base (Pinecone namespace: "spiritdao")
    │       ↓
    │   SpiritDAO Support LLM (GPT-4o-mini)
    │       ↓
    │   Response about DAO operations
    │
    └─→ Temporal Naturalism Knowledge Base (Pinecone namespace: "temporal-naturalism")
            ↓
        Temporal Naturalism LLM (GPT-4o-mini)
            ↓
        Response about philosophy

```

---

## Required Changes

### 1. Infrastructure Setup

#### Pinecone Configuration
**Create/Configure Two Namespaces:**

**Namespace 1: `spiritdao`**
- Contains vectors from our user guides
- Documents to embed:
  - `src/guides/user/01-getting-started.md`
  - `src/guides/user/02-pod-management.md`
  - `src/guides/user/03-governance-voting.md`
  - `src/guides/user/04-bounties-system.md`
  - `src/guides/user/05-events-calendar.md`
  - `src/guides/user/06-forum-discussions.md`
  - `src/guides/user/07-marketplace-shopping.md`
  - `src/guides/QUICK_REFERENCE.md`
- Embedding model: `text-embedding-3-small` (OpenAI)
- Dimensions: 1536
- Chunk size: 1000 tokens with 200 token overlap

**Namespace 2: `temporal-naturalism`**
- Contains existing philosophical content
- Keep current configuration
- Maintain existing embeddings

#### Environment Variables Needed
```env
# Pinecone
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX_NAME=sensemaker # Main index name

# OpenAI
OPENAI_API_KEY=your_openai_api_key # Already exists

# Namespaces (for reference/documentation)
SPIRITDAO_NAMESPACE=spiritdao
TEMPORAL_NATURALISM_NAMESPACE=temporal-naturalism
```

---

### 2. Code Changes Required

#### A. Create Routing Service
**File: `src/services/sensemaker/routingService.ts`**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type QueryType = 'spiritdao' | 'temporal-naturalism';

export async function classifyQuery(userMessage: string): Promise<QueryType> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a query classifier for SpiritDAO's Sensemaker AI.

Classify user queries into ONE of these categories:

1. "spiritdao" - Questions about:
   - DAO operations (how to vote, create proposals, join pods)
   - App features (marketplace, events, bounties, forum)
   - Technical help (wallet connection, transactions, permissions)
   - Community operations (pod management, governance)
   - Any "how do I..." or "what is..." about SpiritDAO features

2. "temporal-naturalism" - Questions about:
   - Philosophy and metaphysics
   - Time, causality, nature
   - Theoretical discussions
   - Abstract concepts
   - Existential questions

Respond with ONLY ONE WORD: either "spiritdao" or "temporal-naturalism"

Examples:
- "How do I vote on a proposal?" → spiritdao
- "What is temporal naturalism?" → temporal-naturalism
- "How do I join a pod?" → spiritdao
- "What is the nature of time?" → temporal-naturalism
- "Where do I buy items in the marketplace?" → spiritdao`
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
    return classification as QueryType;
  }

  // Default to spiritdao if unclear (since most users will ask about DAO)
  return 'spiritdao';
}
```

#### B. Create Pinecone Service
**File: `src/services/sensemaker/pineconeService.ts`**

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Namespace = 'spiritdao' | 'temporal-naturalism';

export interface RelevantContext {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Get embedding for a query
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  });

  return response.data[0].embedding;
}

/**
 * Query Pinecone for relevant context
 */
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

  // Format results
  const contexts: RelevantContext[] = queryResponse.matches.map(match => ({
    content: (match.metadata?.text as string) || '',
    score: match.score || 0,
    metadata: match.metadata
  }));

  return contexts;
}
```

#### C. Create Response Generation Service
**File: `src/services/sensemaker/responseService.ts`**

```typescript
import OpenAI from 'openai';
import { RelevantContext } from './pineconeService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * System prompt for SpiritDAO support
 */
const SPIRITDAO_SYSTEM_PROMPT = `You are SpiritDAO's helpful assistant. You provide support for SpiritDAO's decentralized autonomous organization platform.

Your knowledge includes:
- Pod management (creating, joining, managing pods)
- Governance and voting (proposals, delegation, on-chain voting)
- Bounties system (applying for bounties, creating bounties, payments)
- Events and calendar (NFT-based registration, check-in, completion NFTs)
- Forum and discussions (creating threads, posting, moderation)
- Marketplace (buying/selling products, crypto payments, order tracking)
- Getting started (wallet setup, Advocate NFT, identity)

Guidelines:
1. Be helpful and concise
2. Provide step-by-step instructions when appropriate
3. Reference specific guide sections when helpful
4. Use the context provided to give accurate answers
5. If you don't know something, say so and suggest checking the documentation
6. Be friendly and encouraging
7. Explain blockchain concepts simply when needed

When referencing guides, use this format:
"See: Pod Management guide > Creating a Pod section"`;

/**
 * System prompt for Temporal Naturalism
 */
const TEMPORAL_NATURALISM_SYSTEM_PROMPT = `You are a knowledgeable assistant specializing in Temporal Naturalism philosophy.

[Your existing Temporal Naturalism prompt - keep as is]`;

/**
 * Generate response using OpenAI with context
 */
export async function generateResponse(
  userMessage: string,
  contexts: RelevantContext[],
  queryType: 'spiritdao' | 'temporal-naturalism',
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  // Select appropriate system prompt
  const systemPrompt = queryType === 'spiritdao'
    ? SPIRITDAO_SYSTEM_PROMPT
    : TEMPORAL_NATURALISM_SYSTEM_PROMPT;

  // Build context string from Pinecone results
  const contextString = contexts
    .map((ctx, idx) => `[Context ${idx + 1}] (Relevance: ${(ctx.score * 100).toFixed(1)}%)\n${ctx.content}`)
    .join('\n\n---\n\n');

  // Build messages array
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'system',
      content: `Here is relevant context from our knowledge base:\n\n${contextString}`
    }
  ];

  // Add conversation history
  messages.push(...conversationHistory);

  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage
  });

  // Generate response
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 800
  });

  return completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
}
```

#### D. Create Main Chat API Endpoint
**File: `src/app/api/sensemaker/chat/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { classifyQuery } from '@/services/sensemaker/routingService';
import { queryPinecone } from '@/services/sensemaker/pineconeService';
import { generateResponse } from '@/services/sensemaker/responseService';

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log('[Sensemaker Chat] Received message:', message);

    // Step 1: Classify the query
    const queryType = await classifyQuery(message);
    console.log('[Sensemaker Chat] Classified as:', queryType);

    // Step 2: Query Pinecone for relevant context
    const contexts = await queryPinecone(message, queryType, 5);
    console.log('[Sensemaker Chat] Retrieved contexts:', contexts.length);

    // Step 3: Generate response
    const response = await generateResponse(
      message,
      contexts,
      queryType,
      conversationHistory || []
    );
    console.log('[Sensemaker Chat] Generated response');

    return NextResponse.json({
      response,
      queryType,
      contextCount: contexts.length
    });

  } catch (error: any) {
    console.error('[Sensemaker Chat] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process message' },
      { status: 500 }
    );
  }
}
```

#### E. Update Frontend Component
**File: `src/app/sensemaker-ai/page.tsx`**

Replace the iframe with a proper chat interface:

```typescript
'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './SensemakerAI.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  queryType?: 'spiritdao' | 'temporal-naturalism';
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

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Send to API
      const response = await fetch('/api/sensemaker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.slice(-6) // Last 3 exchanges
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Add assistant response
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        queryType: data.queryType
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
              <div className={styles.messageContent}>
                {msg.content}
              </div>
              {msg.queryType && (
                <div className={styles.queryTypeBadge}>
                  {msg.queryType === 'spiritdao' ? '🏛️ DAO Support' : '🌀 Philosophy'}
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

### 3. Embedding Script

**File: `scripts/embed-spiritdao-docs.ts`**

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const GUIDES_DIR = path.join(process.cwd(), 'src', 'guides', 'user');
const QUICK_REF = path.join(process.cwd(), 'src', 'guides', 'QUICK_REFERENCE.md');

interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    filename: string;
    section?: string;
    chunkIndex: number;
  };
}

/**
 * Split document into chunks
 */
function chunkDocument(content: string, filename: string, maxTokens: number = 1000): DocumentChunk[] {
  // Simple chunking by paragraphs/sections
  const sections = content.split(/\n#{1,3}\s/);
  const chunks: DocumentChunk[] = [];

  sections.forEach((section, idx) => {
    // Further split if section is too long
    const lines = section.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;

    for (const line of lines) {
      if ((currentChunk + line).length > maxTokens * 4) { // Rough token estimate
        if (currentChunk) {
          chunks.push({
            id: `${filename}-chunk-${idx}-${chunkIndex}`,
            text: currentChunk.trim(),
            metadata: {
              filename,
              section: section.substring(0, 50),
              chunkIndex: chunkIndex++
            }
          });
        }
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `${filename}-chunk-${idx}-${chunkIndex}`,
        text: currentChunk.trim(),
        metadata: {
          filename,
          section: section.substring(0, 50),
          chunkIndex
        }
      });
    }
  });

  return chunks;
}

/**
 * Get embeddings from OpenAI
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536
  });

  return response.data.map(d => d.embedding);
}

/**
 * Main embedding function
 */
async function embedDocuments() {
  console.log('Starting document embedding...');

  // Read all guide files
  const guideFiles = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));
  const allChunks: DocumentChunk[] = [];

  // Process each guide
  for (const file of guideFiles) {
    console.log(`Processing ${file}...`);
    const content = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf-8');
    const chunks = chunkDocument(content, file);
    allChunks.push(...chunks);
  }

  // Process quick reference
  console.log('Processing QUICK_REFERENCE.md...');
  const quickRefContent = fs.readFileSync(QUICK_REF, 'utf-8');
  const quickRefChunks = chunkDocument(quickRefContent, 'QUICK_REFERENCE.md');
  allChunks.push(...quickRefChunks);

  console.log(`Total chunks: ${allChunks.length}`);

  // Get embeddings in batches
  const batchSize = 100;
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'sensemaker');
  const namespace = index.namespace('spiritdao');

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    console.log(`Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allChunks.length / batchSize)}...`);

    const texts = batch.map(c => c.text);
    const embeddings = await getEmbeddings(texts);

    // Upsert to Pinecone
    const vectors = batch.map((chunk, idx) => ({
      id: chunk.id,
      values: embeddings[idx],
      metadata: {
        text: chunk.text,
        ...chunk.metadata
      }
    }));

    await namespace.upsert(vectors);
    console.log(`Upserted ${vectors.length} vectors`);
  }

  console.log('Embedding complete!');
}

// Run
embedDocuments().catch(console.error);
```

**Add to package.json:**
```json
{
  "scripts": {
    "embed:spiritdao": "ts-node --esm scripts/embed-spiritdao-docs.ts"
  }
}
```

---

### 4. CSS Updates

**File: `src/app/sensemaker-ai/SensemakerAI.module.css`**

Update styles to support the new chat interface instead of iframe.

---

## Implementation Steps

### Phase 1: Infrastructure (1-2 days)
1. ✅ Set up Pinecone account/index
2. ✅ Create two namespaces: `spiritdao` and `temporal-naturalism`
3. ✅ Add environment variables
4. ✅ Install dependencies: `@pinecone-database/pinecone`

### Phase 2: Services (2-3 days)
1. ✅ Create `routingService.ts` - Query classification
2. ✅ Create `pineconeService.ts` - Vector search
3. ✅ Create `responseService.ts` - Response generation
4. ✅ Test each service independently

### Phase 3: API & Frontend (2-3 days)
1. ✅ Create `/api/sensemaker/chat` endpoint
2. ✅ Update frontend to use new chat interface
3. ✅ Update CSS for chat UI
4. ✅ Test end-to-end flow

### Phase 4: Embedding (1 day)
1. ✅ Create embedding script
2. ✅ Run script to embed SpiritDAO docs
3. ✅ Verify embeddings in Pinecone
4. ✅ Test retrieval quality

### Phase 5: Migration (1 day)
1. ✅ Migrate existing Temporal Naturalism content to namespace
2. ✅ Test both knowledge bases
3. ✅ Remove external iframe dependency
4. ✅ Deploy and monitor

---

## Testing Strategy

### Unit Tests
- Test query classification with various inputs
- Test Pinecone retrieval accuracy
- Test response generation quality

### Integration Tests
- Test full chat flow
- Test context switching between knowledge bases
- Test conversation history handling

### User Acceptance Testing
- Test with real user questions
- Verify response quality
- Measure response times
- Gather feedback

---

## Monitoring & Maintenance

### Metrics to Track
- Query classification accuracy
- Response time (target: <3 seconds)
- Context retrieval relevance scores
- User satisfaction (thumbs up/down)
- Error rates

### Regular Updates
- Add new documentation as features release
- Re-embed when guides are updated
- Tune system prompts based on feedback
- Monitor and improve classification logic

---

## Cost Estimates

### OpenAI API
- Classification: ~$0.001 per query (gpt-4o-mini)
- Embedding: ~$0.0001 per 1000 tokens
- Response generation: ~$0.002 per query
- **Total per query: ~$0.003**

### Pinecone
- Free tier: 1 pod (sufficient for testing)
- Production: ~$70/month for standard pod
- Storage: Minimal (<1GB for docs)

### Expected Monthly Cost (1000 queries/day)
- OpenAI: ~$90/month
- Pinecone: $70/month (production) or $0 (free tier)
- **Total: ~$160/month production, ~$90/month free tier**

---

## Rollback Plan

If issues arise:
1. Keep external iframe URL in environment variable
2. Add feature flag to toggle between implementations
3. Can switch back to iframe instantly
4. Gradually migrate users once stable

---

## Future Enhancements

1. **Streaming responses**: Use OpenAI streaming API for real-time responses
2. **Multi-turn conversations**: Better context tracking across messages
3. **User feedback**: Thumbs up/down to improve responses
4. **Analytics**: Track most common questions, improve docs
5. **Voice input**: Add speech-to-text for accessibility
6. **Suggested questions**: Show example queries
7. **Citation links**: Link to specific guide sections in responses
