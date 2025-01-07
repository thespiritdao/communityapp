// app/chat/49cc7a25-0b10-48d0-b355-1df90d91083e/page.tsx
import { useRouter } from 'next/router';
import { ChatContainer } from '@/chat/ChatContainer';

const ChatPage = () => {
  const { query } = useRouter();
  const communityId = query.communityId as string;

  return (
    <div className="chat-page">
      <h1>Community Chat</h1>
      <ChatContainer communityId={communityId} />
    </div>
  );
};

export ChatPage;
