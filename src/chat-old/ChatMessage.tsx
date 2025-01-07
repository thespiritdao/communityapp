// src/chat/ChatMessage.tsx

import React, { useState } from 'react';
import { ChatMessageProps } from './types';
import { ChatEmoji } from './ChatEmoji';

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  currentUser,
  onReact,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const handleEdit = () => {
    if (isEditing) {
      onEdit(message.id, editedContent);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  const handleReact = (emoji: string) => {
    onReact(message.id, emoji);
  };

  const isCurrentUserMessage = message.sender.id === currentUser.id;

  return (
    <div className={`chat-message ${isCurrentUserMessage ? 'current-user' : ''}`}>
      <div className="message-content">
        <span className="sender">{message.sender.name}</span>
        {isEditing ? (
          <input
            type="text"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
          />
        ) : (
          <p>{message.content}</p>
        )}
        {message.attachments && message.attachments.map((attachment, index) => (
          <img key={index} src={attachment} alt="attachment" className="attachment" />
        ))}
        <span className="timestamp">{new Date(message.timestamp).toLocaleString()}</span>
      </div>
      <div className="message-actions">
        <ChatEmoji onSelectEmoji={handleReact} />
        {isCurrentUserMessage && (
          <button onClick={handleEdit}>{isEditing ? 'Save' : 'Edit'}</button>
        )}
      </div>
      <div className="reactions">
        {Object.entries(message.reactions || {}).map(([emoji, users]) => (
          <span key={emoji} className="reaction">
            {emoji} {users.length}
          </span>
        ))}
      </div>
    </div>
  );
};
