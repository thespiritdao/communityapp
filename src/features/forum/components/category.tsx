// src/features/forum/category.tsx
import React from 'react';
import Link from 'next/link';
import CategoryList from 'src/app/features/forum/components/CategoryList';
import styles from '../styles/Forum.module.css';

const ForumCategoriesPage: React.FC = () => {
  return (
    <div className={styles.forumPageContainer}>
      <header className={styles.header}>
        <nav className={styles.breadcrumbs}>
          <Link href="/">Home</Link> &gt; <Link href="/forum">Forum</Link> &gt; Categories
        </nav>
        <h1 className={styles.pageTitle}>Forum Categories</h1>
      </header>
      
      <main className={styles.mainContent}>
        <CategoryList />
      </main>
    </div>
  );
};

export default ForumCategoriesPage;
