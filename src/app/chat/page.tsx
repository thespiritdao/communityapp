//src/app/chat/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ChatContainer from '@/features/chat/components/ChatContainer';

function ChatPageInner() {
  const searchParams = useSearchParams();
  const dm = searchParams.get('dm') || undefined;

  return (
    <div>
      <ChatContainer dmAddress={dm} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div />}>
      <ChatPageInner />
    </Suspense>
  );
}
