// src/features/forum/components/CategoryList.tsx
'use client';

import type React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Clock } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string | null;
  thread_count: number;
  pod_id?: string | null;
  pod_name?: string | null;
}

interface CategoryListProps {
  categories?: Category[];
}

const CategoryList: React.FC<CategoryListProps> = ({ categories = [] }) => {
  return (
    <div>
      {categories.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2rem', borderRadius: '0.5rem',
          backgroundColor: 'rgba(0,0,0,0.05)', color: '#757575',
        }}>
          <p>No categories found.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/forum/category/${category.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(209,196,169,0.4)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.2s, transform 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLElement).style.transform = 'none';
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '10px',
                  backgroundColor: '#E8F1EE', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <MessageSquare size={18} style={{ color: '#2F5D50' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: '#212121' }}>
                    {category.name}
                  </h4>
                </div>
                {category.pod_name && (
                  <Badge variant="secondary" style={{
                    fontSize: '0.65rem', padding: '1px 7px',
                    backgroundColor: '#E8F1EE', color: '#2F5D50',
                    border: '1px solid #B8D9CA', flexShrink: 0,
                  }}>
                    {category.pod_name}
                  </Badge>
                )}
              </div>

              {/* Description */}
              {category.description && (
                <p style={{
                  fontSize: '0.8rem', margin: '0 0 8px 0', color: '#616161',
                  lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                }}>
                  {category.description}
                </p>
              )}

              {/* Footer */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                marginTop: 'auto', paddingTop: 8,
                borderTop: '1px solid rgba(209,196,169,0.2)',
                fontSize: '0.75rem', color: '#757575',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MessageSquare size={12} />
                  {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryList;
