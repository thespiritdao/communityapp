# RAG Stack — Community Agent & Sensemaker

*Last updated: 2026-05-23*

The app has two distinct retrieval-augmented-generation stacks:

1. **Community Agent** — per-pod, opt-in (paid), domain-specific to
   each pod's content.
2. **Sensemaker** — DAO-wide, routes between SpiritDAO knowledge and
   Temporal Naturalism knowledge.

They share primitives (Pinecone, OpenAI) but are deployed and operated
independently. This doc explains both and when each applies.

## Community Agent (per pod)

### What it is

A pod-scoped AI assistant that:

- Posts a **daily message** to the pod's chat or forum (cron-driven)
- Posts a **weekly events summary** (cron-driven)
- Responds to **@-mentions** in forum posts (cron-driven, near-real-time)

Each pod can have at most one community agent. Agents are opt-in:
a pod leader enables the module, configures the agent, and pays the
subscription via $SYSTEM burn.

### Files

```
src/services/communityAgent/
├── agentService.ts       Orchestration — load config, gather context, call OpenAI
├── chatHandler.ts        Posts to the pod's chat group as the agent user
├── configService.ts      Per-pod agent config (name, persona, channels, cadence)
├── corpusService.ts      Manage Pinecone vectors for this pod's corpus
├── mentionService.ts     Queue + process @-mentions of the agent
├── types.ts              deriveAgentWallet, AgentConfig, etc.
└── prompts/
    └── default.ts        Base system prompt template
```

### Identity

Each agent has a deterministic synthetic wallet derived from the
pod ID (`deriveAgentWallet(podId)`). This wallet appears in the
`user_profiles` table as a normal user so @-mention autocomplete
finds it.

The agent never holds real keys or signs transactions — its wallet is
purely an identity placeholder. All on-chain actions on behalf of
the agent (e.g. event creation) go through the EOA admin path with
the agent name as an attribution.

### Corpus

A pod's corpus is a set of vectors in Pinecone (index:
`spiritdao-community-agents`, namespace: `pod-<id>`). Sources:

- Forum posts in the pod (auto-ingested)
- Knowledge base items linked to the pod
- Uploaded documents (via `corpusService.uploadDocument`)

Re-indexing happens on document upload or on a manual trigger from
`PodAgentsPanel`. Forum post auto-ingest is handled by a hook on
new-post creation (`recordExplorerEvent` side-effect chain — see
Pulse).

### Subscription model

- Free tier: agent posts daily and weekly, responds to mentions, but
  context window is small and posts are short.
- Paid tier: extended context window, longer posts, custom persona.

Billing is handled outside this RAG stack — see
`community_agent_subscriptions` table and the `check-subscriptions`
cron. When subscription expires, the agent quietly stops posting; the
`PodAgentsPanel` shows the renewal prompt.

### Permissions

The `agentManage` role permission (added 2026-05-22) lets a non-leader
configure the agent. Billing actions remain leader-only regardless.

### Cron schedule

| Schedule | Cron | What |
|---|---|---|
| `*/2 * * * *` | `community-agent/process-mentions` | Drain mention queue |
| `0 12 * * *` | `community-agent/daily-post` | All active agents post daily content |
| `0 14 * * 0` | `community-agent/weekly-events` | All active agents post weekly events |
| `0 0 * * *` | `community-agent/check-subscriptions` | Expire/renew/notify on subscription state |

## Sensemaker (DAO-wide)

### What it is

A single, app-wide assistant accessible to any authenticated user.
Used for "ask the platform" questions: where do I find X, how does
governance work, what's our position on Y.

### Files

```
src/services/sensemaker/
├── pineconeService.ts   Vector store interaction (two namespaces)
├── routingService.ts    Decide which knowledge base to query
├── responseService.ts   Generate response from retrieved context
```

### Two knowledge bases

Sensemaker routes between two Pinecone namespaces:

1. **`spiritdao`** — General platform knowledge: how to use the app,
   governance model, terminology, public-facing docs.
2. **`temporal-naturalism`** — Worldview content specific to the
   Temporal Naturalism community.

The routing service classifies each query and picks the right
namespace (or both). This avoids polluting general platform answers
with worldview-specific content and vice versa.

### Operational model

Unlike Community Agent, Sensemaker:

- Is not pod-scoped — same instance for every user.
- Has no scheduled tasks — purely query/response.
- Is not gated by any module or permission (any authenticated user).
- Is free.

### API surface

```
POST /api/sensemaker/query   { query: string } → { response: string, sources: [] }
```

## Shared infrastructure

Both stacks use:

- **OpenAI** for embeddings (`text-embedding-3-small`) and completion
  (`gpt-4o-mini` or similar — see env vars).
- **Pinecone** for vector storage.
- **Supabase** for any per-namespace metadata not stored in Pinecone.

Env vars (representative):
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX` (for sensemaker)
- `PINECONE_COMMUNITY_AGENT_INDEX` (for community agents)

## When to use which

| Use case | Stack |
|---|---|
| User asks "how do I claim a token?" | Sensemaker |
| User asks "what bounties did the Marketing pod ship last week?" | Community Agent (Marketing pod) |
| Auto-generated forum digest for a specific pod | Community Agent |
| App-wide help chat / search | Sensemaker |

Rough rule: **if the answer depends on which pod you're in, use
Community Agent.** If the answer is the same for every user, use
Sensemaker.

## Adding new content to a knowledge base

### Sensemaker (manual)

1. Add the content as Markdown.
2. Run the ingest script (varies — check `scripts/`) pointing at the
   `spiritdao` namespace.
3. Verify retrieval via the query API.

### Community Agent (auto + manual)

- Forum posts and KB items linked to the pod auto-ingest on creation.
- For external content (PDFs, docs), use the upload UI in
  `PodAgentsPanel` → calls `corpusService.uploadDocument`.

## Failure modes

- **Pinecone outage:** all RAG queries degrade. Community Agent
  posts skipped silently (cron continues). Sensemaker returns an
  error to the user.
- **OpenAI rate limit:** queries queued with backoff; severe limits
  surface as 503s.
- **Empty corpus:** Community Agent falls back to generic posts (no
  pod-specific context). Sensemaker tells the user it doesn't know.

## File map

| Path | Role |
|---|---|
| `src/services/communityAgent/` | Per-pod agent stack |
| `src/services/sensemaker/` | DAO-wide assistant |
| `src/app/api/community-agent/` | Per-pod agent API routes |
| `src/app/api/sensemaker/` | Sensemaker API routes |
| `src/app/api/cron/community-agent/` | Scheduled jobs |
| `src/features/pods/components/PodAgentsPanel.tsx` | Per-pod agent config UI |
