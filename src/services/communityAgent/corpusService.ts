// src/services/communityAgent/corpusService.ts
//
// Per-pod RAG retrieval for community agents.
// Reuses the same Pinecone account and embedding model as Sensemaker.
// Each pod gets namespace `agent-{podId}`.
// The Kairos pod also queries the shared philosophy index (PINECONE_PHILOSOPHY_INDEX).

import { PINECONE_PHILOSOPHY_INDEX } from '@/config/deployment.server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { KAIROS_POD_ID, type RelevantContext } from './types';

let _pinecone: Pinecone | null = null;
function getPinecone() {
  if (!_pinecone) _pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  return _pinecone;
}

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

const SENSEMAKER_INDEX = 'sensemaker';
const BOOKS_INDEX = PINECONE_PHILOSOPHY_INDEX;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

async function getEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIM,
  });
  return response.data[0].embedding;
}

/**
 * Query the pod-specific agent corpus.
 * For the Kairos pod, also queries the shared philosophy index and merges results.
 */
export async function queryAgentCorpus(
  podId: string,
  query: string,
  topK: number = 8,
): Promise<RelevantContext[]> {
  try {
    const embedding = await getEmbedding(query);
    const namespace = `agent-${podId}`;
    const results: RelevantContext[] = [];

    // Query pod-specific namespace in sensemaker index
    try {
      const index = getPinecone().index(SENSEMAKER_INDEX);
      const response = await index.namespace(namespace).query({
        vector: embedding,
        topK,
        includeMetadata: true,
      });
      for (const match of response.matches) {
        results.push({
          content: (match.metadata?.text as string) || '',
          score: match.score || 0,
          metadata: match.metadata,
        });
      }
    } catch (err) {
      console.warn(`[AgentCorpus] Pod namespace query failed for ${namespace}:`, err);
    }

    // For the Kairos pod, also query the shared philosophy index
    if (podId === KAIROS_POD_ID && BOOKS_INDEX) {
      try {
        const booksIndex = getPinecone().index(BOOKS_INDEX);
        const booksResponse = await booksIndex.namespace('').query({
          vector: embedding,
          topK,
          includeMetadata: true,
        });
        for (const match of booksResponse.matches) {
          results.push({
            content: (match.metadata?.text as string) || '',
            score: match.score || 0,
            metadata: { ...match.metadata, source_index: BOOKS_INDEX },
          });
        }
      } catch (err) {
        console.warn('[AgentCorpus] philosophy index query failed:', err);
      }
    }

    // Sort by score descending, take top results
    results.sort((a, b) => b.score - a.score);
    const finalResults = results.slice(0, topK);

    console.log(
      `[AgentCorpus] Pod ${podId}: ${finalResults.length} chunks retrieved` +
        (finalResults.length > 0 ? `, top score: ${(finalResults[0].score * 100).toFixed(1)}%` : ''),
    );

    return finalResults;
  } catch (error) {
    console.error('[AgentCorpus] Query error:', error);
    return [];
  }
}

/**
 * Upload documents to a pod's agent corpus.
 * Chunks text, embeds, and upserts to Pinecone.
 */
export async function uploadToAgentCorpus(
  podId: string,
  chunks: { text: string; metadata?: Record<string, any> }[],
): Promise<{ upserted: number }> {
  const namespace = `agent-${podId}`;
  const index = getPinecone().index(SENSEMAKER_INDEX);
  const ns = index.namespace(namespace);

  let upserted = 0;
  const batchSize = 100;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);

    const embeddingResponse = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
    });

    const vectors = batch.map((chunk, idx) => ({
      id: `${podId}-${Date.now()}-${i + idx}`,
      values: embeddingResponse.data[idx].embedding,
      metadata: {
        text: chunk.text,
        pod_id: podId,
        uploaded_at: new Date().toISOString(),
        ...(chunk.metadata || {}),
      },
    }));

    await ns.upsert(vectors);
    upserted += vectors.length;
  }

  console.log(`[AgentCorpus] Uploaded ${upserted} vectors to namespace ${namespace}`);
  return { upserted };
}

/**
 * Get corpus statistics for a pod.
 */
export async function getCorpusStats(podId: string): Promise<{ vectorCount: number }> {
  try {
    const namespace = `agent-${podId}`;
    const index = getPinecone().index(SENSEMAKER_INDEX);
    const stats = await index.describeIndexStats();
    const nsStats = stats.namespaces?.[namespace];
    return { vectorCount: nsStats?.recordCount || 0 };
  } catch (error) {
    console.error(`[AgentCorpus] Stats error for pod ${podId}:`, error);
    return { vectorCount: 0 };
  }
}

/**
 * Delete all vectors in a pod's namespace (for document removal).
 */
export async function deleteFromCorpus(
  podId: string,
  filter?: { documentName?: string },
): Promise<void> {
  const namespace = `agent-${podId}`;
  const index = getPinecone().index(SENSEMAKER_INDEX);
  const ns = index.namespace(namespace);

  if (filter?.documentName) {
    // Delete vectors with matching document_name metadata
    await ns.deleteMany({ document_name: { $eq: filter.documentName } });
  } else {
    // Delete entire namespace
    await ns.deleteAll();
  }

  console.log(`[AgentCorpus] Deleted vectors from namespace ${namespace}`);
}
