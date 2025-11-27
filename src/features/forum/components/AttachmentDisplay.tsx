// src/features/forum/components/AttachmentDisplay.tsx

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import {
  isImageFile,
  formatFileSize,
  getFileIcon,
  type MediaAttachment,
} from '../services/MediaUploadService';
import styles from '../styles/AttachmentDisplay.module.css';

interface AttachmentDisplayProps {
  threadId?: string;
  postId?: string;
  attachments?: MediaAttachment[]; // Can pass attachments directly
}

export function AttachmentDisplay({
  threadId,
  postId,
  attachments: providedAttachments,
}: AttachmentDisplayProps) {
  const [attachments, setAttachments] = useState<MediaAttachment[]>(
    providedAttachments || [],
  );
  const [loading, setLoading] = useState(!providedAttachments);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If attachments are provided directly, don't fetch
    if (providedAttachments) {
      setAttachments(providedAttachments);
      setLoading(false);
      return;
    }

    // Otherwise, fetch from database
    const fetchAttachments = async () => {
      try {
        setLoading(true);

        let query = supabase
          .from('forum_media_attachments')
          .select('*')
          .order('created_at', { ascending: true });

        if (postId && threadId) {
          // Check if postId === threadId (original post)
          if (postId === threadId) {
            // Original post: show attachments uploaded to thread with null post_id
            query = query.eq('thread_id', threadId).is('post_id', null);
            console.log(
              '[AttachmentDisplay] Querying for original post, threadId:',
              threadId,
              'with null post_id',
            );
          } else {
            // Reply post: only show attachments explicitly linked to this post
            query = query.eq('post_id', postId);
            console.log(
              '[AttachmentDisplay] Querying for reply post, postId:',
              postId,
            );
          }
        } else if (postId) {
          query = query.eq('post_id', postId);
          console.log('[AttachmentDisplay] Querying for postId:', postId);
        } else if (threadId) {
          query = query.eq('thread_id', threadId).is('post_id', null);
          console.log(
            '[AttachmentDisplay] Querying for threadId:',
            threadId,
            'with null post_id',
          );
        } else {
          // No thread or post ID, can't fetch
          setLoading(false);
          return;
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        console.log('[AttachmentDisplay] Found attachments:', data);
        setAttachments(data || []);
      } catch (err: any) {
        console.error('Failed to fetch attachments:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAttachments();
  }, [threadId, postId, providedAttachments]);

  if (loading) {
    return <div className={styles.loading}>Loading attachments...</div>;
  }

  if (error) {
    return (
      <div className={styles.error}>Error loading attachments: {error}</div>
    );
  }

  if (attachments.length === 0) {
    return null; // Don't show anything if no attachments
  }

  return (
    <div className={styles.attachmentContainer}>
      <div className={styles.attachmentGrid}>
        {attachments.map((attachment) => {
          const isImage = isImageFile(attachment.file_type);
          const icon = getFileIcon(attachment.file_type);

          return (
            <div key={attachment.id} className={styles.attachmentItem}>
              {isImage ? (
                <a
                  href={attachment.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.imageLink}
                >
                  <img
                    src={attachment.public_url}
                    alt={attachment.file_name}
                    className={styles.attachmentImage}
                    loading="lazy"
                  />
                </a>
              ) : (
                <a
                  href={attachment.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fileLink}
                  download={attachment.file_name}
                >
                  <div className={styles.fileIcon}>{icon}</div>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName}>
                      {attachment.file_name}
                    </div>
                    <div className={styles.fileSize}>
                      {formatFileSize(attachment.file_size_bytes)}
                    </div>
                  </div>
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
