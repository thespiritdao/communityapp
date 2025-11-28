// src/features/forum/thread/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import ForumContainer from '@/features/forum/components/ForumContainer';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import PostList from '@/features/forum/components/PostList';
import styles from '@/features/forum/styles/Forum.module.css';

export default function ThreadDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const [thread, setThread] = useState<any>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchThread() {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_threads')
        .select(`
          id,
          title,
          author_address,
          created_at,
          category_id,
          forum_categories (
            name
          )
        `)
        .eq('id', id)
        .single(); // We expect exactly one row

      if (error) {
        setError(error.message);
      } else {
        setThread(data);
        if (data?.category_id) {
          setCategoryId(data.category_id);
        }
      }
      setLoading(false);
    }

    if (id) {
      fetchThread();
    }
  }, [id]);

  if (loading) {
    return (
      <ForumContainer>
        <p>Loading thread...</p>
      </ForumContainer>
    );
  }
  if (error) {
    return (
      <ForumContainer>
        <p>Error: {error}</p>
      </ForumContainer>
    );
  }
  if (!thread || !categoryId) {
    return (
      <ForumContainer>
        <p>No thread found.</p>
      </ForumContainer>
    );
  }

  return (
    <ForumAccessGate
      categoryId={categoryId}
      fallbackMessage="You need appropriate permissions to view this thread."
    >
      <ForumContainer>
        {/* Example of how you might display metadata if desired:
          <h1>{thread.title}</h1>
          <p>
            By: {thread.author_first_name 
              ? `${thread.author_first_name} ${thread.author_last_name}`
              : thread.author_wallet
            }
          </p>
          <p>Created: {new Date(thread.created_at).toLocaleString()}</p>
      */}

        {/* PostList fetches and displays all posts for this thread */}
        <PostList threadId={id} />

        <div>
          <button
            className={styles.ForumBackButton}
            onClick={() => router.push('/forum')}
            style={{ marginTop: '1rem' }}
          >
            Back to Forum
          </button>
        </div>
      </ForumContainer>
    </ForumAccessGate>
  );
}
