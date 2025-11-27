// src/app/forum/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import { supabase } from '@/utils/supabaseClient';
import ForumContainer from '@/features/forum/components/ForumContainer';
import CategoryList from '@/features/forum/components/CategoryList';
import ThreadList from '@/features/forum/components/ThreadList';
import ForumErrorBoundary from '@/features/forum/components/ForumErrorBoundary';
import { Button } from '@/components/ui/button';
import { useForum } from '@/features/forum/hooks/useForum';
import { useTokenGate } from '@/features/forum/hooks/useTokenGate';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { getUserIdentity, getAccessibleForums, logUserIdentity } from '@/utils/accessControlUtils';
import { useForumUserProfiles } from '@/features/forum/hooks/useForumUserProfiles';
import { Loader2 } from 'lucide-react';
import styles from '@/features/forum/styles/Forum.module.css';

interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  required_token?: string | null;
  thread_count: number;
}

interface Thread {
  id: string;
  category_id: string;
  title: string;
  author_address: string;
  created_at: string;
  post_count: number;
  category_name: string;
}

export default function ForumPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { loadThreads } = useForum();
  const { tokenBalances, isLoading: tokenGateLoading } = useTokenGate();
  const { userHats, isLoading: hatPermissionsLoading } = useHatPermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentThreads, setRecentThreads] = useState<Thread[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Batch fetch user profiles for recent threads (prevents N+1 queries)
  const uniqueThreadAuthors = useMemo(() => {
    return [...new Set(recentThreads.map(t => t.author_address))];
  }, [recentThreads]);

  const { data: profileMap } = useForumUserProfiles(uniqueThreadAuthors);

  // Wait for both token balances and HAT permissions to load before fetching forum data
  useEffect(() => {
    if (!tokenGateLoading && !hatPermissionsLoading && tokenBalances && address) {
      fetchForumData();
    }
  }, [tokenGateLoading, hatPermissionsLoading, tokenBalances, userHats, address]);

  // NEW: Get user's accessible forums using the RPC function
  const getUserAccessibleForums = async () => {
    try {
      if (!address || !tokenBalances) {
        console.warn('Cannot get accessible forums: missing address or token balances');
        return [];
      }

      // Get user identity from token balances and HAT permissions
      const identity = await getUserIdentity(address, tokenBalances, userHats);
      logUserIdentity(identity, 'Forum Access Check');

      // Use the RPC function to get accessible forums
      const accessibleForums = await getAccessibleForums(identity);
      console.log(`📋 User has access to ${accessibleForums.length} forum categories`);
      
      return accessibleForums;
    } catch (error) {
      console.error('Error getting accessible forums:', error);
      return [];
    }
  };

  // NEW: Fetch forum data using the RPC function
  const fetchForumData = async () => {
    if (!address || !tokenBalances) {
      console.warn('Cannot fetch forum data: missing address or token balances');
      return;
    }

    setLoadingData(true);
    setLoadError(null);

    try {
      // 1) Get user's accessible forums using the new RPC system
      const accessibleForums = await getUserAccessibleForums();

      // 2) Fetch thread counts for ALL accessible forums in a SINGLE query (performance optimization)
      const forumIds = accessibleForums.map((forum: any) => forum.id);
      let threadCounts: Record<string, number> = {};

      if (forumIds.length > 0) {
        const { data: allThreads, error: countError } = await supabase
          .from('forum_threads')
          .select('category_id')
          .in('category_id', forumIds);

        if (countError) {
          console.warn('Error getting thread counts:', countError);
        } else if (allThreads) {
          // Count threads per category on client side (much faster than N queries)
          threadCounts = allThreads.reduce((acc, thread) => {
            acc[thread.category_id] = (acc[thread.category_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        }
      }

      // 3) Attach counts to forums
      const forumsWithCounts = accessibleForums.map((forum: any) => ({
        ...forum,
        thread_count: threadCounts[forum.id] || 0
      }));

      console.log(`✅ Successfully loaded ${forumsWithCounts.length} accessible forum categories`);
      setCategories(forumsWithCounts);

      // 3) Fetch recent threads using loadThreads from useForum hook
      const threadsResult = await loadThreads(undefined, 0, 5);
      if (!threadsResult.success) {
        throw new Error("Failed to load threads");
      }
      setRecentThreads(threadsResult.threads);

      setLoadingData(false);
    } catch (err: any) {
      console.error('Error loading forum data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unknown error loading forum data');
      setLoadingData(false);
    }
  };

  return (
    <ForumAccessGate
      allowPublic={false}
      fallbackMessage="You need to hold a Proof of Curiosity token or have appropriate HAT permissions to access the forum."
    >
    <ForumContainer>
      {/* Add bottom-nav-spacing to create space at the bottom so the bottom bar doesn't overlap the content */}
      <div className="bottom-nav-spacing">
        {/* Top row: Forum title + "New Thread" button */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SpiritDAO Forums</h1>
          <Button
            className={styles.newThreadButton}
            onClick={() => {
              console.log("New Thread button clicked!");
              router.push('/forum/create-thread');
            }}
          >
            New Thread
          </Button>
        </div>

        {/* Error display */}
        {loadError && (
          <div className="bg-destructive/10 p-4 rounded-lg border border-destructive mb-8">
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={fetchForumData} className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {/* Loading spinner - show loading while token gating, HAT permissions, or data loading */}
        {(loadingData || tokenGateLoading || hatPermissionsLoading) ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="ml-3 text-muted-foreground">
              {tokenGateLoading ? 'Checking token permissions...' : 
               hatPermissionsLoading ? 'Checking HAT permissions...' : 
               'Loading forum data...'}
            </div>
          </div>
        ) : (
          <>
            {/* Categories Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-4"></h2>
              {categories.length > 0 ? (
                <ForumErrorBoundary>
                  <CategoryList categories={categories} />
                </ForumErrorBoundary>
              ) : (
                <p className="text-muted-foreground">No categories found.</p>
              )}
            </section>

            {/* Recent Threads Section */}
            <section>
              <h2 className="text-2xl font-semibold mb-4"></h2>
              {recentThreads.length > 0 ? (
                <ForumErrorBoundary>
                  <ThreadList threads={recentThreads.map(thread => ({
                    ...thread,
                    author_first_name: profileMap?.[thread.author_address]?.first_name || null,
                    author_last_name: profileMap?.[thread.author_address]?.last_name || null
                  }))} />
                </ForumErrorBoundary>
              ) : (
                <p className="text-muted-foreground">No threads yet. Start a conversation!</p>
              )}
            </section>
          </>
        )}
      </div>
    </ForumContainer>
    </ForumAccessGate>
  );
}
