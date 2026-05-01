// src/features/forum/components/MentionRenderer.tsx
'use client';

import React from 'react';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import { MarkdownContent } from '@/components/MarkdownContent';

interface MentionRendererProps {
  content: string;
  className?: string;
}

/**
 * Detect whether content is markdown (from templates / AI agents) vs HTML (from Tiptap editor).
 * Tiptap always wraps text in HTML tags like <p>, <h2>, <ul>, etc.
 * Markdown content uses #, **, ---, - , > , ``` etc.
 */
function looksLikeMarkdown(text: string): boolean {
  // If the content starts with an HTML tag, it's likely from Tiptap
  if (/^\s*<[a-z][\s>]/i.test(text)) return false;

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headings: # ## ###
    /\*\*[^*]+\*\*/,        // Bold: **text**
    /^---\s*$/m,            // Horizontal rules
    /^[-*+]\s/m,            // Unordered lists
    /^\d+\.\s/m,            // Ordered lists
    /^>\s/m,                // Blockquotes
    /```/,                  // Code blocks
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}

/**
 * Parses content with @[Name](address) mentions and renders them as interactive UserProfileDisplay components.
 *
 * Formats supported:
 * - @[Display Name](wallet_address) - Markdown-style mentions from UserTagging component
 * - Regular HTML content is preserved (from Tiptap editor)
 * - Markdown content is rendered via MarkdownContent (from templates / AI agents)
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

  // If no mentions found, render based on content type
  if (segments.length === 0 || segments.every(s => s.type === 'text')) {
    if (looksLikeMarkdown(content)) {
      return <MarkdownContent content={content} className={className} />;
    }
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

        // For text segments, check content type
        if (looksLikeMarkdown(segment.content)) {
          return (
            <span key={index}>
              <MarkdownContent content={segment.content} />
            </span>
          );
        }

        // HTML content (from Tiptap)
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
