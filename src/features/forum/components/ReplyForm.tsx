// src/features/forum/components/ReplyForm.tsx
'use client';
import { useState, useEffect } from 'react';
import { useForum } from '@/features/forum/hooks/useForum';
import { supabase } from '@/utils/supabaseClient';
import { ForumTextInput } from './ForumTextInput';
import { RichTextEditor } from './RichTextEditor';
import styles from '../styles/Forum.module.css';

// Editor choice is per category: journal categories (forum_categories.display_mode
// = 'journal') default to the rich editor with formatting; discussion categories
// keep the simple textarea with @mention autocomplete.

type ReplyFormProps = {
  threadId: string;
  onReplySuccess?: () => void;
};

export function ReplyForm({ threadId, onReplySuccess }: ReplyFormProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const { submitPost, isLoading, address } = useForum();
  const [isReady, setIsReady] = useState(false);
  const [requiredToken, setRequiredToken] = useState<string | null>(null);

  // Fetch the required_token from the thread's category
  useEffect(() => {
    async function fetchThreadToken() {
      try {
        const { data: threadData, error: threadError } = await supabase
          .from('forum_threads')
          .select('required_token, category_id') // <-- Add category_id here
          .eq('id', threadId)
          .single();

        if (threadError || !threadData) {
          console.error('Error fetching thread data:', threadError);
          return;
        }

        console.log(`Fetched thread data:`, threadData);
        setRequiredToken(threadData.required_token || null);
        // Store the category_id as well in a new state variable
        setCategoryId(threadData.category_id || null);
      } catch (error) {
        console.error('Unexpected error fetching thread data:', error);
      }
    }

    fetchThreadToken();
  }, [threadId]);

  // Add a new state variable at the top:
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [useRichEditor, setUseRichEditor] = useState(false);

  // Journal categories get the rich editor by default. Tolerates a missing
  // display_mode column (migration not yet applied → discussion behaviour).
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('forum_categories')
          .select('display_mode')
          .eq('id', categoryId)
          .single();
        if (cancelled) return;
        if (error) {
          if (!error.message?.includes('does not exist')) {
            console.warn('Could not read category display_mode:', error.message);
          }
          setUseRichEditor(false);
          return;
        }
        setUseRichEditor(data?.display_mode === 'journal');
      } catch {
        if (!cancelled) setUseRichEditor(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  // Ensure the form is ready only when the user has a valid wallet
  useEffect(() => {
    const hasValidAddress =
      !!address && typeof address === 'string' && address.startsWith('0x');
    setIsReady(hasValidAddress);
  }, [address]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!content.trim()) {
      setError('Please enter your reply');
      return;
    }

    if (!isReady) {
      setError('Please wait while we connect to your wallet');
      return;
    }

    // If requiredToken is still null, try to fetch it one more time
    let tokenToUse = requiredToken;
    if (tokenToUse === null) {
      console.log('Re-fetching required_token before posting...');
      const { data: threadData, error: threadError } = await supabase
        .from('forum_threads')
        .select('required_token')
        .eq('id', threadId)
        .single();

      if (threadError || !threadData) {
        console.error('Error fetching required_token:', threadError);
        setError('Error: Unable to determine required token for this thread.');
        return;
      }

      console.log('Fetched required_token:', threadData.required_token);
      tokenToUse = threadData.required_token;
      setRequiredToken(tokenToUse);
    }

    console.log({
      userWallet: address,
      threadId,
      requiredToken: tokenToUse,
    });

    // Explicitly pass the required token to the submitPost function
    const result = await submitPost(threadId, content, tokenToUse, categoryId);

    if (result.success) {
      console.log('Reply successfully posted with required_token:', tokenToUse);
      setContent('');
      onReplySuccess?.();
    } else {
      setError(result.error || 'Failed to create the reply.');
    }
  };

  return (
    <div className={styles.replyFormContainer}>
      <h2 className={styles.replyFormTitle}>Post a Reply</h2>
      {!isReady && (
        <div className={styles.connectionStatus}>
          Connecting to your wallet...
        </div>
      )}
      <form className={styles.replyForm} onSubmit={handleSubmit}>
        {useRichEditor ? (
          <RichTextEditor
            value={content}
            onChange={(value) => setContent(value)}
            placeholder="Write your reply... Use formatting toolbar. Type @name to mention (e.g., @John)"
            minHeight="150px"
          />
        ) : (
          <ForumTextInput
            value={content}
            onChange={(value) => setContent(value)}
            placeholder="Write your reply... Type @ to mention someone"
            threadId={threadId}
            minHeight="150px"
          />
        )}
        {error && <div className={styles.submitError}>{error}</div>}
        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading || !isReady}
        >
          {isLoading ? 'Posting...' : 'Post Reply'}
        </button>
      </form>
    </div>
  );
}
