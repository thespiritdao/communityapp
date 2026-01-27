// src/features/knowledge/components/KnowledgeGrid.tsx
'use client';

import { Play, Clock, Eye, FileText, Book } from 'lucide-react';
import type { KnowledgeItem, KnowledgeCategory } from '../types';

interface KnowledgeGridProps {
  items: KnowledgeItem[];
  categories: KnowledgeCategory[];
  onItemClick: (item: KnowledgeItem) => void;
}

export const KnowledgeGrid: React.FC<KnowledgeGridProps> = ({
  items,
  categories,
  onItemClick,
}) => {
  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : 'Uncategorized';
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getContentIcon = (contentType: string) => {
    switch (contentType) {
      case 'video':
        return <Play size={24} style={{ color: '#2F5D50', marginLeft: '4px' }} />;
      case 'document':
        return <FileText size={24} style={{ color: '#2F5D50' }} />;
      case 'markdown':
        return <Book size={24} style={{ color: '#2F5D50' }} />;
      default:
        return <FileText size={24} style={{ color: '#2F5D50' }} />;
    }
  };

  const getContentBackground = (item: KnowledgeItem) => {
    if (item.thumbnail_url) {
      return item.thumbnail_url;
    }
    // Different gradients for different content types
    switch (item.content_type) {
      case 'video':
        return null;
      case 'document':
        return null;
      case 'link':
        return null;
      case 'markdown':
        return null;
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '24px',
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onItemClick(item)}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '12px',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(47, 93, 80, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {/* Thumbnail */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingTop: '56.25%', // 16:9 aspect ratio
              backgroundColor: '#2F5D50',
              backgroundImage: getContentBackground(item)
                ? `url(${getContentBackground(item)})`
                : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Content type icon overlay */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              {getContentIcon(item.content_type)}
            </div>

            {/* Duration badge - only for videos */}
            {item.content_type === 'video' && item.duration_seconds && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={12} />
                {formatDuration(item.duration_seconds)}
              </div>
            )}

            {/* Content type badge */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              {item.content_type}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '16px' }}>
            {/* Category badge */}
            <div
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: '#E8F1EE',
                color: '#2F5D50',
                fontSize: '12px',
                fontWeight: '500',
                marginBottom: '8px',
              }}
            >
              {getCategoryName(item.category_id)}
            </div>

            {/* Title */}
            <h3
              style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#2F2F2F',
                marginBottom: '8px',
                lineHeight: '1.4',
              }}
            >
              {item.title}
            </h3>

            {/* Description */}
            {item.description && (
              <p
                style={{
                  fontSize: '14px',
                  color: '#5F5A54',
                  lineHeight: '1.5',
                  marginBottom: '12px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.description}
              </p>
            )}

            {/* View count */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: '#8F8A84',
                fontSize: '13px',
              }}
            >
              <Eye size={14} />
              {item.view_count} {item.view_count === 1 ? 'view' : 'views'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
