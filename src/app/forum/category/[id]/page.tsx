// src/app/forum/category/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabaseClient';
import ForumContainer from '@/features/forum/components/ForumContainer';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import { FeaturedContent } from '@/features/forum/components/FeaturedContent';
import { ForumSearch } from '@/features/forum/components/ForumSearch';
import { ThreadSortControls, type SortOption } from '@/features/forum/components/ThreadSortControls';
import ThreadCard from '@/features/forum/components/ThreadCard';
import { useForumUserProfiles } from '@/features/forum/hooks/useForumUserProfiles';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import styles from '@/features/forum/styles/Forum.module.css';

const THREADS_PER_PAGE = 20;

export default function CategoryPage() {
  const params = useParams();
  const categoryId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [categoryName, setCategoryName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Batch fetch user profiles for threads (prevents N+1 queries)
  const uniqueAuthors = useMemo(() => {
    return [...new Set(threads.map((t: any) => t.author_address))];
  }, [threads]);

  const { data: profileMap } = useForumUserProfiles(uniqueAuthors);

  // Helper to strip HTML tags
  const stripHtml = (html: string) => {
    if (typeof document === 'undefined') return html || ''; // SSR safety
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
  };

  // Initial load - fetch category name and first page
  useEffect(() => {
    async function fetchCategoryAndThreads() {
      setLoading(true);
      setPage(0);
      setThreads([]);
      setHasMore(true);

      try {
        // 1) Fetch category name
        const { data: catData, error: catError } = await supabase
          .from('forum_categories')
          .select('name')
          .eq('id', categoryId)
          .single();

        if (catError) {
          console.warn('Could not fetch category name:', catError.message);
        } else if (catData) {
          setCategoryName(catData.name);
        }

        // 2) Fetch first page of threads with pagination
        const start = 0;
        const end = THREADS_PER_PAGE - 1;

        let query = supabase
          .from('forum_threads')
          .select(`
            id,
            categoryId:category_id,
            title,
            content,
            author_address,
            created_at,
            is_pinned,
            is_resolved,
            view_count,
            reply_count,
            last_reply_at
          `)
          .eq('category_id', categoryId)
          .order('is_pinned', { ascending: false });

        // Apply sort
        if (sortOption === 'active') {
          query = query.order('last_reply_at', { ascending: false, nullsFirst: false });
        } else if (sortOption === 'replies') {
          query = query.order('reply_count', { ascending: false });
        } else if (sortOption === 'unanswered') {
          query = query.eq('reply_count', 0).order('created_at', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query.range(start, end);

        if (error) {
          setError(error.message);
        } else {
          setThreads(data || []);
          // If we got fewer threads than requested, there are no more
          setHasMore((data?.length || 0) === THREADS_PER_PAGE);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (categoryId) {
      fetchCategoryAndThreads();
    }
  }, [categoryId, sortOption]);

  // Load more threads
  const loadMoreThreads = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    const start = nextPage * THREADS_PER_PAGE;
    const end = start + THREADS_PER_PAGE - 1;

    try {
      let moreQuery = supabase
        .from('forum_threads')
        .select(`
          id,
          categoryId:category_id,
          title,
          content,
          author_address,
          created_at,
          is_pinned,
          is_resolved,
          view_count,
          reply_count,
          last_reply_at
        `)
        .eq('category_id', categoryId)
        .order('is_pinned', { ascending: false });

      if (sortOption === 'active') {
        moreQuery = moreQuery.order('last_reply_at', { ascending: false, nullsFirst: false });
      } else if (sortOption === 'replies') {
        moreQuery = moreQuery.order('reply_count', { ascending: false });
      } else if (sortOption === 'unanswered') {
        moreQuery = moreQuery.eq('reply_count', 0).order('created_at', { ascending: false });
      } else {
        moreQuery = moreQuery.order('created_at', { ascending: false });
      }

      const { data, error } = await moreQuery.range(start, end);

      if (error) {
        console.error('Error loading more threads:', error);
      } else {
        setThreads((prev) => [...prev, ...(data || [])]);
        setPage(nextPage);
        // If we got fewer threads than requested, there are no more
        setHasMore((data?.length || 0) === THREADS_PER_PAGE);
      }
    } catch (err) {
      console.error('Error loading more threads:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <ForumContainer>
        <p className={styles.loading}>Loading category...</p>
      </ForumContainer>
    );
  }

  if (error) {
    return (
      <ForumContainer>
        <p className={styles.error}>Error: {error}</p>
      </ForumContainer>
    );
  }

  return (
    <ForumAccessGate
      categoryId={typeof categoryId === 'string' ? categoryId : ''}
      fallbackMessage="This category is restricted to specific pod members or token holders."
    >
      <ForumContainer>
        <h2 className={styles.categoryTitle}>
          {categoryName || `Category: ${categoryId}`}
        </h2>

        {/* Search + Sort + Create */}
        <div style={{ marginBottom: 16 }}>
          <ForumSearch categoryId={categoryId} placeholder={`Search in ${categoryName || 'this category'}...`} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <ThreadSortControls active={sortOption} onChange={setSortOption} />
          <button
            className={styles.newThreadButton}
            onClick={() => router.push(`/forum/create-thread?categoryId=${categoryId}`)}
          >
            Create Thread
          </button>
        </div>

        {/* Featured Content */}
        {typeof categoryId === 'string' && (
          <FeaturedContent categoryId={categoryId} limit={3} />
        )}

        {threads.length === 0 ? (
          <p className={styles.emptyState}>
            No threads found in this category.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {threads.map((thread: any) => {
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
                      reply_count: thread.reply_count ?? 0,
                      view_count: thread.view_count ?? 0,
                      last_reply_at: thread.last_reply_at,
                      is_resolved: thread.is_resolved,
                      is_pinned: thread.is_pinned,
                    }}
                  />
                );
              })}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: '2rem',
                }}
              >
                <button
                  className={styles.newThreadButton}
                  onClick={loadMoreThreads}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? 'Loading...'
                    : `Load More (${threads.length} loaded)`}
                </button>
              </div>
            )}
          </>
        )}
        <div>
          <button
            className={styles.ForumBackButton}
            onClick={() => router.push('/forum')}
            style={{ marginTop: '1rem' }}
          >
            Back to Forum
          </button>
        </div>

        {/* Profile Modal */}
        {selectedProfile && (
          <ProfileModal
            user={selectedProfile}
            users={selectedProfile ? [selectedProfile] : []}
            onClose={() => setSelectedProfile(null)}
          />
        )}
      </ForumContainer>
    </ForumAccessGate>
  );
}
