# Sensemaker AI Routing - Required Changes Summary

## Current State
Your Sensemaker AI currently uses an **external iframe** pointing to `spiritdao.pythonanywhere.com/widget` which handles Temporal Naturalism conversations. This needs to be replaced with an in-house solution that can route between two knowledge bases.

---

## What Needs to Change

### 1. **Replace External Iframe with In-House Chat** ⚠️ CRITICAL
**Current:** `src/app/sensemaker-ai/page.tsx` shows an iframe
**New:** Build a proper React chat interface with:
- Message history display
- Input field with send button
- Loading states
- Query type badges (DAO Support vs Philosophy)

🔴 We host this specific LLM (Sensemaker) on three different websites.  (Our book website, singletruth.org, church website spiritdao.org, and in-app)
-- is it necessary to bring it in house for the app? (If yes, can we just duplicate what we have an integrate it)
-- If no (my initial ideal, but if this is not a great idea i am oper to the alternative) then if we can unify it across our process that is ideal


### 2. **Add Routing Layer** 🆕 NEW
**File:** `src/services/sensemaker/routingService.ts`
- Uses GPT-4o-mini to classify queries
- Determines if question is about DAO operations or Temporal Naturalism
- Returns `'spiritdao'` or `'temporal-naturalism'`]
🔴 Great

### 3. **Set Up Pinecone with Two Namespaces** 🆕 NEW
**Namespace 1: `spiritdao`**
- Embed all 7 user guides + QUICK_REFERENCE.md
- Use `text-embedding-3-small` (OpenAI)
- 1536 dimensions
🔴 Great

**Namespace 2: `temporal-naturalism`**
- Migrate existing Temporal Naturalism content
- Keep current configuration
🔴 Great - keep in mind that this specific chatbot route is academic focused, intended to site dense sources

### 4. **Create Pinecone Service** 🆕 NEW
**File:** `src/services/sensemaker/pineconeService.ts`
- Query Pinecone for relevant context
- Support both namespaces
- Return top 5 most relevant chunks
🔴 Great

### 5. **Create Response Generation Service** 🆕 NEW
**File:** `src/services/sensemaker/responseService.ts`
- Two system prompts:
  - **SpiritDAO Support Prompt**: Helpful assistant for DAO operations
  - **Temporal Naturalism Prompt**: Keep existing philosophical prompt
- Uses retrieved context from Pinecone
- Generates responses with GPT-4o-mini
🔴 Can we use a better model for the Temporal Naturalism flow?  (Given the context and nuance it requires) - I imagine the DAO instruction flow will be more reference/return and 4o mini works without issue?
🔴 Should we use Claude over ChatGpt for any of these?  Benefits?

### 6. **Create Main Chat API** 🆕 NEW
**File:** `src/app/api/sensemaker/chat/route.ts`
- POST endpoint accepting user messages
- Orchestrates the full flow:
  1. Classify query → routing service
  2. Retrieve context → Pinecone service
  3. Generate response → response service
- Returns response + query type

### 7. **Create Embedding Script** 🆕 NEW
**File:** `scripts/embed-spiritdao-docs.ts`
- Reads all guide files from `src/guides/user/`
- Chunks documents (1000 tokens, 200 overlap)
- Creates embeddings with OpenAI
- Uploads to Pinecone `spiritdao` namespace
- Run with: `npm run embed:spiritdao`

### 8. **Environment Variables** ⚙️ ADD
```env
PINECONE_API_KEY=xxx
PINECONE_ENVIRONMENT=xxx
PINECONE_INDEX_NAME=sensemaker
OPENAI_API_KEY=xxx  # Already exists
```

---

## File Structure (New Files)

```
src/
├── services/
│   └── sensemaker/
│       ├── routingService.ts        # NEW - Query classifier
│       ├── pineconeService.ts       # NEW - Vector search
│       └── responseService.ts       # NEW - Response generation
├── app/
│   ├── api/
│   │   └── sensemaker/
│   │       ├── chat/
│   │       │   └── route.ts         # NEW - Main chat endpoint
│   │       └── summarize/
│   │           └── route.ts         # KEEP - Forum summarization
│   └── sensemaker-ai/
│       ├── page.tsx                 # MODIFY - Replace iframe with chat
│       └── SensemakerAI.module.css  # MODIFY - Update styles
└── guides/
    └── user/                        # ALREADY EXISTS - Will be embedded
        ├── 01-getting-started.md
        ├── 02-pod-management.md
        ├── 03-governance-voting.md
        ├── 04-bounties-system.md
        ├── 05-events-calendar.md
        ├── 06-forum-discussions.md
        └── 07-marketplace-shopping.md

scripts/
└── embed-spiritdao-docs.ts          # NEW - Embedding script
```

