import React, { useRef } from 'react';
import { ChatAttachmentProps } from './types';

export const ChatAttachment: React.FC<ChatAttachmentProps> = ({ onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      onFileSelect(Array.from(files));
    }
    // Reset file input to prevent duplicate triggering
    event.target.value = '';
  };

  return (
    <div className="chat-attachment">
      <button
        type="button"
        onClick={handleClick}
        className="bg-gray-300 px-2 py-1 rounded hover:bg-gray-400"
      >
        📎 Attach
      </button>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        multiple
      />
    </div>
  );
};

export default ChatAttachment;
