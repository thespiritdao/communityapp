// src/features/forum/thread.tsx
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import ForumContainer from 'src/app/features/forum/components/ForumContainer';
import PostList from 'src/app/features/forum/components/PostList';
import { ReplyForm } from 'src/features/forum/components/ReplyForm';
import styles from '../styles/Forum.module.css';

const ThreadPage: React.FC = () => {
  // Extract the dynamic thread ID from the URL
  const params = useParams();
  const { threadId } = params as { threadId: string };

  // Show a loading state if the threadId is not yet available
  if (!threadId) {
    return (
      <ForumContainer>
        <div className={styles.loading}>Loading thread...</div>
      </ForumContainer>
    );
  }

  return (
    <ForumContainer>
      {/* PostList displays the thread's header, details, and all replies */}
      <PostList threadId={threadId} />
      
      {/* ReplyForm allows users to post a reply to the thread */}
      <ReplyForm threadId={threadId} onReplySuccess={() => {
        // Optionally, you can trigger a refresh of the PostList or display a notification here.
      }} />
    </ForumContainer>
  );
};

export default ThreadPage;
