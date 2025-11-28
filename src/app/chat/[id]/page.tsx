// src/app/chat/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import ChatContainer from '@/features/chat/components/ChatContainer';
import '@/features/chat/styles/Chat.css';

export default function ChatGroupPage() {
  const params = useParams();
  const id = params.id;
  const chatGroupId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;

  return (
    <div className="chat-shell">
      <ChatContainer chatGroupId={chatGroupId} />
    </div>
  );
}
