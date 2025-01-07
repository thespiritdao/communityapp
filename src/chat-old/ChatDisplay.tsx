// src/chat/ChatDisplay.tsx

import React, { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatDisplayProps, ChatMessage as ChatMessageType } from './types';

export const ChatDisplay: React.FC<ChatDisplayProps> = ({
  messages,
  currentUser,
  onReact,
  onEdit,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chat-display">
      {messages.length === 0 ? (
        <p className="text-gray-500 text-center">How are you living our values?</p>
      ) : (
        messages.map((message: ChatMessageType) => (
          <ChatMessage
            key={message.id}
            message={message}
            currentUser={currentUser}
            onReact={onReact}
            onEdit={onEdit}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
