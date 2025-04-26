// src/app/features/forum/components/PostCard.tsx
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from 'src/utils/supabaseClient';
import styles from '../styles/Forum.module.css';

interface Post {
  id: string;
  thread_id: string;
  content: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
}

interface PostCardProps {
  post: Post;
}

const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserWallet, setCurrentUserWallet] = useState<string | null>(null);

  // Check if current user is the author of the post
  useEffect(() => {
    const checkCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUserWallet(session.user.id);
      }
    };
    checkCurrentUser();
  }, []);

  const isAuthor = currentUserWallet === post.author_wallet;

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

	const getAuthorDisplayName = () => {
	  const { author_first_name, author_last_name, author_wallet } = post;
	  if (author_first_name && author_last_name) {
		return `${author_first_name} ${author_last_name}`;
	  } else if (author_first_name) {
		return author_first_name;
	  } else if (author_last_name) {
		return author_last_name;
	  } else {
		return author_wallet ? author_wallet.slice(0, 6) + '...' + author_wallet.slice(-4) : 'Anon.'; 
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

  return (
    <div className={styles.postCard}>
      <div className={styles.postHeader}>
		<div>
			<strong>{getAuthorDisplayName()}</strong>
        </div>
        {isAuthor && !isEditing && (
          <button 
            onClick={() => setIsEditing(true)} 
            className={styles.editButton}
          >
            Edit
          </button>
        )}
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
          /* Render content as markdown */
          <div className={styles.contentText}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
