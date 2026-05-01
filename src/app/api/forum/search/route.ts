// src/app/api/forum/search/route.ts
// Full-text search for forum threads via search_forum_threads RPC

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const categoryId = searchParams.get('category_id') || null;
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('search_forum_threads', {
      search_query: q,
      cat_id: categoryId,
      result_limit: limit,
      result_offset: page * limit,
    });

    if (error) {
      console.error('Forum search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
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
