import React from 'react';
import { Message, UserProfile } from '../types';

interface MessageListProps {
  messages: Message[];
  users: UserProfile[];
  currentUser: UserProfile;
  loading: boolean;
}

export default function MessageList({ messages, users, currentUser, loading }: MessageListProps) {
  if (loading) {
    return <div className="flex justify-center items-center h-full">Loading messages...</div>;
  }

  const getUserName = (wallet_address: string) => {
    const user = users.find(u => u.wallet_address === wallet_address);
    return user ? `${user.first_name} ${user.last_name}` : 'Unknown User';
  };

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isCurrentUser = message.sender_wallet_id === currentUser.wallet_address;
        return (
          <div
            key={message.id}
            className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] p-3 rounded-lg ${
                isCurrentUser ? 'bg-blue-500 text-white' : 'bg-gray-200'
              }`}
            >
              <div className="text-sm font-semibold mb-1">
                {getUserName(message.sender_wallet_id)}
              </div>
              <div>{message.content}</div>
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2">
                  {message.attachments.map((attachment, index) => (
                    <div key={index} className="text-sm text-blue-200 underline">
                      📎 Attachment {index + 1}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs mt-1 opacity-70">
                {new Date(message.created_at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}