// src/features/chat/components/MessageList.tsx

import React, { useRef, useEffect, useState } from 'react';
import { Message, UserProfile } from '../types';
import '../styles/Chat.css';
import ProfileModal from 'src/features/identity/components/ProfileModal';
import { supabase } from 'src/utils/supabaseClient';

interface MessageListProps {
  messages: Message[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  loading: boolean;
}

const fetchProfilePictureUrl = async (walletAddress: string, users: UserProfile[]) => {
  const user = users.find((user) => user.wallet_address === walletAddress);
  return user?.profile_picture?.startsWith('http')
    ? user.profile_picture
    : user?.profile_picture
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
    : '/images/symbolobinfin.png';
};

const markMessagesAsRead = async (receiver_wallet_id: string) => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session || session.session.expires_at < Date.now() / 1000) {
    await supabase.auth.refreshSession();
  }

  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_wallet_id', receiver_wallet_id)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking messages as read:', error.message);
  }
};

// Utility to format message with mentions
function formatMessageWithMentions(message: string): string {
  // Replace @[Name](wallet) with <span class="mention">@Name</span>
  return message.replace(/@\[([^\]]+)\]\([^\)]+\)/g, '<span class="mention">@$1</span>');
}

export default function MessageList({
  messages,
  currentUser,
  users,
}: MessageListProps) {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [profilePictures, setProfilePictures] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
    if (currentUser?.wallet_address) {
      markMessagesAsRead(currentUser.wallet_address);
    }
  }, [messages, currentUser?.wallet_address]);

  useEffect(() => {
    const fetchProfilePictures = async () => {
      const newProfilePictures: Record<string, string> = {};
      for (const message of messages) {
        if (!profilePictures[message.sender_wallet_id]) {
          newProfilePictures[message.sender_wallet_id] = await fetchProfilePictureUrl(
            message.sender_wallet_id,
            users
          );
        }
      }
      setProfilePictures((prev) => ({ ...prev, ...newProfilePictures }));
    };

    fetchProfilePictures();
  }, [messages, users]);

  const handleProfileClick = (walletAddress: string) => {
    const user = users.find((user) => user.wallet_address === walletAddress);
    if (user) {
      setSelectedUser(user);
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
  };

  return (
    <div className="message-list">
      {messages && messages.length > 0 ? (
        messages.map((message) => {
		  const profilePicture =
			  message.sender_profile_picture ||
			  profilePictures[message.sender_wallet_id] ||
			  '/images/symbolobinfin.png';
			  const adjustedTimestamp = new Date(message.created_at).toLocaleString('default', {
				  year: 'numeric',
				  month: '2-digit',
				  day: '2-digit',
				  hour: '2-digit',
				  minute: '2-digit'
				});
			  
          return (
            <div
              key={message.id}
              className={`message ${
                message.sender_wallet_id === currentUser?.wallet_address
                  ? 'message-outgoing'
                  : 'message-incoming'
              }`}
            >
              <img
                className="message-avatar"
                src={profilePicture}
                alt="Profile"
                onClick={() => handleProfileClick(message.sender_wallet_id)}
                style={{ cursor: 'pointer' }}
              />
              <div className="message-content">
                <div
                  className="message-text"
                  dangerouslySetInnerHTML={{ __html: formatMessageWithMentions(message.content) }}
                ></div>
                {message.attachments && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment, index) => (
                      <a
                        key={index}
                        href={attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={attachment}
                          alt={`Attachment ${index + 1}`}
                          className="attachment-thumbnail"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div className="message-timestamp-container">
                  <span className="message-timestamp">{adjustedTimestamp}</span>
                  {message.sender_wallet_id === currentUser?.wallet_address && (
                    <span className="read-receipt">{message.is_read ? '✓✓' : '✓'}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div>No messages to display.</div>
      )}
      <div ref={messagesEndRef} />
      {selectedUser && (
        <ProfileModal user={selectedUser} users={users} onClose={closeModal} />
      )}
    </div>
  );
}
