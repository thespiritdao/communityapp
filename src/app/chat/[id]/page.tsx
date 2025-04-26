// src/app/chat/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import ChatContainer from 'src/features/chat/components/ChatContainer';
import 'src/features/chat/styles/Chat.css';

export default function ChatGroupPage() {
  const { id } = useParams(); // "id" corresponds to the chat group id
  return (
    <div className="h-screen">
      <ChatContainer chatGroupId={id || undefined} />
    </div>
  );
}
