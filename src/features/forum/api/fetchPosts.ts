// src/features/forum/api/fetchPosts.ts
import { supabase } from 'src/utils/supabaseClient';

export type FetchPostsParams = {
  threadId: string;
  walletAddress: string;
  limit?: number;
  offset?: number;
};

export const fetchPosts = async ({ threadId, walletAddress, limit = 20, offset = 0 }: FetchPostsParams) => {
  try {
    let query = supabase
      .from('forum_posts')
      .select(`
        id,
        thread_id,
        content,
        author_wallet,
        author_first_name,
        author_last_name,
        created_at,
        required_token,
		forum_threads(required_token)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch posts: ${error.message}`);
	
	const postsWithToken = data.map(post => ({
      ...post,
      required_token: post.required_token || post.forum_threads?.required_token || null,
    }));


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
      error: error instanceof Error ? error.message : 'An unknown error occurred',
      posts: [],
      total: 0,
      hasMore: false,
    };
  }
};
