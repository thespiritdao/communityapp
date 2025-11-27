import type React from 'react';
import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/utils/supabaseClient';
import { getCurrentSession } from '@/features/identity';
import styles from '../styles/Forum.module.css';
import { ModerationToolbar } from './ModerationToolbar';
import { ReportButton } from './ReportButton';
import { ReactionPicker } from './ReactionPicker';
import { AttachmentDisplay } from './AttachmentDisplay';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import type { MediaAttachment } from '../services/MediaUploadService';

interface Post {
  id: string;
  thread_id: string;
  content: string;
  author_address: string;
  created_at: string;
}

interface UserProfile {
  wallet_address: string;
  profile_picture?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  website?: string | null;
  interests?: string[] | null;
  seeking?: string[] | null;
}

interface PostCardProps {
  post: Post;
  authorProfile?: UserProfile; // Passed from parent to avoid N+1 queries
  attachments?: MediaAttachment[]; // Passed from parent to avoid N+1 queries
  podId?: string | null; // NEW: Pod ID for pod-specific permissions
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  authorProfile: providedProfile,
  attachments,
  podId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserWallet, setCurrentUserWallet] = useState<string | null>(
    null,
  );
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Use provided profile or fallback (for backwards compatibility)
  const authorProfile = providedProfile;

  // Check if current user is the author of the post
  useEffect(() => {
    const checkCurrentUser = async () => {
      const session = await getCurrentSession();
      if (session) {
        setCurrentUserWallet(session.user.id);
      }
    };
    checkCurrentUser();
  }, []);

  const isAuthor = currentUserWallet === post.author_address;

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('forum_posts')
        .update({ content: editContent })
        .eq('id', post.id);

      if (updateError) throw updateError;

      setIsEditing(false);
      // Update the post content locally so the UI reflects changes
      post.content = editContent;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(post.content);
    setError(null);
  };

  const getAuthorDisplay = () => {
    if (authorProfile) {
      const fullName = [authorProfile.first_name, authorProfile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      return (
        fullName ||
        post.author_address.slice(0, 6) + '...' + post.author_address.slice(-4)
      );
    }
    return (
      post.author_address.slice(0, 6) + '...' + post.author_address.slice(-4)
    );
  };

  const handleProfileClick = () => {
    if (authorProfile) {
      setShowProfileModal(true);
    }
  };

  return (
    <div className={styles.postCard}>
      <div className={styles.postHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Profile picture */}
          {authorProfile?.profile_picture ? (
            <img
              src={authorProfile.profile_picture}
              alt={getAuthorDisplay()}
              onClick={handleProfileClick}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover',
                cursor: 'pointer',
              }}
            />
          ) : (
            <div
              onClick={handleProfileClick}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#666',
                cursor: 'pointer',
              }}
            >
              {getAuthorDisplay().charAt(0).toUpperCase()}
            </div>
          )}
          {/* Name/Address */}
          <strong onClick={handleProfileClick} style={{ cursor: 'pointer' }}>
            {getAuthorDisplay()}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Author Edit Button */}
          {isAuthor && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className={styles.editButton}
            >
              Edit
            </button>
          )}

          {/* Moderation Toolbar */}
          <ModerationToolbar
            targetType="post"
            targetId={post.id}
            podId={podId}
            onActionComplete={() => {
              window.location.reload();
            }}
          />
        </div>
      </div>

      <div className={styles.postContent}>
        {isEditing ? (
          <div className={styles.editContainer}>
            <textarea
              className={styles.editTextarea}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={5}
            />

            {error && <div className={styles.editError}>{error}</div>}

            <div className={styles.editActions}>
              <button
                onClick={handleSaveEdit}
                className={styles.saveButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className={styles.cancelButton}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Render content as HTML */}
            <div
              className={styles.contentText}
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Display attachments - use provided attachments if available, otherwise fetch */}
            {attachments ? (
              <AttachmentDisplay attachments={attachments} />
            ) : (
              <AttachmentDisplay postId={post.id} threadId={post.thread_id} />
            )}
          </>
        )}
      </div>

      {/* Post Footer: Reactions + Report + Date */}
      <div className={styles.postFooter}>
        <ReactionPicker postId={post.id} />
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            marginLeft: 'auto',
          }}
        >
          <ReportButton
            targetType="post"
            targetId={post.id}
            threadId={post.thread_id}
          />
          <span className={styles.postDate}>{formatDate(post.created_at)}</span>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && authorProfile && (
        <ProfileModal
          user={authorProfile}
          users={authorProfile ? [authorProfile] : []}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
};

export default PostCard;
