// src/app/forum/create-thread/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { NewThreadForm } from '@/features/forum/components/NewThreadForm';
import ForumContainer from '@/features/forum/components/ForumContainer';
import ForumAccessGate from '@/features/forum/components/ForumAccessGate';

export default function CreateThreadPage() {
  const searchParams = useSearchParams();
  // Optionally, pre-populate the form with a categoryId if provided via URL query string.
  const categoryId = searchParams.get('categoryId') || '';

  return (
    <ForumAccessGate
      categoryId={categoryId || undefined}
      requirePosting={true}
      fallbackMessage="You need chatAccess permission in your pod role to create threads."
    >
      <ForumContainer>
        <NewThreadForm categoryId={categoryId} />
      </ForumContainer>
    </ForumAccessGate>
  );
}
