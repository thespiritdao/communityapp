// src/chat/types.ts

import { User } from '../types'; // Assuming there's a User type defined in the project

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: Date;
  attachments?: string[]; // Array of attachment URLs
  reactions?: {
    [emoji: string]: string[]; // Emoji to array of user IDs who reacted
  };
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
}

export interface ChatDisplayProps {
  messages: ChatMessage[];
  currentUser: User;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, newContent: string) => void;
}

export interface ChatMessageProps {
  message: ChatMessage;
  currentUser: User;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, newContent: string) => void;
}

export interface ChatEmojiProps {
  onSelectEmoji: (emoji: string) => void;
}

export interface ChatAttachmentProps {
  onFileSelect: (files: File[]) => void;
}

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: Date;
  communityId?: string; // Optional for micro-communities
  ...
}
