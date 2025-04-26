// src/app/forum/create-thread/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { NewThreadForm } from 'src/features/forum/components/NewThreadForm';
import ForumContainer from 'src/features/forum/components/ForumContainer';
import styles from 'src/features/forum/styles/Forum.module.css';

export default function CreateThreadPage() {
  const searchParams = useSearchParams();
  // Optionally, pre-populate the form with a categoryId if provided via URL query string.
  const categoryId = searchParams.get('categoryId') || '';

  return (
    <ForumContainer>
      <NewThreadForm categoryId={categoryId} />
    </ForumContainer>
  );
}
