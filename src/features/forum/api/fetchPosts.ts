// src/features/forum/api/fetchPosts.ts
import { supabase } from '@/utils/supabaseClient';

export type FetchPostsParams = {
  threadId: string;
  walletAddress: string;
  limit?: number;
  offset?: number;
};

export const fetchPosts = async ({
  threadId,
  walletAddress,
  limit = 20,
  offset = 0,
}: FetchPostsParams) => {
  try {
    const query = supabase
      .from('forum_posts')
      .select(`
        id,
        thread_id,
        content,
        author_address,
        created_at,
        required_token,
		forum_threads(required_token)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch posts: ${error.message}`);

    const postsWithToken = data.map((post) => {
      const threadToken = Array.isArray(post.forum_threads)
        ? post.forum_threads[0]?.required_token
        : null;
      return {
        ...post,
        required_token: post.required_token || threadToken || null,
      };
    });

    return {
      success: true,
      posts: data || [],
      total: count || 0,
      hasMore: Boolean(count && count > offset + limit),
    };
  } catch (error) {
    console.error('Error in fetchPosts:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
      posts: [],
      total: 0,
      hasMore: false,
    };
  }
};
