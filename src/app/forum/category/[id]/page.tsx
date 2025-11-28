// src/app/forum/category/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabaseClient';
import ForumContainer from '@/features/forum/components/ForumContainer';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import { FeaturedContent } from '@/features/forum/components/FeaturedContent';
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

        const { data, error } = await supabase
          .from('forum_threads')
          .select(`
            id,
            categoryId:category_id,
            title,
            content,
            author_address,
            created_at,
            is_pinned
          `)
          .eq('category_id', categoryId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .range(start, end);

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
  }, [categoryId]);

  // Load more threads
  const loadMoreThreads = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    const start = nextPage * THREADS_PER_PAGE;
    const end = start + THREADS_PER_PAGE - 1;

    try {
      const { data, error } = await supabase
        .from('forum_threads')
        .select(`
          id,
          categoryId:category_id,
          title,
          content,
          author_address,
          created_at,
          is_pinned
        `)
        .eq('category_id', categoryId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(start, end);

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
          {/* If categoryName is available, show it; otherwise fallback to the ID */}
          {categoryName || `Category: ${categoryId}`}
        </h2>

        {/* Featured Content */}
        {typeof categoryId === 'string' && (
          <FeaturedContent categoryId={categoryId} limit={3} />
        )}

        {/* Optional: Add a "Create Thread" button that pre-fills categoryId */}
        <div className={styles.threadListHeader}>
          <button
            className={styles.newThreadButton}
            onClick={() =>
              router.push(`/forum/create-thread?categoryId=${categoryId}`)
            }
          >
            Create Thread
          </button>
        </div>

        {threads.length === 0 ? (
          <p className={styles.emptyState}>
            No threads found in this category.
          </p>
        ) : (
          <>
            <ul className={styles.threadList}>
              {threads.map((thread) => {
                const profile = profileMap?.[thread.author_address];
                const authorName = profile
                  ? [profile.first_name, profile.last_name]
                      .filter(Boolean)
                      .join(' ') || 'Anonymous'
                  : 'Anonymous';

                // Strip HTML and truncate content to ~150 characters (fits 2 lines)
                const plainText = stripHtml(thread.content || '');
                const description =
                  plainText.length > 150
                    ? plainText.substring(0, 150) + '...'
                    : plainText;

                return (
                  <li key={thread.id} className={styles.threadItem}>
                    <a
                      href={`/forum/thread/${thread.id}`}
                      className={styles.threadCard}
                    >
                      <div className={styles.threadTitle}>
                        {thread.is_pinned && '📌 '}
                        {thread.title}
                      </div>

                      {/* Thread Description */}
                      {description && (
                        <div className={styles.threadDescription}>
                          {description}
                        </div>
                      )}

                      <div className={styles.threadMeta}>
                        <div className={styles.authorSection}>
                          {/* Profile Picture */}
                          {profile?.profile_picture ? (
                            <img
                              src={profile.profile_picture}
                              alt={authorName}
                              className={styles.authorAvatar}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedProfile(profile);
                              }}
                            />
                          ) : (
                            <div
                              className={styles.authorAvatarPlaceholder}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (profile) setSelectedProfile(profile);
                              }}
                            >
                              {authorName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className={styles.authorName}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (profile) setSelectedProfile(profile);
                            }}
                          >
                            {authorName}
                          </span>
                        </div>
                        <span className={styles.threadDate}>
                          {new Date(thread.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>

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
