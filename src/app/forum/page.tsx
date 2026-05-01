// src/app/forum/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import { supabase } from '@/utils/supabaseClient';
import ForumContainer from '@/features/forum/components/ForumContainer';
import CategoryList from '@/features/forum/components/CategoryList';
import ThreadCard from '@/features/forum/components/ThreadCard';
import ForumErrorBoundary from '@/features/forum/components/ForumErrorBoundary';
import { ForumSearch } from '@/features/forum/components/ForumSearch';
import { Button } from '@/components/ui/button';
import { useForum } from '@/features/forum/hooks/useForum';
import { useTokenGate } from '@/features/forum/hooks/useTokenGate';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import {
  getUserIdentity,
  getAccessibleForums,
  logUserIdentity,
} from '@/utils/accessControlUtils';
import { useForumUserProfiles } from '@/features/forum/hooks/useForumUserProfiles';
import { getCurrentSession } from '@/features/identity';
import { Loader2, Bookmark, MessageSquare, Clock } from 'lucide-react';
import styles from '@/features/forum/styles/Forum.module.css';

interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  required_token?: string | null;
  thread_count: number;
  pod_id?: string | null;
  pod_name?: string | null;
}

interface Thread {
  id: string;
  category_id: string;
  title: string;
  author_address: string;
  created_at: string;
  post_count: number;
  category_name: string;
  pod_name?: string | null;
}

