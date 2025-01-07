// src/app/chat/49cc7a25-0b10-48d0-b355-1df90d91083e/page.tsx

import { useRouter } from 'next/router';
import { ChatContainer } from 'src/chat/ChatContainer';

export const CommunityChatPage = () => {
  const router = useRouter();
  const { communityId } = router.query; // Dynamic route parameter

  if (!communityId || Array.isArray(communityId)) {
    return <div>Invalid community ID</div>;
  }

  return <ChatContainer communityId={communityId} />;
};


