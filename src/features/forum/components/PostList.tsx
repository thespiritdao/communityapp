// src/app/features/forum/components/PostList.tsx
'use client';

import type React from 'react';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';
import PostCard from './PostCard';
import { useRouter } from 'next/navigation';
import styles from '../styles/Forum.module.css';
import { ForumTextInput } from './ForumTextInput';
import { useForum } from '@/features/forum/hooks/useForum';
import { ModerationToolbar } from './ModerationToolbar';
import { ThreadSummary } from './ThreadSummary';
import { PollDisplay } from './PollDisplay';
import { MediaUpload } from './MediaUpload';
import { BookmarkButton } from './BookmarkButton';
import { getPollByThreadId } from '../services/PollService';
import { useForumUserProfiles } from '../hooks/useForumUserProfiles';
import { getCurrentSession } from '@/features/identity';
import { CheckCircle } from 'lucide-react';
import type { MediaAttachment } from '../services/MediaUploadService';

interface Post {
  id: string;
  thread_id: string;
  content: string;
  author_address: string;
  created_at: string;
}

interface ThreadInfo {
  id: string;
  title: string;
  content?: string;
  author_address: string;
  created_at: string;
  category_id: string;
  category_name: string;
  pod_id: string | null;
  is_pinned?: boolean;
  is_locked?: boolean;
  is_resolved?: boolean;
}

interface PostListProps {
  threadId: string;
}

