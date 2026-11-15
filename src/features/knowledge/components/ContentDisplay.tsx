// src/features/knowledge/components/ContentDisplay.tsx
'use client';

import { VideoPlayer } from './VideoPlayer';
import type { KnowledgeItem } from '../types';
import { sanitizeHtml, safeHref } from '@/lib/sanitizeHtml';

interface ContentDisplayProps {
  item: KnowledgeItem;
  onProgressUpdate?: (progressSeconds: number, completed: boolean) => void;
  loadSavedProgress?: () => Promise<number>;
}

export const ContentDisplay: React.FC<ContentDisplayProps> = ({
  item,
  onProgressUpdate,
  loadSavedProgress,
}) => {
  switch (item.content_type) {
    case 'video':
      if (!onProgressUpdate || !loadSavedProgress) {
        return (
          <div style={{ padding: '24px', textAlign: 'center', color: '#8F8A84' }}>
            Video player configuration error
          </div>
        );
      }
      return (
        <VideoPlayer
          item={item}
          onProgressUpdate={onProgressUpdate}
          loadSavedProgress={loadSavedProgress}
        />
      );

    case 'markdown':
    case 'document':
      return (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '12px',
            padding: '32px',
          }}
        >
          {item.content_text ? (
            <div
              style={{
                fontSize: '15px',
                color: '#2F2F2F',
                lineHeight: '1.8',
                maxWidth: '800px',
                margin: '0 auto',
              }}
            >
              {item.content_type === 'markdown' ? (
                <div
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content_text) }}
                  style={{
                    whiteSpace: 'pre-wrap',
                  }}
                />
              ) : (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'inherit',
                  }}
                >
                  {item.content_text}
                </pre>
              )}
            </div>
          ) : safeHref(item.content_url) ? (
            <div style={{ textAlign: 'center' }}>
              <p
                style={{
                  fontSize: '15px',
                  color: '#5F5A54',
                  marginBottom: '16px',
                }}
              >
                This document is available for download:
              </p>
              <a
                href={safeHref(item.content_url)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  backgroundColor: '#2F5D50',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: '15px',
                  fontWeight: '500',
                }}
              >
                Download Document
              </a>
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#8F8A84' }}>
              No content available
            </p>
          )}
        </div>
      );

    default:
      return (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#8F8A84', fontSize: '15px' }}>
            Content type not supported: {item.content_type}
          </p>
        </div>
      );
  }
};
