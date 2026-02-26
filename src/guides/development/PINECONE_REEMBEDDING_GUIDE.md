# Pinecone Re-Embedding Guide

## Overview

The Sensemaker AI uses two Pinecone indexes:

| Index | Purpose | URL |
|---|---|---|
| `sensemaker` | SpiritDAO platform docs (DAO guides) | Uses `PINECONE_INDEX_NAME` env var |
| `spiritdao-books` | Temporal Naturalism philosophy texts | `spiritdao-books-5wdtdz8.svc.aped-4627-b74a.pinecone.io` |

The source files for the `sensemaker` index live in:
```
src/guides/user/
  01-getting-started.md        ← updated (added video chat, KB, tour)
  02-pod-management.md
  03-governance-voting.md
  04-bounties-system.md
  05-events-calendar.md
  06-forum-discussions.md
  07-marketplace-shopping.md
  08-video-chat-conferencing.md  ← NEW
  09-app-walkthrough.md          ← NEW
```

---

## When to Re-Embed

Re-embed the `sensemaker` index whenever:
- A guide file is added or significantly updated
- A new platform feature launches
- The app tour or onboarding changes

The `spiritdao-books` index only needs re-embedding when new philosophical source texts are added.

---

## How to Re-Embed (Node.js Script)

You will need:
- `OPENAI_API_KEY` — for generating embeddings (text-embedding-3-small)
- `PINECONE_API_KEY` — for upserting vectors
- `PINECONE_INDEX_NAME` — the name of your sensemaker index (e.g., `sensemaker`)

### Step 1: Install dependencies (if not already installed)

```bash
npm install @pinecone-database/pinecone openai gray-matter
```

### Step 2: Create the embedding script

Save this as `scripts/embed-guides.ts` (or `.js`):

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const GUIDES_DIR = path.join(process.cwd(), 'src/guides/user');
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'sensemaker';
const NAMESPACE = 'spiritdao'; // DAO docs namespace

// Split markdown into chunks of ~500 tokens (~2000 chars)
function chunkText(text: string, chunkSize = 2000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += '\n\n' + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

async function embedGuides() {
  const index = pinecone.index(INDEX_NAME);
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));

  console.log(`Found ${files.length} guide files to embed`);

  // Clear existing vectors in the spiritdao namespace first
  console.log('Clearing existing vectors in spiritdao namespace...');
  await index.namespace(NAMESPACE).deleteAll();
  console.log('Cleared.');

  let totalVectors = 0;

  for (const file of files) {
    const filePath = path.join(GUIDES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content);

    console.log(`\nEmbedding ${file} (${chunks.length} chunks)...`);

    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      vectors.push({
        id: `${file}-chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunk,
          source: file,
          chunkIndex: i,
        },
      });

      // Small delay to avoid rate limits
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 200));
    }

    // Upsert in batches of 100
    for (let i = 0; i < vectors.length; i += 100) {
      const batch = vectors.slice(i, i + 100);
      await index.namespace(NAMESPACE).upsert(batch);
      totalVectors += batch.length;
    }

    console.log(`  ✓ ${file}: ${vectors.length} vectors upserted`);
  }

  console.log(`\n✅ Done! Total vectors upserted: ${totalVectors}`);
}

embedGuides().catch(console.error);
```

### Step 3: Run the script

```bash
npx ts-node scripts/embed-guides.ts
```

Or with environment variables inline:
```bash
OPENAI_API_KEY=sk-... PINECONE_API_KEY=... PINECONE_INDEX_NAME=sensemaker npx ts-node scripts/embed-guides.ts
```

---

## Verify the Embedding

After running, verify vectors were upserted:

```typescript
const index = pinecone.index(INDEX_NAME);
const stats = await index.describeIndexStats();
console.log(stats); // Should show vector counts per namespace
```

Or test a query:
```typescript
const results = await index.namespace('spiritdao').query({
  vector: await getEmbedding('how do I join a pod'),
  topK: 3,
  includeMetadata: true,
});
console.log(results.matches.map(m => m.metadata?.source));
// Should return guide file names
```

---

## Notes

- The `spiritdao-books` index is separate and contains Temporal Naturalism philosophical texts. It uses the same embedding model (`text-embedding-3-small`) but a different index/namespace. Contact the original Pinecone setup owner to re-embed those if the index was deleted.
- Pinecone free tier has a 100k vector limit — the full guide set uses well under 1k vectors.
- The routing service uses `PINECONE_INDEX_NAME` env var (defaults to `'sensemaker'`). The philosophy path uses the hardcoded index name `spiritdao-books` in `pineconeService.ts`.
