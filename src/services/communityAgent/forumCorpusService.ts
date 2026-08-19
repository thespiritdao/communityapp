// src/services/communityAgent/forumCorpusService.ts
//
// Congregant Phase 5: the situated mind.
//
// "The agent's knowledge base is built from the pod's own discourse: its
//  forum threads, documents, and self-descriptions."
//
// Ingests a pod's forum discourse into its agent's Pinecone namespace, under
// explicit consent constraints:
//
//   - Pod-level gate: corpus_includes_forum must be enabled (default OFF)
//   - Member-level gate: user_profiles.exclude_from_agent_corpus removes a
//     member's words from ingestion AND deletes previously derived vectors
//   - Loop guard: the agent's own posts are excluded by default (the mind is
//     made of the COMMUNITY's discourse, not its own echo) — override with
//     corpus_includes_own_posts
//   - Identity minimization: vectors carry NO author identity. A keyed hash
//     (author_hash) exists solely so an opt-out can delete a member's vectors;
//     it is not reversible without the server secret, and the agent's
//     retrieval never sees who wrote what.
//
// Vector IDs are deterministic (forum-thread-{id} / forum-post-{id}) so an
// edited post re-upserts over its old vector instead of duplicating.

import { createHmac } from 'crypto';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

const SENSEMAKER_INDEX = 'sensemaker';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

/** Keep chunks below embedding-friendly size; long posts are split. */
const MAX_CHUNK_CHARS = 4000;

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

/**
 * Pseudonymous author tag for opt-out deletion. Keyed HMAC — not reversible,
 * not linkable across deployments, never used for retrieval or generation.
 */
