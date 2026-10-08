// src/features/forum/components/CategoryList.tsx
'use client';

import type React from 'react';
import { MessageSquare } from 'lucide-react';
import {
  ListCard,
  ListGrid,
  listCardFooterItemClass,
  communityStyles,
} from '@/components/community';

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
  if (categories.length === 0) {
    return (
      <div className={communityStyles.empty}>
        <MessageSquare size={48} className={communityStyles.emptyIcon} />
        <p className={communityStyles.emptyTitle}>No categories yet</p>
        <p className={communityStyles.emptyText}>Categories appear here when your pods open a forum.</p>
      </div>
    );
  }

  return (
    <ListGrid>
      {categories.map((category) => (
        <ListCard
          key={category.id}
          href={`/forum/category/${category.id}`}
          title={category.name}
          description={category.description}
          icon={<MessageSquare size={18} />}
          badge={category.pod_name}
          footer={
            <span className={listCardFooterItemClass}>
              <MessageSquare size={12} />
              {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
            </span>
          }
        />
      ))}
    </ListGrid>
  );
};

export default CategoryList;