export default function ForumPage() {
  const router = useRouter();
  const { address, isConnected } = useCDPStatus();
  const { loadThreads } = useForum();
  const { tokenBalances, isLoading: tokenGateLoading } = useTokenGate();
  const { userHats, isLoading: hatPermissionsLoading } = useHatPermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentThreads, setRecentThreads] = useState<Thread[]>([]);
  const [bookmarkedThreads, setBookmarkedThreads] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Batch fetch user profiles for recent threads (prevents N+1 queries)
  const uniqueThreadAuthors = useMemo(() => {
    return [...new Set(recentThreads.map((t) => t.author_address))];
  }, [recentThreads]);

  const { data: profileMap } = useForumUserProfiles(uniqueThreadAuthors);

  // Wait for both token balances and HAT permissions to load before fetching forum data
  useEffect(() => {
    if (
      !tokenGateLoading &&
      !hatPermissionsLoading &&
      tokenBalances &&
      address
    ) {
      fetchForumData();
    }
  }, [
    tokenGateLoading,
    hatPermissionsLoading,
    tokenBalances,
    userHats,
    address,
  ]);

  // NEW: Get user's accessible forums using the RPC function
  const getUserAccessibleForums = async () => {
    try {
      if (!address || !tokenBalances) {
        console.warn(
          'Cannot get accessible forums: missing address or token balances',
        );
        return [];
      }

      // Get user identity from token balances and HAT permissions
      const identity = await getUserIdentity(address, tokenBalances, userHats);
      logUserIdentity(identity, 'Forum Access Check');

      // Use the RPC function to get accessible forums
      const accessibleForums = await getAccessibleForums(identity);
      console.log(
        `📋 User has access to ${accessibleForums.length} forum categories`,
      );

      return accessibleForums;
    } catch (error) {
      console.error('Error getting accessible forums:', error);
      return [];
    }
  };

  // NEW: Fetch forum data using BOTH RPC function AND direct query
  const fetchForumData = async () => {
    if (!address || !tokenBalances) {
      console.warn(
        'Cannot fetch forum data: missing address or token balances',
      );
      return;
    }

    setLoadingData(true);
    setLoadError(null);

    try {
      // 1) Get user's accessible forums using the new RPC system (old link table method)
      const accessibleForums = await getUserAccessibleForums();

      // 2) ALSO get pod-based forum categories using direct required_token check
      // 🔒 SECURITY: Must check pod_modules.forum_enabled to respect toggle state
      const identity = await getUserIdentity(address, tokenBalances, userHats);
      console.log('🔑 User identity for forum query:', {
        hatsCount: identity.userHats.length,
        hats: identity.userHats,
        tokensCount: identity.userTokens.length,
      });

      let podForums: any[] = [];

      // Only query if user has HATs (otherwise query would fail)
      if (identity.userHats.length > 0) {
        const { data, error: podForumError } = await supabase
          .from('forum_categories')
          .select(`
            *,
            pods!inner(
              id,
              name
            )
          `)
          .eq('is_active', true)
          .not('pod_id', 'is', null)
          .in('required_token', identity.userHats);

        if (podForumError) {
          console.warn('❌ Error fetching pod forums:', podForumError);
        } else {
          // 🔒 SECURITY: Filter by forum_enabled toggle
          // We need to check pod_modules separately since we can't join it in the select
          const forumsToCheck = data || [];

          // Get pod_modules for all pods
          const podIds = [...new Set(forumsToCheck.map((f: any) => f.pod_id))];
          const { data: podModules, error: modulesError } = await supabase
            .from('pod_modules')
            .select('pod_id, forum_enabled')
            .in('pod_id', podIds);

          if (modulesError) {
            console.warn('❌ Error fetching pod modules:', modulesError);
          }

          // Create a map of pod_id -> forum_enabled
          const moduleMap = new Map(
            (podModules || []).map((m: any) => [m.pod_id, m.forum_enabled])
          );

          // Filter forums to only include those where forum_enabled = true
          podForums = forumsToCheck
            .filter((forum: any) => {
              const forumEnabled = moduleMap.get(forum.pod_id);
              if (forumEnabled === false) {
                console.log(
                  `🔒 Blocking forum "${forum.name}" - pod forum module is disabled`
                );
                return false;
              }
              return true;
            })
            .map((forum: any) => ({
              ...forum,
              pod_name: forum.pods?.name || null,
            }));

          console.log('📊 Pod forums query returned (after toggle filter):', podForums);
        }
      }

      console.log(`🔍 Found ${podForums.length} pod-based forum categories for user`);

      // Combine both sets of forums, removing duplicates by ID
      const allForumsMap = new Map();
      accessibleForums.forEach((forum: any) => allForumsMap.set(forum.id, forum));
      podForums.forEach((forum: any) => allForumsMap.set(forum.id, forum));
      const combinedForums = Array.from(allForumsMap.values());

      // 3) Fetch thread counts for ALL accessible forums in a SINGLE query (performance optimization)
      const forumIds = combinedForums.map((forum: any) => forum.id);
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
          threadCounts = allThreads.reduce(
            (acc, thread) => {
              acc[thread.category_id] = (acc[thread.category_id] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
        }
      }

      // 4) Attach counts to forums
      const forumsWithCounts = combinedForums.map((forum: any) => ({
        ...forum,
        thread_count: threadCounts[forum.id] || 0,
      }));

      console.log(
        `✅ Successfully loaded ${forumsWithCounts.length} accessible forum categories (${accessibleForums.length} from RPC, ${podForums.length} from pods)`,
      );
      setCategories(forumsWithCounts);

      // 3) Fetch recent threads using loadThreads from useForum hook
      // Load more threads (20) to ensure we have enough after filtering by accessible categories
      const threadsResult = await loadThreads(undefined, 0, 20);
      if (!threadsResult.success) {
        throw new Error('Failed to load threads');
      }

      // Filter threads to only show those from accessible categories
      const accessibleCategoryIds = new Set(forumIds);
      const filteredThreads = threadsResult.threads.filter(
        (thread: any) => accessibleCategoryIds.has(thread.category_id)
      );

      // Enrich threads with pod_name by mapping category_id to forum data
      const categoryToPodMap = new Map(
        combinedForums.map((forum: any) => [forum.id, forum.pod_name])
      );
      const enrichedThreads = filteredThreads.map((thread: any) => ({
        ...thread,
        pod_name: categoryToPodMap.get(thread.category_id) || null,
      }));

      // Take only the 6 most recent enriched threads
      setRecentThreads(enrichedThreads.slice(0, 6));

      // Fetch user's bookmarks
      try {
        const session = await getCurrentSession();
        const token = session?.access_token;
        if (token) {
          const bmRes = await fetch('/api/forum/bookmarks', {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (bmRes.ok) {
            const bmData = await bmRes.json();
            setBookmarkedThreads(bmData.bookmarks || []);
          }
        }
      } catch (e) {
        // Non-critical — ignore
      }

      setLoadingData(false);
    } catch (err: any) {
      console.error('Error loading forum data:', err);
      setLoadError(
        err instanceof Error ? err.message : 'Unknown error loading forum data',
      );
      setLoadingData(false);
    }
  };

  return (
    <ForumAccessGate
      allowPublic={false}
      fallbackMessage="You need to hold a Proof of Curiosity token or have appropriate role permissions to access the forum."
    >
      <ForumContainer>
        {/* Add bottom-nav-spacing to create space at the bottom so the bottom bar doesn't overlap the content */}
        <div className="bottom-nav-spacing">
          {/* Top row: Forum title + "New Thread" button */}
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold" style={{ color: '#2F5D50' }}>SpiritDAO Forums</h1>
            <Button
              className={styles.newThreadButton}
              onClick={() => {
                console.log('New Thread button clicked!');
                router.push('/forum/create-thread');
              }}
            >
              New Thread
            </Button>
          </div>

          {/* Search bar */}
          <div style={{ marginBottom: 24 }}>
            <ForumSearch />
          </div>

          {/* Error display */}
          {loadError && (
            <div className="bg-destructive/10 p-4 rounded-lg border border-destructive mb-8">
              <p className="text-destructive">{loadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchForumData}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Loading spinner - show loading while token gating, role permissions, or data loading */}
          {loadingData || tokenGateLoading || hatPermissionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="ml-3 text-muted-foreground">
                {tokenGateLoading
                  ? 'Checking token permissions...'
                  : hatPermissionsLoading
                    ? 'Checking role permissions...'
                    : 'Loading forum data...'}
              </div>
            </div>
          ) : (
            <>
              {/* Bookmarks Section — only if user has bookmarks */}
              {bookmarkedThreads.length > 0 && (
                <section style={{ marginBottom: 32 }}>
                  <h2 style={{
                    fontSize: '1.1rem', fontWeight: 600, marginBottom: 12,
                    display: 'flex', alignItems: 'center', gap: 8, color: '#8B5E3C',
                  }}>
                    <Bookmark size={18} /> My Bookmarks
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bookmarkedThreads.slice(0, 5).map((bm: any) => (
                      <a
                        key={bm.id}
                        href={`/forum/thread/${bm.thread_id}`}
                        style={{
                          display: 'block',
                          padding: '10px 14px',
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          border: '1px solid rgba(209,196,169,0.4)',
                          textDecoration: 'none',
                          color: '#212121',
                          fontSize: '0.9rem',
                          fontWeight: 500,
                          transition: 'box-shadow 0.2s',
                        }}
                      >
                        {bm.forum_threads?.title || 'Bookmarked Thread'}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Categories Section */}
              <section className="mb-12">
                <h2 style={{
                  fontSize: '1.1rem', fontWeight: 600, marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 8, color: '#2F5D50',
                }}>
                  <MessageSquare size={18} /> Forum Categories
                </h2>
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
                <h2 style={{
                  fontSize: '1.1rem', fontWeight: 600, marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 8, color: '#2F5D50',
                }}>
                  <Clock size={18} /> Recent Threads
                </h2>
                {recentThreads.length > 0 ? (
                  <ForumErrorBoundary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {recentThreads.map((thread) => {
                        const profile = profileMap?.[thread.author_address];
                        return (
                          <ThreadCard
                            key={thread.id}
                            thread={{
                              id: thread.id,
                              title: thread.title,
                              author_wallet: thread.author_address,
                              author_first_name: profile?.first_name || null,
                              author_last_name: profile?.last_name || null,
                              author_profile_picture: profile?.profile_picture || null,
                              created_at: thread.created_at,
                              post_count: thread.post_count ?? 0,
                              category_name: thread.category_name,
                              pod_name: thread.pod_name,
                            }}
                          />
                        );
                      })}
                    </div>
                  </ForumErrorBoundary>
                ) : (
                  <p className="text-muted-foreground">
                    No threads yet. Start a conversation!
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </ForumContainer>
    </ForumAccessGate>
  );
}
