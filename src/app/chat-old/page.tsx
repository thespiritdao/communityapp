// src/app/chat/page.tsx

"use client"; // Required for client-side components

import React from "react";
import { ChatContainer } from "src/chat/ChatContainer"; // Adjusted path for consistency

const ChatPage: React.FC = () => {
  const generalCommunityId = "general"; // Static ID for general chat

  return <ChatContainer communityId={generalCommunityId} />;
};

export default ChatPage; // Default export
