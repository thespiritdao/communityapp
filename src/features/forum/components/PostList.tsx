// src/app/features/forum/components/PostList.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import PostCard from './PostCard';
import { useRouter } from 'next/navigation';
import styles from '../styles/Forum.module.css';
import UserTagging from 'src/components/UserTagging';
import { useForum } from 'src/features/forum/hooks/useForum';

interface Post {
  id: string;
  thread_id: string;
  content: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
}

interface ThreadInfo {
  id: string;
  title: string;
  category_id: string;
  category_name: string;
}

interface PostListProps {
  threadId: string;
}

const PostList: React.FC<PostListProps> = ({ threadId }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();
  const { submitPost, isLoading: forumLoading, address } = useForum();

  useEffect(() => {
    const fetchThreadAndPosts = async () => {
      try {
        setIsLoading(true);

        // 1) Fetch thread metadata including forum_categories required token
        const { data: threadData, error: threadError } = await supabase
          .from('forum_threads')
          .select(`
            id,
            title,
            category_id,
            forum_categories (
              name,
              required_token
            )
          `)
          .eq('id', threadId)
          .single();

        if (threadError) throw threadError;
        if (!threadData) throw new Error('Thread not found');

        // Build the thread info object
        setThreadInfo({
          id: threadData.id,
          title: threadData.title,
          category_id: threadData.category_id,
          category_name: threadData.forum_categories.name,
        });

        // 2) Fetch all posts (including OP) from forum_posts
        const { data: postsData, error: postsError } = await supabase
          .from('forum_posts')
          .select(`
            id,
            thread_id,
            content,
            author_wallet,
            author_first_name,
            author_last_name,
            created_at
          `)
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });

        if (postsError) throw postsError;
        setPosts(postsData || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (threadId) {
      fetchThreadAndPosts();
    }
  }, [threadId]);

  // Handle new replies
  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Use submitPost from useForum to handle reply, tagging, and notifications
      const result = await submitPost(threadId, replyContent);
      if (!result.success) {
        setSubmitError(result.error || 'Failed to post reply');
        return;
      }

      // Reset form
      setReplyContent('');

      // Refresh posts
      const { data: updatedPosts, error: fetchError } = await supabase
        .from('forum_posts')
        .select(`
          id,
          thread_id,
          content,
          author_wallet,
          author_first_name,
          author_last_name,
          created_at
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setPosts(updatedPosts || []);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading thread...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error loading thread: {error}</div>;
  }

  if (!threadInfo) {
    return <div className={styles.error}>Thread not found</div>;
  }

  // Separate the original post (OP) from replies.
  // We assume the OP is the forum post whose id equals the thread id.
  const originalPost = posts.find((p) => p.id === threadInfo.id);
  const replies = posts.filter((p) => p.id !== threadInfo.id);

  return (
    <div className={styles.threadContainer}>
      {/* Thread header: title + category link */}
      <div className={styles.threadHeader}>
        <div className={styles.threadNavigation}>
          <a
            href={`/forum/category/${threadInfo.category_id}`}
            className={styles.categoryLink}
          >
            {threadInfo.category_name}
          </a>
          <span className={styles.breadcrumbSeparator}>/</span>
          <h1 className={styles.threadTitle}>{threadInfo.title}</h1>
        </div>
      </div>

      {/* Display the original post if it exists */}
      {originalPost && (
        <div className={styles.postsContainer}>
          <h2>Original Post</h2>
          <PostCard post={originalPost} />
        </div>
      )}

      {/* Display replies */}
      <div className={styles.postsContainer}>
        {replies.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No replies yet. Be the first to reply!</p>
          </div>
        ) : (
          <ul className={styles.postsList}>
            {replies.map((post) => (
              <li key={post.id} className={styles.postItem}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reply form */}
      <div className={styles.replyFormContainer}>
        <h3 className={styles.replyFormTitle}>Post a Reply</h3>
        <form onSubmit={handleSubmitReply} className={styles.replyForm}>
          <UserTagging
            value={replyContent}
            onChange={setReplyContent}
            placeholder="Write your reply here... Use @ to mention someone"
            className={styles.replyTextarea}
            multiLine={true}
            contextType="forum"
            contextId={threadId}
            contextUrl={`/forum/thread/${threadId}`}
          />
          {submitError && (
            <div className={styles.submitError}>{submitError}</div>
          )}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Posting...' : 'Post Reply'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PostList;
