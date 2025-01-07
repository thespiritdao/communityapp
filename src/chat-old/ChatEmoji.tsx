// src/chat/ChatEmoji.tsx

import React, { useState } from 'react';
import { ChatEmojiProps } from './types';

const EMOJI_LIST = [
  { shortcode: ':smile:', display: '😊' },
  { shortcode: ':heart:', display: '❤️' },
  { shortcode: ':thumbsup:', display: '👍' },
];

export const ChatEmoji: React.FC<ChatEmojiProps> = ({ onSelectEmoji }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleEmojiClick = (shortcode: string) => {
    onSelectEmoji(shortcode);
    setShowEmojiPicker(false);
  };

  return (
    <div className="chat-emoji">
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        aria-label="Toggle emoji picker"
      >
        😀
      </button>
      {showEmojiPicker && (
        <div className="emoji-picker" role="menu">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji.shortcode}
              onClick={() => handleEmojiClick(emoji.shortcode)}
              aria-label={`Emoji ${emoji.shortcode}`}
            >
              {emoji.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

