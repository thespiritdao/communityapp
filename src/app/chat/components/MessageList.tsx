import React, { useRef, useEffect, useState } from 'react';
import { Message, UserProfile } from '../types';
import '../styles/Chat.css';
import ProfileModal from 'src/identity/components/ProfileModal';
import { supabase } from 'src/lib/supabase';

interface MessageListProps {
  messages: Message[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  loading: boolean;
}

const getProfilePictureUrl = (walletAddress: string, users: UserProfile[]) => {
  const user = users.find((user) => user.wallet_address === walletAddress);
  return user?.profile_picture?.startsWith('http')
    ? user.profile_picture
    : user?.profile_picture
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
    : '/images/symbolobinfin.png';
};

const markMessagesAsRead = async (receiver_wallet_id: string) => {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_wallet_id', receiver_wallet_id)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking messages as read:', error.message);
  }
};

export default function MessageList({
  messages,
  currentUser,
  users,
}: MessageListProps) {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    console.log('Messages prop updated:', messages);
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    console.log('Local Messages:', localMessages);
    scrollToBottom();
    if (currentUser?.wallet_address) {
      markMessagesAsRead(currentUser.wallet_address);
    }
  }, [localMessages]);

  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('Real-time update:', payload);
          const updatedMessage = payload.new;
          setLocalMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      {localMessages && localMessages.length > 0 ? (
        localMessages.map((message) => {
          const profilePicture = getProfilePictureUrl(
            message.sender_wallet_id,
            users
          );

          const adjustedTimestamp = new Date(`${message.created_at}Z`).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
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
                  dangerouslySetInnerHTML={{ __html: message.content }}
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
