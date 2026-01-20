// src/app/features/forum/components/CategoryList.tsx
import type React from 'react';
import Link from 'next/link';
import styles from '../styles/Forum.module.css';
import { Badge } from '@/components/ui/badge';

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
    <div className={styles.categoryListContainer}>
      <div className={styles.categoryHeader}>
        <h3 className={styles.sectionTitle}>Forum Categories</h3>
      </div>

      {categories.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No categories found.</p>
        </div>
      ) : (
        <ul className={styles.categoryList}>
          {categories.map((category) => (
            <li key={category.id} className={styles.categoryItem}>
              <Link
                href={`/forum/category/${category.id}`}
                className={styles.categoryLink}
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h4 className={styles.categoryTitle} style={{ fontSize: '0.95rem', margin: 0 }}>
                    {category.name}
                  </h4>
                  {category.pod_name && (
                    <Badge
                      variant="secondary"
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        backgroundColor: '#E8F1EE',
                        color: '#2F5D50',
                        border: '1px solid #B8D9CA',
                      }}
                    >
                      {category.pod_name}
                    </Badge>
                  )}
                </div>
                {category.description && (
                  <p
                    className={styles.categoryDescription}
                    style={{
                      fontSize: '0.8rem',
                      margin: 0,
                      lineHeight: '1.3',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {category.description}
                  </p>
                )}
                <span
                  className={styles.categoryThreadCount}
                  style={{ fontSize: '0.75rem', opacity: 0.7 }}
                >
                  {category.thread_count}{' '}
                  {category.thread_count === 1 ? 'Thread' : 'Threads'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CategoryList;
