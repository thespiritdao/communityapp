// src/chat/ChatInput.tsx

import React, { useState } from 'react';
import { ChatInputProps } from './types';
import { ChatEmoji } from './ChatEmoji';
import { ChatAttachment } from './ChatAttachment';

export const ChatInput: React.FC<ChatInputProps & { communityId?: string }> = ({
  onSendMessage,
  communityId,
}) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() || attachments.length > 0) {
      onSendMessage(message, attachments, communityId);
      setMessage('');
      setAttachments([]); // Clear attachments after sending
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prevMessage) => prevMessage + emoji);
  };

  const handleFileSelect = (files: File[]) => {
    // Add files only if they are not already present
    setAttachments((prevAttachments) => {
      const existingNames = new Set(prevAttachments.map((file) => file.name));
      const newFiles = files.filter((file) => !existingNames.has(file.name));
      return [...prevAttachments, ...newFiles];
    });
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input">
      {/* File Attachments */}
      <ChatAttachment onFileSelect={handleFileSelect} />
      {attachments.length > 0 && (
        <div className="chat-attachments-preview">
          {attachments.map((file, index) => (
            <span key={index} className="chat-attachment-item">
              {file.name}
            </span>
          ))}
        </div>
      )}

      {/* Message Input */}
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        aria-label="Message input"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); // Prevent unintended form submission
            handleSubmit(e);
          }
        }}
        className="rounded-full border border-gray-300 p-2 shadow-sm focus:outline-none focus:ring focus:border-blue-300 flex-1"
      />

      {/* Emoji Picker */}
      <ChatEmoji onSelectEmoji={handleEmojiSelect} />

      {/* Send Button */}
      <button
        type="submit"
        aria-label="Send message"
        className="bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600"
      >
        Send
      </button>
    </form>
  );
};

export default ChatInput;
