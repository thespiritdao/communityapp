// src/features/forum/post.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from 'src/utils/supabaseClient';
import { useAccount } from 'wagmi';
import PostCard from 'src/app/features/forum/components/PostCard';
import { Button } from 'src/components/ui/button';
import { Loader2, Lock } from 'lucide-react';
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

const PostPage: React.FC = () => {
  const { postId } = useParams() as { postId: string };
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!postId) return;

    const fetchPost = async () => {
      setIsLoading(true);
      setError('');

      // 1) Ensure user is authenticated with Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('You must be logged in (Supabase session) to fetch post.');
        setIsLoading(false);
        return;
      }

      // 2) Query forum_posts with the given postId
      try {
        const { data, error } = await supabase
          .from('forum_posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (error) throw error;
        setPost(data);
      } catch (err: any) {
        setError(err.message || 'Error fetching post');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPost();
  }, [postId]);

  // If not connected to a wallet (wagmi) - optional check
  if (!isConnected || !address) {
    return (
      <div className={styles.centeredContainer}>
        <Lock className={styles.icon} />
        <h1 className={styles.pageTitle}>Connect Wallet to View Post</h1>
        <Button onClick={() => router.push('/login?redirect=' + encodeURIComponent(router.asPath))}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.centeredContainer}>
        <Loader2 className={styles.loadingIcon} />
        <h1 className={styles.pageTitle}>Loading post...</h1>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.centeredContainer}>
        <p className={styles.errorText}>{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  // Copy the current URL to the clipboard
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Post URL copied to clipboard!');
  };

  return (
    <div className={styles.postPageContainer}>
      <div className={styles.postActions}>
        <Button onClick={() => router.back()}>Back</Button>
        <Button onClick={handleShare}>Share</Button>
      </div>

      {post && <PostCard post={post} />}
    </div>
  );
};

export default PostPage;