const PostList: React.FC<PostListProps> = ({ threadId }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);
  const [pollId, setPollId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [threadAttachments, setThreadAttachments] = useState<
    Record<string, MediaAttachment[]>
  >({});
  const [isResolved, setIsResolved] = useState(false);
  const [resolving, setResolving] = useState(false);
  const viewTrackedRef = useRef(false);
  const router = useRouter();
  const { submitPost, isLoading: forumLoading, address } = useForum();

  // Batch fetch user profiles for all post authors (prevents N+1 queries)
  const uniqueAuthors = useMemo(() => {
    const authors = posts.map((p) => p.author_address);
    if (threadInfo?.author_address) {
      authors.push(threadInfo.author_address);
    }
    return [...new Set(authors)];
  }, [posts, threadInfo]);

  const { data: profileMap, isLoading: profilesLoading } =
    useForumUserProfiles(uniqueAuthors);

  useEffect(() => {
    const fetchThreadAndPosts = async () => {
      try {
        setIsLoading(true);

        // Fetch thread, posts, and poll in parallel for better performance
        const [threadResult, pollResult, attachmentsResult] = await Promise.all(
          [
            // 1) Fetch thread metadata + posts in single query
            supabase
              .from('forum_threads')
              .select(`
              id,
              title,
              content,
              author_address,
              created_at,
              category_id,
              is_pinned,
              is_locked,
              is_resolved,
              forum_categories (
                name,
                required_token,
                pod_id
              )
            `)
              .eq('id', threadId)
              .single(),

            // 2) Fetch poll (if exists)
            getPollByThreadId(threadId),

            // 3) Fetch all attachments for thread in single query
            supabase
              .from('forum_media_attachments')
              .select('*')
              .eq('thread_id', threadId)
              .order('created_at', { ascending: true }),
          ],
        );

        // Handle thread data
        if (threadResult.error) throw threadResult.error;
        if (!threadResult.data) throw new Error('Thread not found');

        const threadData = threadResult.data;
        setThreadInfo({
          id: threadData.id,
          title: threadData.title,
          content: threadData.content,
          author_address: threadData.author_address,
          created_at: threadData.created_at,
          category_id: threadData.category_id,
          category_name: Array.isArray(threadData.forum_categories)
            ? threadData.forum_categories[0]?.name
            : null,
          pod_id: Array.isArray(threadData.forum_categories)
            ? threadData.forum_categories[0]?.pod_id || null
            : null,
          is_pinned: threadData.is_pinned,
          is_locked: threadData.is_locked,
          is_resolved: threadData.is_resolved,
        });
        setIsResolved(!!threadData.is_resolved);

        // Fetch posts separately (after thread is loaded)
        // Filter out deleted posts
        const { data: postsData, error: postsError } = await supabase
          .from('forum_posts')
          .select(`
            id,
            thread_id,
            content,
            author_address,
            created_at
          `)
          .eq('thread_id', threadId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('created_at', { ascending: true });

        if (postsError) throw postsError;
        setPosts(postsData || []);

        // Handle poll data
        console.log('[PostList] Poll result:', pollResult);
        if (pollResult.success && pollResult.poll) {
          console.log('[PostList] Setting poll ID:', pollResult.poll.id);
          setPollId(pollResult.poll.id);
        } else {
          console.log('[PostList] No poll found for thread:', threadId);
          setPollId(null);
        }

        // Handle attachments - group by post_id for efficient lookup
        if (!attachmentsResult.error && attachmentsResult.data) {
          console.log('[PostList] Fetched attachments:', {
            count: attachmentsResult.data.length,
            attachments: attachmentsResult.data,
          });

          const attachmentMap: Record<string, MediaAttachment[]> = {};
          attachmentsResult.data.forEach((attachment) => {
            const key = attachment.post_id || 'thread';
            console.log('[PostList] Grouping attachment:', {
              attachmentId: attachment.id,
              fileName: attachment.file_name,
              postId: attachment.post_id,
              threadId: attachment.thread_id,
              key,
            });

            if (!attachmentMap[key]) {
              attachmentMap[key] = [];
            }
            attachmentMap[key].push(attachment);
          });

          console.log('[PostList] Attachment map:', attachmentMap);
          console.log('[PostList] Thread-level attachments:', attachmentMap['thread']);
          setThreadAttachments(attachmentMap);
        } else if (attachmentsResult.error) {
          console.error('[PostList] Error fetching attachments:', attachmentsResult.error);
        } else {
          console.log('[PostList] No attachments found for thread');
        }
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

  // Real-time subscription for new/updated/deleted posts
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`thread-${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'forum_posts',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const newPost = payload.new as Post;
        setPosts((prev) => {
          if (prev.some((p) => p.id === newPost.id)) return prev;
          return [...prev, newPost];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'forum_posts',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.is_deleted) {
          setPosts((prev) => prev.filter((p) => p.id !== updated.id));
        } else {
          setPosts((prev) => prev.map((p) => p.id === updated.id ? { ...p, content: updated.content } : p));
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'forum_posts',
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const deletedId = (payload.old as any)?.id;
        if (deletedId) {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // View count tracking (fire once per session)
  useEffect(() => {
    if (!threadId || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    fetch('/api/forum/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId }),
    }).catch(() => {});
  }, [threadId]);

  // Mark thread as read
  useEffect(() => {
    if (!threadId) return;
    (async () => {
      const session = await getCurrentSession();
      const token = session?.access_token;
      if (!token) return;
      fetch('/api/forum/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      }).catch(() => {});
    })();
  }, [threadId]);

  // Quote handler — inserts blockquote into reply
  const handleQuote = useCallback((content: string, authorName: string) => {
    // Strip HTML for quoting
    const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
    let plainText = content;
    if (tmp) {
      tmp.innerHTML = content;
      plainText = tmp.textContent || tmp.innerText || content;
    }
    const quoted = plainText.split('\n').map((line: string) => `> ${line}`).join('\n');
    const quoteBlock = `> **${authorName}** wrote:\n${quoted}\n\n`;
    setReplyContent((prev) => quoteBlock + prev);
  }, []);

  // Resolve handler
  const handleResolve = async () => {
    const session = await getCurrentSession();
    const token = session?.access_token;
    if (!token || resolving) return;

    setResolving(true);
    try {
      const res = await fetch('/api/forum/resolve', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, resolved: !isResolved }),
      });
      if (res.ok) {
        setIsResolved(!isResolved);
      }
    } catch (err) {
      console.error('Resolve error:', err);
    } finally {
      setResolving(false);
    }
  };

  // Handle new replies
  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Use submitPost from useForum to handle reply, tagging, and notifications
      console.log(
        '[PostList] Submitting post with replyAttachments:',
        replyAttachments,
      );
      const result = await submitPost(threadId, replyContent);
      console.log('[PostList] submitPost result:', result);

      if (!result.success) {
        setSubmitError(result.error || 'Failed to post reply');
        return;
      }

      // Link uploaded attachments to the created post
      if (result.post && replyAttachments.length > 0) {
        const postId = result.post.id;
        try {
          const attachmentIds = replyAttachments.map((att) => att.id);
          console.log(
            '[PostList] Linking attachments:',
            attachmentIds,
            'to post:',
            postId,
          );

          const { data: updateResult, error: attachmentError } = await supabase
            .from('forum_media_attachments')
            .update({ post_id: postId })
            .in('id', attachmentIds)
            .select();

          if (attachmentError) {
            console.error(
              'Error linking attachments to post:',
              attachmentError,
            );
          } else {
            console.log(
              `Successfully linked ${updateResult?.length || 0} attachments to post ${postId}`,
              updateResult,
            );
          }
        } catch (err) {
          console.error('Error updating attachments:', err);
        }
      }

      // Reset form
      setReplyContent('');
      setReplyAttachments([]);

      // Refresh posts (exclude deleted)
      const { data: updatedPosts, error: fetchError } = await supabase
        .from('forum_posts')
        .select(`
          id,
          thread_id,
          content,
          author_address,
          created_at
        `)
        .eq('thread_id', threadId)
        .or('is_deleted.is.null,is_deleted.eq.false')
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

  // Create original post from thread data
  const originalPost: Post | null = threadInfo
    ? {
        id: threadInfo.id,
        thread_id: threadInfo.id,
        content: threadInfo.content || '',
        author_address: threadInfo.author_address,
        created_at: threadInfo.created_at,
      }
    : null;

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
          <h1 className={styles.threadTitle}>
            {threadInfo.is_pinned && '📌 '}
            {threadInfo.is_locked && '🔒 '}
            {isResolved && <CheckCircle size={18} style={{ color: '#2F5D50', display: 'inline', marginRight: 4 }} />}
            {threadInfo.title}
          </h1>
        </div>

        {/* Action bar: resolve + bookmark + moderation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Resolve button — only thread author sees this */}
          {address && address.toLowerCase() === threadInfo.author_address?.toLowerCase() && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${isResolved ? '#2F5D50' : '#D1C4A9'}`,
                backgroundColor: isResolved ? '#E8F1EE' : '#fff',
                color: isResolved ? '#2F5D50' : '#616161',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: resolving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle size={14} />
              {isResolved ? 'Resolved' : 'Mark Resolved'}
            </button>
          )}
          <BookmarkButton threadId={threadInfo.id} />
          <ModerationToolbar
            targetType="thread"
            targetId={threadInfo.id}
            isPinned={threadInfo.is_pinned}
            podId={threadInfo.pod_id}
            isLocked={threadInfo.is_locked}
            onActionComplete={() => { window.location.reload(); }}
          />
        </div>
      </div>

      {/* AI Summary */}
      {threadInfo && (
        <ThreadSummary
          threadId={threadId}
          threadTitle={threadInfo.title}
          threadContent={threadInfo.content}
        />
      )}

      {/* Poll Display */}
      {pollId && (
        <div style={{
          marginBottom: '20px',
          marginTop: '20px',
          position: 'relative',
          zIndex: 100,
          clear: 'both'
        }}>
          {/* DEBUG: Uncomment to see poll ID
          <div style={{
            padding: '10px',
            background: '#f0f0f0',
            marginBottom: '10px',
            border: '2px solid red',
            fontWeight: 'bold'
          }}>
            DEBUG: Rendering poll with ID: {pollId}
          </div>
          */}
          <PollDisplay pollId={pollId} />
        </div>
      )}

      {/* Display the original post */}
      {originalPost && (
        <div className={styles.postsContainer}>
          <h2>Original Post</h2>
          {(() => {
            const threadLevelAttachments = threadAttachments['thread'] || [];
            console.log('[PostList] Rendering original post with attachments:', {
              postId: originalPost.id,
              attachmentCount: threadLevelAttachments.length,
              attachments: threadLevelAttachments,
              allThreadAttachments: threadAttachments,
            });
            return (
              <PostCard
                post={originalPost}
                authorProfile={profileMap?.[originalPost.author_address]}
                attachments={threadLevelAttachments}
                podId={threadInfo.pod_id}
                isOriginalPost={true}
                threadId={threadInfo.id}
              />
            );
          })()}
        </div>
      )}

      {/* Display replies */}
      <div className={styles.postsContainer}>
        {posts.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No replies yet. Be the first to reply!</p>
          </div>
        ) : (
          <>
            <h2>Replies ({posts.length})</h2>
            <ul className={styles.postsList}>
              {posts.map((post) => (
                <li key={post.id} className={styles.postItem}>
                  <PostCard
                    post={post}
                    authorProfile={profileMap?.[post.author_address]}
                    attachments={threadAttachments[post.id] || []}
                    podId={threadInfo.pod_id}
                    onQuote={handleQuote}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Reply form - hide if thread is locked */}
      {threadInfo.is_locked ? (
        <div className={styles.replyFormContainer}>
          <div className={styles.lockedMessage}>
            🔒 This thread has been locked. No new replies can be posted.
          </div>
        </div>
      ) : (
        <div className={styles.replyFormContainer}>
          <h3 className={styles.replyFormTitle}>Post a Reply</h3>
          <form onSubmit={handleSubmitReply} className={styles.replyForm}>
            <ForumTextInput
              value={replyContent}
              onChange={setReplyContent}
              placeholder="Write your reply... Type @ to mention someone"
              threadId={threadId}
              minHeight="150px"
            />

            {/* Media Upload for replies */}
            <div style={{ marginTop: '15px', marginBottom: '15px' }}>
              <MediaUpload
                threadId={threadId}
                onUploadComplete={(attachments) => {
                  setReplyAttachments([...replyAttachments, ...attachments]);
                }}
                maxFiles={5}
              />
            </div>

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
      )}
    </div>
  );
};

export default PostList;
