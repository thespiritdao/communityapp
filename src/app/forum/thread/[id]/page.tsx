// src/features/forum/thread/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import ForumContainer from 'src/features/forum/components/ForumContainer';
import PostList from 'src/features/forum/components/PostList';
import styles from 'src/features/forum/styles/Forum.module.css';

export default function ThreadDetailPage() {
  const { id } = useParams(); // "id" is the thread ID
  const router = useRouter();
  const [thread, setThread] = useState<any>(null);
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
          author_wallet,
          author_first_name,
          author_last_name,
          created_at,
          category_id,
          forum_categories (
            name
          )
        `)
        .eq('id', id)
        .single();  // We expect exactly one row

      if (error) {
        setError(error.message);
      } else {
        setThread(data);
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
  if (!thread) {
    return (
      <ForumContainer>
        <p>No thread found.</p>
      </ForumContainer>
    );
  }

  return (
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
  );
}
