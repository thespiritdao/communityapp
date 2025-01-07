// src/chat/ChatContainer.tsx
"use client";

import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { ChatDisplay } from "./ChatDisplay";
import { ChatInput } from "./ChatInput";
import { fetchMessages, sendMessage, reactToMessage, editMessage } from "./chatSlice";
import { RootState, AppDispatch } from "../redux/store";
import { selectMessages } from '../redux/store';


interface ChatContainerProps {
  communityId: string;
}

const messages = useSelector(selectMessages);

export const ChatContainer: React.FC<ChatContainerProps> = ({ communityId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const messages = useSelector((state: RootState) => state.chat.messages);
  console.log("Messages:", messages);
  const currentUser = useSelector((state: RootState) => state.user?.currentUser || { id: "1", name: "Guest" }); // Placeholder user

  useEffect(() => {
    dispatch(fetchMessages({ communityId }));
  }, [dispatch, communityId]);

const handleSendMessage = (content: string, attachments?: File[]) => {
  const senderWalletId = currentUser.walletId; // Replace with dynamic wallet ID
  dispatch(sendMessage({ content, attachments, communityId, senderWalletId }));
};


  const handleReact = (messageId: string, emoji: string) => {
    dispatch(reactToMessage({ messageId, emoji }));
  };

  const handleEdit = (messageId: string, newContent: string) => {
    dispatch(editMessage({ messageId, newContent }));
  };

  return (
    <div className="chat-container">
      <ChatDisplay
        messages={messages}
        currentUser={currentUser}
        onReact={handleReact}
        onEdit={handleEdit}
      />
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};
