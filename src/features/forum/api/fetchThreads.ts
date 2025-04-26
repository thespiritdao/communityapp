// src/features/forum/api/fetchThreads.ts
import { supabase } from 'src/utils/supabaseClient';

export type FetchThreadsParams = {
  categoryId?: string;
  walletAddress: string;
  tokenBalances?: {
    hasProofOfCuriosity?: boolean;
    hasExecutivePod?: boolean;
    hasDevPod?: boolean;
  };
  limit?: number;
  offset?: number;
};

export const fetchThreads = async ({ categoryId, walletAddress, tokenBalances, limit = 20, offset = 0 }: FetchThreadsParams) => {
  try {
    let query = supabase
      .from('forum_threads')
      .select(`
        id,
        title,
        category_id,
        required_token,
        author_wallet,
        author_first_name,
        author_last_name,
        created_at,
        forum_categories(name, required_token)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (categoryId) query = query.eq('category_id', categoryId);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch threads: ${error.message}`);

    // Normalize token IDs for comparison
    const normalize = (value: string | null) => value?.trim().toLowerCase() || '';
    const pocToken = normalize(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY);
    const execHatId = normalize(process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID);
    const devHatId = normalize(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID);

    // Filter threads **before returning them to the client**
    const filteredThreads = data.filter((thread) => {
      const threadToken = normalize(thread.required_token);
      const categoryToken = normalize(thread.forum_categories?.required_token);
      const requiredToken = threadToken || categoryToken;

      // If no required_token exists, the thread is publicly accessible
      if (!requiredToken) return true;

      // If tokenBalances are available, filter based on access
      return (
        (requiredToken === pocToken && tokenBalances?.hasProofOfCuriosity) ||
        (requiredToken === execHatId && tokenBalances?.hasExecutivePod) ||
        (requiredToken === devHatId && tokenBalances?.hasDevPod)
      );
    });

    return {
      success: true,
      threads: filteredThreads,
      total: count || 0,
      hasMore: Boolean(count && count > offset + limit),
    };
  } catch (error) {
    console.error('Error in fetchThreads:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
      threads: [],
      total: 0,
      hasMore: false,
    };
  }
};
