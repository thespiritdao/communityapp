// src/app/features/forum/components/PostList.tsx
'use client';

import type React from 'react';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabaseClient';
import PostCard from './PostCard';
import { useRouter } from 'next/navigation';
import styles from '../styles/Forum.module.css';
import { RichTextEditor } from './RichTextEditor';
import { useForum } from '@/features/forum/hooks/useForum';
import { ModerationToolbar } from './ModerationToolbar';
import { ThreadSummary } from './ThreadSummary';
import { PollDisplay } from './PollDisplay';
import { MediaUpload } from './MediaUpload';
import { getPollByThreadId } from '../services/PollService';
import { useForumUserProfiles } from '../hooks/useForumUserProfiles';
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
        });

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
            {threadInfo.title}
          </h1>
        </div>

        {/* Moderation Toolbar */}
        <ModerationToolbar
          targetType="thread"
          targetId={threadInfo.id}
          isPinned={threadInfo.is_pinned}
          podId={threadInfo.pod_id}
          isLocked={threadInfo.is_locked}
          onActionComplete={() => {
            // Refresh thread data after moderation action
            window.location.reload();
          }}
        />
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
            <RichTextEditor
              value={replyContent}
              onChange={setReplyContent}
              placeholder="Write your reply here... Use formatting tools above. Type @username to mention someone"
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
