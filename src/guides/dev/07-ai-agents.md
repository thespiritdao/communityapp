# SpiritDAO: AI Agents (Developer Documentation)

> **Audience:** developers and technical evaluators. This document describes the
> two distinct AI systems in the app, their models, and their RAG architecture.
>
> **Scope note:** This is public-safe documentation. It describes architecture
> and model choices. It omits secret values (API keys, index credentials) and
> security-sensitive internals.
>
> **Model guidance:** when building new AI features here, default to the **latest
> Claude models**. The model IDs below are current as of writing.

---

## Two distinct systems

The app runs **two separate AI systems**. They share infrastructure (Anthropic
Claude, OpenAI embeddings, Pinecone) but serve different audiences and live in
different code paths.

| | Community Agent | Sensemaker |
|---|---|---|
| Audience | members, **per pod** | the public |
| Job | generate forum/chat replies, daily prompts, event copy | answer Q&A about the DAO + philosophy |
| Code | `src/services/communityAgent/` | `src/services/sensemaker/` + `/api/sensemaker/chat` |

---

## 1. Community Agent

A **per-pod** agent that participates in a pod's spaces: it generates forum and
chat replies, daily discussion prompts, and event descriptions. Each pod
configures its own agent (persona, corpus, enablement).

**Models** (`agentService.ts`):
- `claude-sonnet-4-6` for complex tasks
- `claude-haiku-4-5-20251001` for simple tasks
- The agent picks the model per task (a `useSonnet` decision).

**RAG** (per-pod):
- **Pinecone** index `sensemaker`, namespace **`agent-{podId}`**: each pod has
  its own retrieval namespace (`configService.ts` defaults to `agent-${podId}`).
- The Temporal Naturalism pod's **"Kairos"** persona additionally draws on the
  **`spiritdao-books`** index for philosophy grounding.
- Embeddings: **OpenAI `text-embedding-3-small`** (1536-dim).

**Config:** per-pod settings live in the **`pod_modules`** table (see
`05-data-model-and-rls.md`). The Community Agent is the **Paid** module tier: a
pod enables it via a **25 $SYSTEM / month** subscription (on-chain verified, with
pause/resume) through `POST /api/community-agent/subscribe`, separate from the
`community_agent_enabled` toggle.

**Files:**
- `agentService.ts`: model selection, generation
- `corpusService.ts`: per-pod corpus / RAG retrieval
- `configService.ts`: per-pod config (namespace, persona, toggles)
- `chatHandler.ts`: chat-surface integration
- `mentionService.ts`: mention handling
- `prompts/kairos.ts`: the Kairos persona prompt (Temporal Naturalism pod)
- `prompts/default.ts`: default agent persona

---

## 2. Sensemaker

A **public-facing Q&A assistant** (no sign-in required; rate-limited to 10/min,
see `06-api-reference.md`). It answers two kinds of questions and routes between
them.

**Routing** (`routingService.ts`):
- **`claude-haiku-4-5-20251001`** classifies each query as either
  **`spiritdao`** (DAO-operations questions) or **`temporal-naturalism`**
  (philosophy).

**Answering** (`responseService.ts`):
- DAO questions → answered by **Haiku 4.5** (`claude-haiku-4-5-20251001`).
- Philosophy questions → answered by **Sonnet 4.6** (`claude-sonnet-4-6`).

**RAG** (`pineconeService.ts`):
- DAO queries → Pinecone index **`sensemaker`**, namespace **`spiritdao`**.
- Philosophy queries → index **`spiritdao-books`** (default namespace).
- Embeddings: **OpenAI `text-embedding-3-small`**.

**Knowledge sources:**
- The `spiritdao` namespace is embedded from **`src/guides/user/*.md`** plus
  `spiritdao-operations-guide.md`, via **`npm run embed:spiritdao`**.
- DAO knowledge is **also partly a hardcoded system prompt** in
  `responseService.ts`, so updating Sensemaker's DAO answers can mean updating
  *both* the embedded corpus and that system prompt.

**Files:**
- `routingService.ts`: query classification
- `responseService.ts`: answer generation + the hardcoded DAO system prompt
- `pineconeService.ts`: index/namespace selection + retrieval
- `src/app/api/sensemaker/chat/route.ts`: the public endpoint (chat, logging, health)

> Public Sensemaker chats are logged via an anonymous-insert path (see
> `05-data-model-and-rls.md`).

---

## Aside: the legacy standalone chatbot (being retired)

There is a **separate, standalone Flask chatbot** at
`src/sensemaker/spiritdao_chatbot/`: **OpenAI GPT**, **philosophy-only**, hosted
on **PythonAnywhere**, and historically embedded on the marketing website.

It is **being retired** in favor of embedding the **in-app Sensemaker** described
above. It is documented here only so the duplication isn't mistaken for a second
active system. New AI work should target the in-app Sensemaker / Community Agent
(Claude), not this Flask app.

---

## Where to go next

- **`05-data-model-and-rls.md`**: `pod_modules` config + conversation logging
- **`06-api-reference.md`**: `/community-agent` and `/sensemaker` route groups
- **`04-governance-and-pods.md`**: how pods (and the per-pod agent) are scoped
