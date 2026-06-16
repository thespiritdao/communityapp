// src/features/forum/api/createThread.ts
import { supabase } from '@/utils/supabaseClient';
import { fetchUnifiedTokenBalances } from '@/utils/tokenGateService';

export type CreateThreadParams = {
  categoryId: string;
  title: string;
  content?: string;
  authorWallet: string;
  authorFirstName?: string;
  authorLastName?: string;
};

// Function to ensure that the user profile exists
async function ensureUserProfile(walletAddress: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ wallet_address: walletAddress }) // Upsert creates or updates the record
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to upsert user profile: ${error.message}`);
  }
  return data;
}

export const createThread = async ({
  categoryId,
  title,
  content = '',
  authorWallet,
  authorFirstName,
  authorLastName,
}: CreateThreadParams) => {
  try {
    // Check token (only require proof-of-curiosity for this forum)
    const { hasProofOfCuriosity } =
      await fetchUnifiedTokenBalances(authorWallet);
    if (!hasProofOfCuriosity) {
      throw new Error('Access denied: Missing Proof of Curiosity token.');
    }

    if (!title.trim()) {
      throw new Error('Thread title cannot be empty');
    }
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    // Verify user has access to this category's pod
    const { data: category, error: catError } = await supabase
      .from('forum_categories')
      .select('id, name, required_token, pod_id')
      .eq('id', categoryId)
      .single();

    if (catError || !category) {
      throw new Error('Invalid forum category.');
    }

    // If category is pod-gated, verify user is a member of that pod
    if (category.pod_id) {
      const { data: membership } = await supabase
        .from('active_pod_members')
        .select('id')
        .eq('pod_id', category.pod_id)
        .eq('wallet', authorWallet.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

      if (!membership) {
        throw new Error('Access denied: You are not a member of this pod.');
      }
    }

    // Ensure the user profile exists before inserting the thread
    await ensureUserProfile(authorWallet);

    // Now insert the thread into the forum_threads table
    const { data, error } = await supabase
      .from('forum_threads')
      .insert({
        category_id: categoryId,
        title: title.trim(),
        content: content.trim(),
        author_address: authorWallet,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }

    return { success: true, thread: data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
};
