// src/features/forum/components/MentionRenderer.tsx
'use client';

import React from 'react';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

interface MentionRendererProps {
  content: string;
  className?: string;
}

/**
 * Parses content with @[Name](address) mentions and renders them as interactive UserProfileDisplay components
 *
 * Formats supported:
 * - @[Display Name](wallet_address) - Markdown-style mentions from UserTagging component
 * - Regular HTML content is preserved
 */
export function MentionRenderer({ content, className = '' }: MentionRendererProps) {
  // Pattern to match @[Display Name](wallet_address)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;

  // Split content into segments (text and mentions)
  const segments: Array<{ type: 'text' | 'mention'; content: string; name?: string; address?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Add mention
    segments.push({
      type: 'mention',
      content: match[0],
      name: match[1],
      address: match[2],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  // If no mentions found, render as HTML
  if (segments.length === 0 || segments.every(s => s.type === 'text')) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Render segments with mentions as UserProfileDisplay
  return (
    <div className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'mention' && segment.address) {
          return (
            <span key={index} style={{ display: 'inline-flex', alignItems: 'center', margin: '0 2px' }}>
              <UserProfileDisplay
                walletAddress={segment.address}
                size="sm"
                showModal={true}
              />
            </span>
          );
        }

        // For text segments, we need to parse HTML safely
        // Check if the text contains HTML tags
        if (segment.content.includes('<')) {
          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{ __html: segment.content }}
            />
          );
        }

        // Plain text
        return <span key={index}>{segment.content}</span>;
      })}
    </div>
  );
}
