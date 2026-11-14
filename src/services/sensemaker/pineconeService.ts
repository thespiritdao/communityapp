// src/services/sensemaker/pineconeService.ts

import { pineconeIndexName, PINECONE_PHILOSOPHY_INDEX } from '@/config/deployment.server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

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

export type Namespace = 'spiritdao' | 'temporal-naturalism';

export interface RelevantContext {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Get embedding vector for a query using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[Pinecone] Error getting embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Query Pinecone for relevant context from specified namespace
 * Routes to appropriate index based on query type:
 * - spiritdao: Uses PINECONE_INDEX_NAME with the 'spiritdao' namespace
 * - temporal-naturalism: Uses PINECONE_PHILOSOPHY_INDEX (default namespace)
 */
export async function queryPinecone(
  userMessage: string,
  namespace: Namespace,
  topK: number = 5,
): Promise<RelevantContext[]> {
  // Route to appropriate index based on query type
  let indexName: string = '';
  let useNamespace: boolean = false;

  try {

    if (namespace === 'spiritdao') {
      // DAO queries use sensemaker index with spiritdao namespace
      indexName = pineconeIndexName();
      useNamespace = true;
      console.log(
        `[Pinecone] Querying index: ${indexName}, namespace: ${namespace}`,
      );
    } else {
      // Philosophy queries use the philosophy library index (default namespace)
      if (!PINECONE_PHILOSOPHY_INDEX) {
        throw new Error('PINECONE_PHILOSOPHY_INDEX is not configured');
      }
      indexName = PINECONE_PHILOSOPHY_INDEX;
      useNamespace = false;
      console.log(
        `[Pinecone] Querying index: ${indexName}, namespace: (default)`,
      );
    }

    // Get the index
    const index = getPinecone().index(indexName);

    // Get embedding for user's message
    const embedding = await getEmbedding(userMessage);

    // Query Pinecone (with or without namespace depending on index)
    let queryResponse;

    if (useNamespace) {
      // DAO queries: use explicit namespace
      queryResponse = await index.namespace(namespace).query({
        vector: embedding,
        topK,
        includeMetadata: true,
      });
    } else {
      // Philosophy queries: use default namespace (empty string)
      // the philosophy index stores vectors in the default namespace
      queryResponse = await index.namespace('').query({
        vector: embedding,
        topK,
        includeMetadata: true,
      });
    }

    // Format and return results
    const contexts: RelevantContext[] = queryResponse.matches.map((match) => ({
      content: (match.metadata?.text as string) || '',
      score: match.score || 0,
      metadata: match.metadata,
    }));

    console.log(`[Pinecone] Retrieved ${contexts.length} context chunks`);
    if (contexts.length > 0) {
      console.log(
        `[Pinecone] Top relevance score: ${(contexts[0].score * 100).toFixed(1)}%`,
      );
    }

    return contexts;
  } catch (error: any) {
    console.error('[Pinecone] Query error:', error);
    console.error('[Pinecone] Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      indexName,
      namespace: useNamespace ? namespace : '(default namespace)',
    });

    // Fail loudly: answering with zero context silently degrades every reply.
    // The chat route's step-tagged catch turns this into a visible error.
    throw new Error(`Pinecone retrieval failed: ${error.message}`);
  }
}

/**
 * Check if Pinecone is properly configured
 * Checks the community index and, when configured, the philosophy index
 */
export async function checkPineconeConnection(): Promise<boolean> {
  try {
    // Check sensemaker index (DAO)
    const daoIndexName = pineconeIndexName();
    const daoIndex = getPinecone().index(daoIndexName);
    const daoStats = await daoIndex.describeIndexStats();

    console.log('[Pinecone] DAO index connection successful');
    console.log(`[Pinecone] DAO index: ${daoIndexName}`);
    console.log(`[Pinecone] DAO total vectors: ${daoStats.totalRecordCount}`);
    console.log(
      `[Pinecone] DAO namespaces:`,
      Object.keys(daoStats.namespaces || {}),
    );

    // Check the philosophy library index, when configured
    if (!PINECONE_PHILOSOPHY_INDEX) return true;
    const philIndex = getPinecone().index(PINECONE_PHILOSOPHY_INDEX);
    const philStats = await philIndex.describeIndexStats();

    console.log('[Pinecone] Philosophy index connection successful');
    console.log(`[Pinecone] Philosophy index: ${PINECONE_PHILOSOPHY_INDEX}`);
    console.log(
      `[Pinecone] Philosophy total vectors: ${philStats.totalRecordCount}`,
    );

    return true;
  } catch (error) {
    console.error('[Pinecone] Connection check failed:', error);
    return false;
  }
}

/**
 * Get statistics for a specific namespace
 */
export async function getNamespaceStats(namespace: Namespace): Promise<{
  vectorCount: number;
  dimensionality?: number;
}> {
  try {
    const indexName = pineconeIndexName();
    const index = getPinecone().index(indexName);

    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];

    return {
      vectorCount: namespaceStats?.recordCount || 0,
      dimensionality: stats.dimension,
    };
  } catch (error) {
    console.error(
      `[Pinecone] Error getting stats for namespace ${namespace}:`,
      error,
    );
    return { vectorCount: 0 };
  }
}
