// src/app/features/forum/components/CategoryList.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import Link from 'next/link';
import { useTokenGate } from 'src/features/forum/hooks/useTokenGate';
import styles from '../styles/Forum.module.css';

interface Category {
  id: string;
  name: string;
  description: string | null;
  thread_count: number;
}

interface CategoryListProps {
  categories: Category[];
}

const CategoryList: React.FC<CategoryListProps> = ({ categories }) => {
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
              <Link href={`/forum/category/${category.id}`} className={styles.categoryLink}>
                <h4 className={styles.categoryTitle}>{category.name}</h4>
                <p className={styles.categoryDescription}>{category.description}</p>
                <span className={styles.categoryThreadCount}>
                  {category.thread_count} {category.thread_count === 1 ? 'Thread' : 'Threads'}
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