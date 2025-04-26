'use client';

import { useState, useEffect } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import { useAccount } from 'wagmi';
import { useToast } from 'src/components/ui/use-toast';
import { useTokenGate } from 'src/features/forum/hooks/useTokenGate';

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
    "category-id-1": process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || "",
    "category-id-2": process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID || "",
    "category-id-3": process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || "",
  };
  
  return categoryTokenMap[categoryId] || null;
};

export function useForum() {
  const [isLoading, setIsLoading] = useState(false);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const { address: wagmiAddress } = useAccount();
  const { toast } = useToast();
  
  // Get token balances from the token gate hook
  const { tokenBalances } = useTokenGate();

  // Log environment variables for debugging
  useEffect(() => {
    debug('Environment Variables:', {
      poc: process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY,
      exec: process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID,
      dev: process.env.NEXT_PUBLIC_DEV_POD_HAT_ID
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
		required_token,
		author_wallet,
		author_first_name,
		author_last_name,
		created_at,
		forum_posts(count),
		forum_categories!threads(name, required_token)
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

      // Filter threads based on tokenBalances if available
      let filteredThreads = data;
      if (tokenBalances) {
        const pocToken = normalize(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY);
        const execHatId = normalize(process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID);
        const devHatId = normalize(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID);

        filteredThreads = data.filter((thread: any) => {
          // Use thread.required_token if available, otherwise from joined forum_categories
          const threadToken = normalize(thread.required_token);
          const categoryToken = normalize(thread.forum_categories?.required_token);
          const requiredToken = threadToken || categoryToken;

          if (!requiredToken) {
            debug(`Thread ${thread.id} has no required_token; allowing it.`);
            return true;
          }

          debug(`Thread ${thread.id} requires token: "${requiredToken}"`);

          return (
            (requiredToken === pocToken && tokenBalances?.hasProofOfCuriosity) ||
            (requiredToken === execHatId && tokenBalances?.hasExecutivePod) ||
            (requiredToken === devHatId && tokenBalances?.hasDevPod)
          );
        });
      }

      debug('Filtered threads:', filteredThreads);

      return {
        success: true,
        threads: filteredThreads,
        total: filteredThreads.length,
        hasMore: data.length === pageSize,
      };
    } catch (error) {
      debug('Error in loadThreads:', error);
      toast({
        title: 'Error fetching threads',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
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
        const execHatId = normalize(process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID);
        const devHatId = normalize(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID);

        filteredCategories = data.filter((category: any) => {
          const requiredToken = normalize(category.required_token);
          if (!requiredToken) {
            debug(`Category ${category.id} has no required_token; allowing it.`);
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
        debug('Token balances not available; showing all categories without token filtering');
        filteredCategories = data.filter((category: any) => !category.required_token);
      }

      debug('Filtered categories:', filteredCategories);
      
      return { success: true, categories: filteredCategories };
    } catch (error) {
      debug('Error in loadCategories:', error);
      toast({
        title: 'Error fetching categories',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
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
      return { success: false, thread: null, posts: [], total: 0, hasMore: false };
    }

    setIsLoading(true);
    try {
      const { data: threadData, error: threadError } = await supabase
        .from('forum_threads')
        .select(`
          id,
          title,
          categoryId:category_id,
          required_token,
          author_wallet,
          author_first_name,
          author_last_name,
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
        return { success: false, thread: null, posts: [], total: 0, hasMore: false };
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
        return { success: false, thread: null, posts: [], total: 0, hasMore: false };
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
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
      return { success: false, thread: null, posts: [], total: 0, hasMore: false };
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
	  categoryStr: string = 'governance'
	) => {
	  debug('submitThread called with:', { categoryId, title, contentLength: initialPostContent?.length });
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
		// Step 1: Retrieve the session user
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user?.id) {
		  toast({
			title: 'Authentication required',
			description: 'Please connect your wallet & sign in',
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

		// Step 3: Fetch category details
		const { data: categoryData, error: categoryError } = await supabase
		  .from('forum_categories')
		  .select('required_token')
		  .eq('id', categoryId)
		  .single();

		if (categoryError) {
		  debug('Error fetching category required_token:', categoryError);
		  throw new Error('Failed to retrieve category token requirement');
		}

		// Determine token to use (inherited from category or fallback)
		const inheritedToken = categoryData?.required_token || null;
		const tokenToUse = inheritedToken || categoryStr;
		debug(`Thread will use token: ${tokenToUse}`);

		// Construct payload for thread insertion
		const payload = {
		  category_id: categoryId, // Use the database column name "category_id" with the value from the parameter categoryId
		  title,
		  author_wallet: profileData.wallet_address,
		  author_first_name: profileData.first_name || null,
		  author_last_name: profileData.last_name || null,
		  created_at: new Date().toISOString(),
		  required_token: tokenToUse,
		};

		debug("Payload for thread insertion:", payload);
		console.log("Payload for thread insertion:", payload);

		// Step 4: Insert thread record with the token/tag
		const { data: newThread, error: threadError } = await supabase
		  .from('forum_threads')
		  .insert(payload)
		  .select('*')
		  .single();

		if (threadError || !newThread) {
		  console.error("Thread insertion error:", JSON.stringify(threadError));
		  throw threadError;
		}

		debug('Thread created:', newThread);
		console.log("Inserted thread record:", newThread);

		// Construct payload for initial post insertion
		const postPayload = {
		  thread_id: newThread.id,
		  content: initialPostContent,
		  author_wallet: profileData.wallet_address,
		  author_first_name: profileData.first_name || null,
		  author_last_name: profileData.last_name || null,
		  created_at: new Date().toISOString(),
		  required_token: tokenToUse,
		};

		debug("Payload for initial post insertion:", postPayload);
		console.log("Payload for initial post insertion:", postPayload);

		// Step 5: Insert the initial post with the same token/tag
		const { error: postError } = await supabase
		  .from('forum_posts')
		  .insert(postPayload);

		if (postError) {
		  debug('Initial post creation error:', JSON.stringify(postError));
		  throw postError;
		}

		debug('Initial post created successfully');
		toast({
		  title: 'Thread created',
		  description: 'Your thread and first post have been created successfully.',
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
	const submitPost = async (threadId: string, content: string, passedRequiredToken?: string | null, passedCategoryId?: string | null) => {
	  // Basic validations and setting loading state
	  if (!userWalletAddress) {
		// ... (show error toast)
		return { success: false, error: 'Authentication required' };
	  }
	  
	  setIsLoading(true);
	  try {
		let inheritedToken = passedRequiredToken;
		let postCategoryId = passedCategoryId;
		
		console.log("Initial values:", {
		  threadId,
		  passedRequiredToken,
		  passedCategoryId
		});
		
		// Always fetch thread details to get both the token and category_id if missing
		if (inheritedToken === undefined || inheritedToken === null || postCategoryId === undefined || postCategoryId === null) {
		  console.log("Fetching thread details from Supabase...");
		  const { data: threadData, error: threadError } = await supabase
			.from('forum_threads')
			.select('category_id, required_token, forum_categories(required_token)')
			.eq('id', threadId)
			.single();
		  
		  if (threadError || !threadData) {
			console.error("Error fetching thread details:", threadError);
			throw new Error('Failed to retrieve thread details');
		  }
		  
		  console.log("Thread data fetched:", threadData);
		  
		  // Set category_id regardless of whether we have a token
		  if (postCategoryId === undefined || postCategoryId === null) {
			postCategoryId = threadData.category_id;
			console.log("Setting postCategoryId from thread data:", postCategoryId);
		  }
			  
		  // Only use the passed token if it exists, otherwise use the thread's token
		  if (inheritedToken === undefined || inheritedToken === null) {
			inheritedToken = threadData.required_token || threadData.forum_categories?.required_token || null;
			console.log("Setting inheritedToken from thread data:", inheritedToken);
		  }
		}

		if (inheritedToken === null) {
		  console.error("Required token is missing");
		  return { success: false, error: 'Error: required token is missing.' };
		}

		// Build the post payload identical to threads (with category_id)
		const postPayload = {
		  thread_id: threadId,
		  content,
		  author_wallet: userWalletAddress,
		  category_id: postCategoryId, 
		  required_token: inheritedToken,
		  created_at: new Date().toISOString(),
		};

		console.log("Final post payload:", JSON.stringify(postPayload));

		// Debug the supabase call
		console.log("Calling supabase.from('forum_posts').insert()");
		
		const { data, error } = await supabase
		  .from('forum_posts')
		  .insert(postPayload)
		  .select('*')
		  .single();
		
		if (error) {
		  console.error("Supabase insert error:", error);
		  throw error;
		}
		
		console.log("Post successfully created:", data);
		
		toast({ title: 'Post created', description: 'Your reply has been successfully added' });
		return { success: true, post: data };
	  } catch (error: any) {
		console.error("Error in submitPost:", error);
		toast({ 
		  title: 'Error creating post', 
		  description: error.message || 'An unknown error occurred', 
		  variant: 'destructive' 
		});
		return { success: false, error: error.message || 'An unknown error occurred' };
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
    submitPost
  };
}
