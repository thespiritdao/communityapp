// src/services/sensemaker/pineconeService.ts

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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
    const response = await openai.embeddings.create({
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
 * - spiritdao: Uses 'sensemaker' index with 'spiritdao' namespace
 * - temporal-naturalism: Uses existing 'spiritdao-books' index
 */
export async function queryPinecone(
  userMessage: string,
  namespace: Namespace,
  topK: number = 5,
): Promise<RelevantContext[]> {
  try {
    // Route to appropriate index based on query type
    let indexName: string;
    let useNamespace: boolean;

    if (namespace === 'spiritdao') {
      // DAO queries use sensemaker index with spiritdao namespace
      indexName = process.env.PINECONE_INDEX_NAME || 'sensemaker';
      useNamespace = true;
      console.log(
        `[Pinecone] Querying index: ${indexName}, namespace: ${namespace}`,
      );
    } else {
      // Philosophy queries use existing spiritdao-books index (default namespace)
      indexName = 'spiritdao-books';
      useNamespace = false;
      console.log(
        `[Pinecone] Querying index: ${indexName}, namespace: (default)`,
      );
    }

    // Get the index
    const index = pinecone.index(indexName);

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
      // spiritdao-books stores vectors in the default namespace
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

    // Return empty array on error instead of throwing
    // This allows the chat to continue with no context rather than failing
    console.warn('[Pinecone] Returning empty context due to error');
    return [];
  }
}

/**
 * Check if Pinecone is properly configured
 * Checks both sensemaker (DAO) and spiritdao-books (Philosophy) indexes
 */
export async function checkPineconeConnection(): Promise<boolean> {
  try {
    // Check sensemaker index (DAO)
    const daoIndexName = process.env.PINECONE_INDEX_NAME || 'sensemaker';
    const daoIndex = pinecone.index(daoIndexName);
    const daoStats = await daoIndex.describeIndexStats();

    console.log('[Pinecone] DAO index connection successful');
    console.log(`[Pinecone] DAO index: ${daoIndexName}`);
    console.log(`[Pinecone] DAO total vectors: ${daoStats.totalRecordCount}`);
    console.log(
      `[Pinecone] DAO namespaces:`,
      Object.keys(daoStats.namespaces || {}),
    );

    // Check spiritdao-books index (Philosophy)
    const philIndex = pinecone.index('spiritdao-books');
    const philStats = await philIndex.describeIndexStats();

    console.log('[Pinecone] Philosophy index connection successful');
    console.log(`[Pinecone] Philosophy index: spiritdao-books`);
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
    const indexName = process.env.PINECONE_INDEX_NAME || 'sensemaker';
    const index = pinecone.index(indexName);

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
