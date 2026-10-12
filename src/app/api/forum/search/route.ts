// src/app/api/forum/search/route.ts
// Full-text search for forum threads via search_forum_threads RPC
// Falls back to ILIKE search if the RPC function doesn't exist yet

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { isExecutiveLeader, isPodMember } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

/**
 * Category ids the caller may read — server mirror of
 * forums_accessible_by_identity / useUnifiedForumAccess:
 *  - non-pod categories with no required token: any signed-in member
 *  - pod categories: active pod members, and only while the pod's forum
 *    module is enabled
 *  - non-pod token/hat-gated categories: Executive Leaders only (the
 *    on-chain token check lives client-side; fail closed here)
 * Executive Leaders can read everything.
 */
async function readableCategoryIds(wallet: string): Promise<Set<string>> {
  const { data: cats } = await supabaseAdmin
    .from('forum_categories')
    .select('id, pod_id, required_token');
  const all = (cats ?? []) as { id: string; pod_id: string | null; required_token: string | null }[];

  if (await isExecutiveLeader(wallet)) return new Set(all.map((c) => c.id));

  const podIds = [...new Set(all.map((c) => c.pod_id).filter(Boolean) as string[])];
  const enabled = new Map<string, boolean>();
  if (podIds.length > 0) {
    const { data: modules } = await supabaseAdmin
      .from('pod_modules')
      .select('pod_id, forum_enabled')
      .in('pod_id', podIds);
    (modules ?? []).forEach((m: any) => enabled.set(m.pod_id, m.forum_enabled !== false));
  }
  const memberOf = new Set<string>();
  await Promise.all(
    podIds.map(async (podId) => {
      if (enabled.get(podId) === false) return;
      if (await isPodMember(podId, wallet)) memberOf.add(podId);
    }),
  );

  const allowed = new Set<string>();
  for (const c of all) {
    if (c.pod_id) {
      if (memberOf.has(c.pod_id)) allowed.add(c.id);
    } else if (!c.required_token) {
      allowed.add(c.id);
    }
  }
  return allowed;
}

export async function GET(req: NextRequest) {
  try {
    const walletOrDenied = await requireWallet(req);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const wallet = walletOrDenied;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const categoryId = searchParams.get('category_id') || null;
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    const allowed = await readableCategoryIds(wallet);
    if (categoryId && !allowed.has(categoryId)) {
      return NextResponse.json({ error: 'You do not have access to this forum' }, { status: 403 });
    }
    const canRead = (t: any) => !t.category_id || allowed.has(t.category_id);

    // Try FTS RPC first
    let data: any[] | null = null;
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('search_forum_threads', {
      search_query: q,
      cat_id: categoryId,
      result_limit: limit,
      result_offset: page * limit,
    });

    if (rpcError) {
      console.warn('Forum FTS RPC unavailable, falling back to ILIKE:', rpcError.message);

      // Fallback: simple ILIKE search on title
      let query = supabaseAdmin
        .from('forum_threads')
        .select('id, title, content, author_address, category_id, created_at, is_pinned')
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .range(page * limit, page * limit + limit - 1);

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data: fallbackData, error: fallbackError } = await query;
      if (fallbackError) {
        console.error('Forum search fallback error:', fallbackError);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
      }
      data = (fallbackData ?? []).filter(canRead);
    } else {
      // NB: filtered after paging, so a page can come back short.
      data = (rpcData ?? []).filter(canRead);
    }

    // Fetch author profiles for results
    const authorAddresses = [...new Set((data || []).map((t: any) => t.author_address))];
    let profiles: Record<string, any> = {};
    if (authorAddresses.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from('user_profiles')
        .select('wallet_address, display_name, profile_picture')
        .in('wallet_address', authorAddresses);
      if (profileData) {
        profiles = Object.fromEntries(profileData.map((p: any) => [p.wallet_address, p]));
      }
    }

    const results = (data || []).map((thread: any) => ({
      ...thread,
      author_profile: profiles[thread.author_address] || null,
    }));

    return NextResponse.json({ threads: results, query: q });
  } catch (err) {
    console.error('Forum search error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