---

## Dependencies to Install

```bash
npm install @pinecone-database/pinecone
```

*(OpenAI SDK already installed)*

---

## Implementation Order

### Step 1: Infrastructure Setup (Start Here)
1. Create Pinecone account/index
2. Create two namespaces: `spiritdao`, `temporal-naturalism`
3. Add environment variables to `.env.local`
4. Install Pinecone SDK

### Step 2: Create Services
1. Create `routingService.ts`
2. Create `pineconeService.ts`
3. Create `responseService.ts`
4. Test each service independently

### Step 3: Create API
1. Create `/api/sensemaker/chat/route.ts`
2. Test API with Postman/Thunder Client

### Step 4: Embed Documents
1. Create embedding script
2. Run: `npm run embed:spiritdao`
3. Verify in Pinecone dashboard

### Step 5: Update Frontend
1. Replace iframe in `page.tsx` with chat interface
2. Update CSS
3. Test end-to-end

### Step 6: Migrate Temporal Naturalism
1. Move existing content to `temporal-naturalism` namespace
2. Test both paths work
3. Remove external iframe dependency

---

## Key Differences from Current Implementation

| Aspect | Current | New |
|--------|---------|-----|
| **Hosting** | External iframe | In-house React component |
| **Knowledge Base** | Single (Temporal Naturalism) | Dual (DAO + Philosophy) |
| **Routing** | None | Intelligent classification |
| **Context Retrieval** | Unknown | Pinecone vector search |
| **Integration** | Isolated | Fully integrated with app |
| **Customization** | Limited | Full control |

---

## Testing Checklist

### DAO Support Queries
- [ ] "How do I vote on a proposal?"
- [ ] "How do I join a pod?"
- [ ] "Where is the marketplace?"
- [ ] "How do I create a bounty?"
- [ ] "What is an Advocate NFT?"

### Temporal Naturalism Queries
- [ ] "What is temporal naturalism?"
- [ ] "Explain the nature of time"
- [ ] "What is causality?"

### Edge Cases
- [ ] Empty message
- [ ] Very long message
- [ ] Rapid successive messages
- [ ] Network failure handling

---

## Rollback Strategy

If issues occur:
1. Keep iframe URL in environment variable
2. Add feature flag: `ENABLE_NEW_SENSEMAKER=true/false`
3. Conditionally render iframe vs new chat
4. Can instantly switch back if needed

---

## Cost Impact

### Current Cost: $0 (external hosting)

### New Monthly Cost (estimated 1000 queries/day):
- **OpenAI API**: ~$90/month
  - Query classification: ~$30
  - Embeddings: ~$5 (one-time, then minimal)
  - Response generation: ~$55
- **Pinecone**: $0 (free tier) or $70/month (production)

**Total: $90-$160/month** (depending on Pinecone tier)

---

## Questions to Address

1. **Do you have existing Temporal Naturalism content?**
   - If yes, where is it stored? We need to embed it into Pinecone namespace

2. **What's the priority?**
   - Should we implement DAO support first, then add Temporal Naturalism?
   - Or build both simultaneously?

3. **Pinecone account**
   - Do you already have a Pinecone account?
   - Free tier is fine for testing/MVP

4. **OpenAI API usage**
   - Confirm you have API access and budget for increased usage

5. **Timeline**
   - Estimated 5-7 days for full implementation
   - Can do MVP in 2-3 days (DAO support only)

---

## Next Steps

1. **Review this document** and the detailed architecture plan
2. **Decide on implementation approach** (MVP vs full)
3. **Set up Pinecone account** and create index
4. **I can begin implementing** once you approve the approach

Would you like me to:
- Start with MVP (DAO support only)?
- Build full routing system immediately?
- Create a proof-of-concept first?

---

**Full detailed architecture available in:**
`src/guides/development/SENSEMAKER_ROUTING_ARCHITECTURE.md`