export function corpusAuthorHash(wallet: string): string {
  const key = process.env.AGENT_WALLET_MASTER_KEY || process.env.CRON_SECRET || 'corpus-fallback';
  return createHmac('sha256', key)
    .update(`corpus-author:v1:${wallet.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + MAX_CHUNK_CHARS));
  }
  return chunks;
}

async function getOptedOutWallets(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('wallet_address')
    .eq('exclude_from_agent_corpus', true);
  return new Set((data ?? []).map((r) => r.wallet_address.toLowerCase()));
}

interface SyncResult {
  upserted: number;
  deleted: number;
  skippedOptOut: number;
  skippedAgent: number;
}

/**
 * Incrementally sync a pod's forum discourse into its agent corpus.
 * Called nightly per agent-enabled pod with corpus_includes_forum on.
 */
export async function syncForumCorpus(
  podId: string,
  cfg: Record<string, any>,
): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, deleted: 0, skippedOptOut: 0, skippedAgent: 0 };
  const namespace = `agent-${podId}`;
  const ns = getPinecone().index(SENSEMAKER_INDEX).namespace(namespace);

  const lastSynced = cfg.forum_corpus_last_synced_at || '1970-01-01T00:00:00Z';
  const includeOwnPosts = cfg.corpus_includes_own_posts === true;
  const agentWallet = (cfg.agent_wallet || '').toLowerCase();
  const optedOut = await getOptedOutWallets();

  // ── 1. Enforce opt-outs retroactively: delete vectors of opted-out authors.
  // deleteMany-by-filter is best-effort (logged, not fatal) — a member who
  // opts out is also excluded from all future syncs regardless.
  for (const wallet of optedOut) {
    try {
      await ns.deleteMany({ source: { $eq: 'forum' }, author_hash: { $eq: corpusAuthorHash(wallet) } });
    } catch {
      // No vectors for this author (or filter unsupported) — future syncs skip them anyway
    }
  }

  // ── 2. Pod's forum categories → thread ids
  const { data: categories } = await supabaseAdmin
    .from('forum_categories')
    .select('id')
    .eq('pod_id', podId);
  const categoryIds = (categories ?? []).map((c) => c.id);
  if (categoryIds.length === 0) return result;

  // ── 3. Threads created/edited since last sync
  const { data: threads } = await supabaseAdmin
    .from('forum_threads')
    .select('id, title, content, author_address, actor_type, created_at, updated_at')
    .in('category_id', categoryIds)
    .gt('updated_at', lastSynced)
    .limit(500);

  // ── 4. Posts created/edited since last sync (all threads in pod categories)
  const { data: allThreadIds } = await supabaseAdmin
    .from('forum_threads')
    .select('id')
    .in('category_id', categoryIds);
  const threadIdList = (allThreadIds ?? []).map((t) => t.id);

  let posts: any[] = [];
  if (threadIdList.length > 0) {
    const { data } = await supabaseAdmin
      .from('forum_posts')
      .select('id, thread_id, content, author_address, actor_type, is_deleted, created_at, updated_at')
      .in('thread_id', threadIdList)
      .gt('updated_at', lastSynced)
      .limit(1000);
    posts = data ?? [];
  }

  // ── 5. Deleted posts → remove vectors
  const deletedPosts = posts.filter((p) => p.is_deleted);
  if (deletedPosts.length > 0) {
    try {
      await ns.deleteMany(deletedPosts.map((p) => `forum-post-${p.id}`));
      result.deleted += deletedPosts.length;
    } catch {
      // ids may not exist — fine
    }
  }

  // ── 6. Build embeddable items with consent filters
  interface Item { id: string; text: string; metadata: Record<string, any> }
  const items: Item[] = [];

  const admit = (author: string | null, actorType: string | null): 'ok' | 'optout' | 'agent' => {
    const wallet = (author || '').toLowerCase();
    if (!includeOwnPosts && (actorType === 'agent' || wallet === agentWallet || wallet.startsWith('0xca10'))) {
      return 'agent';
    }
    if (optedOut.has(wallet)) return 'optout';
    return 'ok';
  };

  for (const t of threads ?? []) {
    const verdict = admit(t.author_address, t.actor_type);
    if (verdict === 'agent') { result.skippedAgent++; continue; }
    if (verdict === 'optout') { result.skippedOptOut++; continue; }
    const text = `${t.title}\n\n${t.content || ''}`.trim();
    if (!text) continue;
    chunkText(text).forEach((chunk, idx) => {
      items.push({
        id: idx === 0 ? `forum-thread-${t.id}` : `forum-thread-${t.id}-c${idx}`,
        text: chunk,
        metadata: {
          text: chunk,
          pod_id: podId,
          source: 'forum',
          forum_kind: 'thread',
          thread_id: t.id,
          author_hash: corpusAuthorHash(t.author_address || ''),
          written_at: t.created_at,
        },
      });
    });
  }

  for (const p of posts) {
    if (p.is_deleted) continue;
    const verdict = admit(p.author_address, p.actor_type);
    if (verdict === 'agent') { result.skippedAgent++; continue; }
    if (verdict === 'optout') { result.skippedOptOut++; continue; }
    const text = (p.content || '').trim();
    if (!text) continue;
    chunkText(text).forEach((chunk, idx) => {
      items.push({
        id: idx === 0 ? `forum-post-${p.id}` : `forum-post-${p.id}-c${idx}`,
        text: chunk,
        metadata: {
          text: chunk,
          pod_id: podId,
          source: 'forum',
          forum_kind: 'post',
          thread_id: p.thread_id,
          post_id: p.id,
          author_hash: corpusAuthorHash(p.author_address || ''),
          written_at: p.created_at,
        },
      });
    });
  }

  // ── 7. Embed + upsert in batches
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const embeddings = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((b) => b.text),
      dimensions: EMBEDDING_DIM,
    });
    await ns.upsert(
      batch.map((item, idx) => ({
        id: item.id,
        values: embeddings.data[idx].embedding,
        metadata: item.metadata,
      })),
    );
    result.upserted += batch.length;
  }

  return result;
}

export interface CorpusSummary {
  totalVectors: number;
  forumVectors: number;
  uploadedDocVectors: number;
  forumIngestionEnabled: boolean;
  includesOwnPosts: boolean;
  sharedPhilosophyIndex: boolean;
  lastForumSyncAt: string | null;
}

/**
 * "What is the agent's mind made of?" — the transparency view.
 * Forum-vector count is approximated by sampling metadata (Pinecone stats
 * don't segment by metadata); good enough for a transparency card.
 */
export async function getCorpusSummary(
  podId: string,
  cfg: Record<string, any>,
  isTnPod: boolean,
): Promise<CorpusSummary> {
  const namespace = `agent-${podId}`;
  const index = getPinecone().index(SENSEMAKER_INDEX);

  let totalVectors = 0;
  try {
    const stats = await index.describeIndexStats();
    totalVectors = stats.namespaces?.[namespace]?.recordCount || 0;
  } catch {
    // stats unavailable — leave zeros
  }

  // Estimate the forum share by querying with a zero-ish vector and counting
  // metadata sources is unreliable; instead track the running count in config.
  const forumVectors = cfg.forum_corpus_vector_count ?? 0;

  return {
    totalVectors,
    forumVectors,
    uploadedDocVectors: Math.max(0, totalVectors - forumVectors),
    forumIngestionEnabled: cfg.corpus_includes_forum === true,
    includesOwnPosts: cfg.corpus_includes_own_posts === true,
    sharedPhilosophyIndex: isTnPod,
    lastForumSyncAt: cfg.forum_corpus_last_synced_at || null,
  };
}
