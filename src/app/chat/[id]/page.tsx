// src/app/chat/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import ChatContainer from '@/features/chat/components/ChatContainer';
import '@/features/chat/styles/Chat.css';

export default function ChatGroupPage() {
  const { id } = useParams(); // "id" corresponds to the chat group id
  const chatGroupId = Array.isArray(id) ? id[0] : id;

  return (
    <div className="chat-shell">
      <ChatContainer chatGroupId={chatGroupId} />
    </div>
  );
}
