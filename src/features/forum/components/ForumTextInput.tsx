// src/features/forum/components/ForumTextInput.tsx
'use client';

import { useState, useRef } from 'react';
import UserTagging from '@/components/UserTagging';
import styles from '../styles/ForumTextInput.module.css';

interface ForumTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  threadId?: string;
  minHeight?: string;
}

/**
 * Forum text input with @mention support and basic formatting
 * Uses UserTagging component for autocomplete mentions
 */
export function ForumTextInput({
  value,
  onChange,
  placeholder = 'Write your reply... Use @ to mention someone',
  threadId,
  minHeight = '150px',
}: ForumTextInputProps) {
  const [mentions, setMentions] = useState<Array<{ id: string; display: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleMentionsChange = (newMentions: Array<{ id: string; display: string }>) => {
    setMentions(newMentions);
  };

  // Expose mentions for parent component if needed
  const getMentions = () => mentions;

  return (
    <div className={styles.forumTextInputContainer}>
      <div
        className={styles.inputWrapper}
        style={{ minHeight }}
      >
        <UserTagging
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          multiLine={true}
          contextType="forum"
          contextId={threadId}
          onMentionsChange={handleMentionsChange}
          className={styles.userTaggingInput}
          style={{
            minHeight,
            width: '100%',
            padding: '12px',
            fontSize: '14px',
            lineHeight: '1.5',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Optional: Show mention count or formatting help */}
      {mentions.length > 0 && (
        <div className={styles.mentionHint}>
          Mentioning {mentions.length} {mentions.length === 1 ? 'person' : 'people'}
        </div>
      )}
    </div>
  );
}
