'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { useTokenGate } from '@/features/forum/hooks/useTokenGate';
import { useAuthContext } from '@/features/identity/components/AuthProvider';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { extractMentionedWalletsEnhanced } from '@/utils/mentions';

// Debug mode flag - set to false in production
const DEBUG = true;

// Helper debug function
const debug = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

// Helper: Ensure we compare addresses in lowercase
const normalizeAddress = (address: string) => address.toLowerCase();

// Helper: Normalize token IDs for comparison
const normalize = (value: string | null) => value?.trim().toLowerCase() || '';

// Helper: Determine required token for a category
const getRequiredTokenForCategory = (categoryId: string) => {
  debug('getRequiredTokenForCategory called with:', categoryId);

  // Map category IDs to their required tokens (replace with actual logic)
  const categoryTokenMap: Record<string, string> = {
    'category-id-1': process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || '',
    'category-id-2': process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER || '',
    'category-id-3': process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || '',
  };

  return categoryTokenMap[categoryId] || null;
};

// Helper to extract @mentions from text
function extractMentions(text: string): string[] {
  const regex = /@([a-zA-Z0-9_\-]+)/g;
  const mentions = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return Array.from(new Set(mentions));
}

// Helper to look up wallet addresses by first/last name (for now, as username is not present)
async function lookupWalletsByNames(names: string[]): Promise<string[]> {
  if (!names.length) return [];
  // Try to match first_name or last_name (case-insensitive)
  const { data, error } = await supabase
    .from('user_profiles')
    .select('wallet_address, first_name, last_name')
    .in('first_name', names)
    .or(`last_name.in.(${names.map((n) => `'${n}'`).join(',')})`);
  if (error) {
    console.error('Error looking up mentioned users:', error);
    return [];
  }
  return (data || []).map((u) => u.wallet_address).filter(Boolean);
}

