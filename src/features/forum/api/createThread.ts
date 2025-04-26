// src/features/forum/api/createThread.ts
import { supabase } from 'src/utils/supabaseClient';
import { fetchUnifiedTokenBalances } from 'src/utils/tokenGateService';

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
    .upsert({ wallet_address: walletAddress })  // Upsert creates or updates the record
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
    const { hasProofOfCuriosity } = await fetchUnifiedTokenBalances(authorWallet);
    if (!hasProofOfCuriosity) {
      throw new Error('Access denied: Missing Proof of Curiosity token.');
    }
    
    if (!title.trim()) {
      throw new Error('Thread title cannot be empty');
    }
    if (!categoryId) {
      throw new Error('Category ID is required');
    }
    
    // Ensure the user profile exists before inserting the thread
    await ensureUserProfile(authorWallet);
    
    // Now insert the thread into the forum_threads table
    const { data, error } = await supabase
      .from('forum_threads')
      .insert({
        categoryId:category_id,
        title: title.trim(),
        content: content.trim(),
        author_wallet: authorWallet,
        author_first_name: authorFirstName,
        author_last_name: authorLastName,
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
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
};