export function useForum() {
  const [isLoading, setIsLoading] = useState(false);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(
    null,
  );
  const { address: wagmiAddress } = useAccount();
  const { toast } = useToast();
  const { session, isAuthenticated, signIn } = useAuthContext();

  // Get token balances from the token gate hook
  const { tokenBalances } = useTokenGate();
  const { createNotification } = useUnifiedNotifications();

  // Log environment variables for debugging
  useEffect(() => {
    debug('Environment Variables:', {
      poc: process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY,
      exec: process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
      dev: process.env.NEXT_PUBLIC_DEV_POD_HAT_ID,
    });
  }, []);

  // Ensure we only set a valid 0x wallet address
  useEffect(() => {
    if (wagmiAddress?.startsWith('0x')) {
      debug('Using wagmi address:', wagmiAddress);
      setUserWalletAddress(wagmiAddress.toLowerCase());
    } else if (wagmiAddress) {
      console.error('Invalid wallet address format:', wagmiAddress);
    }
  }, [wagmiAddress]);

  // Log when tokenBalances updates
  useEffect(() => {
    debug('Token balances updated:', tokenBalances);
  }, [tokenBalances]);

  // ---------------------------
  // 1) LOAD THREADS
  // ---------------------------
  const loadThreads = async (categoryId?: string, page = 0, pageSize = 20) => {
    debug('loadThreads called with:', { categoryId, page, pageSize });
    debug('Current userWalletAddress:', userWalletAddress);
    debug('Current tokenBalances:', tokenBalances);

    if (!userWalletAddress) {
      toast({
        title: 'Authentication required',
        description: 'Please connect your wallet to view threads',
        variant: 'destructive',
      });
      return { success: false, threads: [], total: 0, hasMore: false };
    }

    setIsLoading(true);
    try {
      // Note: Use the actual column "category_id" from the table and alias it if needed.
      let query = supabase
        .from('forum_threads')
        .select(`
		id,
		title,
		category_id,
		author_address,
		created_at,
		forum_posts(count),
		forum_categories(name, required_token)
	  `)
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + (pageSize - 1));

      if (categoryId) {
        // Use the proper column name 'category_id'
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;

      if (error) {
        toast({
          title: 'Error fetching threads',
          description: error.message,
          variant: 'destructive',
        });
        return { success: false, threads: [], total: 0, hasMore: false };
      }

      debug('Raw thread data from Supabase:', data);

      // Note: Token-gating is now handled by ForumAccessGate at the route level
      // using the unified access control system (useUnifiedForumAccess hook)
      // We no longer filter threads client-side based on tokenBalances
      // Instead, we rely on the RPC function forums_accessible_by_identity()
      // which is called by the access gate component

      // Transform data for ThreadCard compatibility
      const transformedThreads =
        data?.map((thread: any) => ({
          ...thread,
          author_wallet: thread.author_address,
          post_count: Array.isArray(thread.forum_posts)
            ? thread.forum_posts.length
            : 0,
          category_name: thread.forum_categories?.name || null,
        })) || [];

      debug('Transformed threads:', transformedThreads);

      return {
        success: true,
        threads: transformedThreads,
        total: transformedThreads.length,
        hasMore: data.length === pageSize,
      };
    } catch (error) {
      debug('Error in loadThreads:', error);
      toast({
        title: 'Error fetching threads',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
      return { success: false, threads: [], total: 0, hasMore: false };
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // 2) LOAD CATEGORIES
  // ---------------------------
  const loadCategories = async () => {
    debug('loadCategories called');
    debug('Current userWalletAddress:', userWalletAddress);
    debug('Current tokenBalances:', tokenBalances);

    if (!userWalletAddress) {
      toast({
        title: 'Authentication required',
        description: 'Please connect your wallet to view categories',
        variant: 'destructive',
      });
      return { success: false, categories: [] };
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('forum_categories')
        .select(`
          id,
          name,
          description,
          required_token,
          icon_name,
          created_at,
          thread_count:threads(count)
        `)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      debug('Raw categories data from Supabase:', data);

      let filteredCategories = data;

      if (tokenBalances) {
        const pocToken = normalize(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY);
        const execHatId = normalize(
          process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
        );
        const devHatId = normalize(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID);

        filteredCategories = data.filter((category: any) => {
          const requiredToken = normalize(category.required_token);
          if (!requiredToken) {
            debug(
              `Category ${category.id} has no required_token; allowing it.`,
            );
            return true;
          }

          debug(`Category ${category.id} requires token: "${requiredToken}"`);

          return (
            (requiredToken === pocToken && tokenBalances.hasProofOfCuriosity) ||
            (requiredToken === execHatId && tokenBalances.hasExecutivePod) ||
            (requiredToken === devHatId && tokenBalances.hasDevPod)
          );
        });
      } else {
        debug(
          'Token balances not available; showing all categories without token filtering',
        );
        filteredCategories = data.filter(
          (category: any) => !category.required_token,
        );
      }

      debug('Filtered categories:', filteredCategories);

      return { success: true, categories: filteredCategories };
    } catch (error) {
      debug('Error in loadCategories:', error);
      toast({
        title: 'Error fetching categories',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
      return { success: false, categories: [] };
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // 3) LOAD POSTS
  // ---------------------------
  const loadPosts = async (threadId: string, page = 0, pageSize = 50) => {
    debug('loadPosts called with:', { threadId, page, pageSize });
    debug('Current userWalletAddress:', userWalletAddress);

    if (!userWalletAddress) {
      toast({
        title: 'Authentication required',
        description: 'Please connect your wallet to view posts',
        variant: 'destructive',
      });
      return {
        success: false,
        thread: null,
        posts: [],
        total: 0,
        hasMore: false,
      };
    }

    setIsLoading(true);
    try {
      const { data: threadData, error: threadError } = await supabase
        .from('forum_threads')
        .select(`
          id,
          title,
          category_id,
          author_address,
          content,
          created_at,
          forum_categories(*)
        `)
        .eq('id', threadId)
        .single();

      if (threadError) {
        debug('Error loading thread:', threadError);
        toast({
          title: 'Error loading thread',
          description: threadError.message,
          variant: 'destructive',
        });
        return {
          success: false,
          thread: null,
          posts: [],
          total: 0,
          hasMore: false,
        };
      }

      debug('Thread data loaded:', threadData);

      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .range(page * pageSize, page * pageSize + (pageSize - 1));

      if (postsError) {
        debug('Error loading posts:', postsError);
        toast({
          title: 'Error loading posts',
          description: postsError.message,
          variant: 'destructive',
        });
        return {
          success: false,
          thread: null,
          posts: [],
          total: 0,
          hasMore: false,
        };
      }

      debug(`Loaded ${postsData?.length} posts for thread ${threadId}`);

      return {
        success: true,
        thread: threadData,
        posts: postsData,
        total: postsData?.length || 0,
        hasMore: postsData && postsData.length === pageSize,
      };
    } catch (error) {
      debug('Error in loadPosts:', error);
      toast({
        title: 'Error fetching posts',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
      return {
        success: false,
        thread: null,
        posts: [],
        total: 0,
        hasMore: false,
      };
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // 4) SUBMIT THREAD (2-step approach)
  // ---------------------------
  const submitThread = async (
    categoryId: string,
    title: string,
    initialPostContent: string,
    categoryStr = 'governance',
  ) => {
    debug('submitThread called with:', {
      categoryId,
      title,
      contentLength: initialPostContent?.length,
    });
    debug('Current userWalletAddress:', userWalletAddress);

    if (!userWalletAddress) {
      toast({
        title: 'Authentication required',
        description: 'Please connect your wallet to create a thread',
        variant: 'destructive',
      });
      return { success: false };
    }

    setIsLoading(true);

    try {
      // Step 1: Ensure user is authenticated
      if (!isAuthenticated) {
        if (wagmiAddress) {
          await signIn(wagmiAddress);
        } else {
          toast({
            title: 'Authentication required',
            description: 'Please connect your wallet & sign in',
            variant: 'destructive',
          });
          return { success: false };
        }
      }

      if (!session?.user?.id) {
        toast({
          title: 'Authentication failed',
          description: 'Unable to authenticate user',
          variant: 'destructive',
        });
        return { success: false };
      }
      debug('Session user ID:', session.user.id);

      // Step 2: Fetch user profile details
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('wallet_address, first_name, last_name')
        .eq('user_id', session.user.id)
        .single();

      if (profileError || !profileData?.wallet_address) {
        debug('Profile error or missing wallet:', profileError);
        throw new Error('No wallet address found in user_profiles');
      }
      debug('Profile data for thread creation:', profileData);

      // Construct payload for thread insertion (new schema)
      const payload = {
        category_id: categoryId,
        title,
        content: initialPostContent, // Store initial content in thread
        author_address: profileData.wallet_address,
        created_at: new Date().toISOString(),
      };

      debug('Payload for thread insertion:', payload);
      console.log('Payload for thread insertion:', payload);

      // Step 4: Insert thread record with the token/tag
      const { data: newThread, error: threadError } = await supabase
        .from('forum_threads')
        .insert(payload)
        .select('*')
        .single();

      if (threadError || !newThread) {
        console.error('Thread insertion error:', JSON.stringify(threadError));
        throw threadError;
      }

      debug('Thread created:', newThread);
      console.log('Inserted thread record:', newThread);

      // Note: Initial post content is now stored in the thread itself
      // No separate initial post is created

      // --- Mention notification logic ---
      // Extract mentions from initialPostContent using extractMentionedWalletsEnhanced
      const mentionedWallets =
        await extractMentionedWalletsEnhanced(initialPostContent);
      for (const wallet of mentionedWallets) {
        if (wallet) {
          // TODO: Re-enable self-mention rejection before launch
          // if (wallet !== profileData.wallet_address) {
          console.log(
            'Creating forum mention notification for:',
            wallet.toLowerCase(),
          );
          await createNotification({
            recipient_address: wallet.toLowerCase(),
            sender_address: profileData.wallet_address.toLowerCase(),
            notification_type: 'user_mentioned',
            category: 'general',
            title: 'You were mentioned in a forum post',
            message:
              `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() +
              ' mentioned you in a forum thread',
            context_type: 'forum',
            context_id: newThread.id,
            context_url: `/forum/thread/${newThread.id}`,
            priority: 'medium',
          });
          // }
        }
      }
      // --- End mention notification logic ---

      debug('Initial post created successfully');
      toast({
        title: 'Thread created',
        description:
          'Your thread and first post have been created successfully.',
      });

      return { success: true, thread: newThread };
    } catch (error: any) {
      debug('Error creating thread:', error);
      toast({
        title: 'Error creating thread',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // 5) SUBMIT POST (reply)
  // ---------------------------
  const submitPost = async (
    threadId: string,
    content: string,
    passedRequiredToken?: string | null,
    passedCategoryId?: string | null,
  ) => {
    // Basic validations and setting loading state
    if (!userWalletAddress) {
      // ... (show error toast)
      return { success: false, error: 'Authentication required' };
    }

    setIsLoading(true);
    try {
      let inheritedToken = passedRequiredToken;
      let postCategoryId = passedCategoryId;

      console.log('Initial values:', {
        threadId,
        passedRequiredToken,
        passedCategoryId,
      });

      // Note: New schema doesn't require fetching category_id or required_token for posts
      // Posts only need thread_id, content, and author_address

      // Build the post payload (new schema)
      const postPayload = {
        thread_id: threadId,
        content,
        author_address: userWalletAddress,
        created_at: new Date().toISOString(),
      };

      console.log('Final post payload:', JSON.stringify(postPayload));

      // Debug the supabase call
      console.log("Calling supabase.from('forum_posts').insert()");

      const { data, error } = await supabase
        .from('forum_posts')
        .insert(postPayload)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      // --- Mention notification logic ---
      const mentionedWalletsPost =
        await extractMentionedWalletsEnhanced(content);
      for (const wallet of mentionedWalletsPost) {
        if (wallet) {
          // TODO: Re-enable self-mention rejection before launch
          // if (wallet !== userWalletAddress) {
          console.log(
            'Creating forum reply mention notification for:',
            wallet.toLowerCase(),
          );
          await createNotification({
            recipient_address: wallet.toLowerCase(),
            sender_address: userWalletAddress.toLowerCase(),
            notification_type: 'user_mentioned',
            category: 'general',
            title: 'You were mentioned in a forum reply',
            message: 'Someone mentioned you in a forum reply',
            context_type: 'forum',
            context_id: threadId,
            context_url: `/forum/thread/${threadId}`,
            priority: 'medium',
          });
          // }
        }
      }
      // --- End mention notification logic ---

      // --- Thread reply notification logic ---
      try {
        // Get thread creator and title
        const { data: thread, error: threadError } = await supabase
          .from('forum_threads')
          .select('author_address, title')
          .eq('id', threadId)
          .single();

        if (!threadError && thread) {
          const threadTitle = thread.title || 'a forum thread';

          // Get all previous participants (people who have replied)
          const { data: previousPosts } = await supabase
            .from('forum_posts')
            .select('author_address')
            .eq('thread_id', threadId);

          // Build unique set of participants
          const participants = new Set<string>();
          participants.add(thread.author_address.toLowerCase()); // Thread creator
          if (previousPosts) {
            previousPosts.forEach((post) => {
              if (post.author_address) {
                participants.add(post.author_address.toLowerCase());
              }
            });
          }

          // Remove current user from participants
          participants.delete(userWalletAddress.toLowerCase());

          // Also remove anyone who was mentioned (they already got a mention notification)
          mentionedWalletsPost.forEach((wallet) => {
            if (wallet) participants.delete(wallet.toLowerCase());
          });

          // Notify all participants
          for (const participantAddress of participants) {
            try {
              await createNotification({
                recipient_address: participantAddress,
                sender_address: userWalletAddress.toLowerCase(),
                notification_type: 'forum_participating_reply',
                category: 'general',
                title: 'New Reply in Thread',
                message: `New reply in "${threadTitle}"`,
                context_type: 'forum',
                context_id: threadId,
                context_url: `/forum/thread/${threadId}`,
                priority: 'medium',
              });
              console.log(
                `Notified participant ${participantAddress} of new reply`,
              );
            } catch (participantNotifError) {
              console.error(
                `Failed to notify participant ${participantAddress}:`,
                participantNotifError,
              );
              // Continue with other notifications
            }
          }
        }
      } catch (threadNotifError) {
        console.error(
          'Failed to send thread reply notifications:',
          threadNotifError,
        );
        // Non-fatal - post was created successfully
      }
      // --- End thread reply notification logic ---

      console.log('Post successfully created:', data);
      toast({
        title: 'Post created',
        description: 'Your reply has been successfully added',
      });
      return { success: true, post: data };
    } catch (error: any) {
      console.error('Error in submitPost:', error);
      toast({
        title: 'Error creating post',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
      return {
        success: false,
        error: error.message || 'An unknown error occurred',
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    address: userWalletAddress,
    loadThreads,
    loadCategories,
    loadPosts,
    submitThread,
    submitPost,
  };
}
