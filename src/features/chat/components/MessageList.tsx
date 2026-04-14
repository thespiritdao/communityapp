import { useRef, useEffect, useState } from 'react';
import type { Message, UserProfile } from '../types';
import '../styles/Chat.css';
import '../styles/ChatModeration.css';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import { ChatModerationMenu } from './ChatModerationMenu';
import { supabase } from '@/utils/supabaseClient';
import { Pin } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  loading: boolean;
  canModerate?: boolean; // 🆕 Does user have chatModeration permission?
  chatGroupId?: string; // 🆕 For moderation actions
}

const fetchProfilePictureUrl = async (
  walletAddress: string,
  users: UserProfile[],
) => {
  const user = users.find((user) => user.wallet_address === walletAddress);
  return user?.profile_picture?.startsWith('http')
    ? user.profile_picture
    : user?.profile_picture
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
      : '/images/symbolobinfin.png';
};

const markMessagesAsRead = async (receiver_wallet_id: string) => {
  const { data: session, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    console.error(
      'MessageList: Error getting session for mark as read:',
      sessionError,
    );
    return;
  }

  if (
    !session?.session ||
    !session.session.expires_at ||
    session.session.expires_at < Date.now() / 1000
  ) {
    console.warn('MessageList: Session expired, skipping mark as read');
    return;
  }

  const { error } = await supabase
    .from('chat_messages')
    .update({ is_read: true })
    .eq('receiver_wallet_id', receiver_wallet_id)
    .eq('is_read', false);

  if (error) {
    console.error(
      'MessageList: Error marking messages as read:',
      error.message,
    );
  }
};

// Utility to format message with mentions and hyperlinks
function formatMessageWithMentions(message: string): string {
  // First, replace @[Name](wallet) with <span class="mention">@Name</span>
  let formatted = message.replace(
    /@\[([^\]]+)\]\([^\)]+\)/g,
    '<span class="mention">@$1</span>',
  );

  // Then, convert URLs to clickable links with data attribute for confirmation
  // Match http:// or https:// URLs
  formatted = formatted.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" class="message-link" data-external-link="true" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return formatted;
}

export default function MessageList({
  messages,
  currentUser,
  users,
  canModerate = false,
  chatGroupId,
}: MessageListProps) {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [profilePictures, setProfilePictures] = useState<
    Record<string, string>
  >({});
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [linkConfirmModal, setLinkConfirmModal] = useState<{
    show: boolean;
    url: string;
  }>({ show: false, url: '' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (!messagesEndRef.current || messages.length === 0) return;
    const behavior = isInitialLoad.current ? 'instant' : 'smooth';
    isInitialLoad.current = false;
    messagesEndRef.current.scrollIntoView({ behavior });
    if (currentUser?.wallet_address) {
      markMessagesAsRead(currentUser.wallet_address);
    }
  }, [messages, currentUser?.wallet_address]);

  useEffect(() => {
    const fetchProfilePictures = async () => {
      const newProfilePictures: Record<string, string> = {};
      for (const message of messages) {
        if (!profilePictures[message.sender_wallet_id]) {
          newProfilePictures[message.sender_wallet_id] =
            await fetchProfilePictureUrl(message.sender_wallet_id, users);
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

  // Sync local messages with props
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // Handle external link clicks with confirmation modal
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' && target.getAttribute('data-external-link') === 'true') {
        e.preventDefault();
        const url = target.getAttribute('href');
        if (url) {
          setLinkConfirmModal({ show: true, url });
        }
      }
    };

    document.addEventListener('click', handleLinkClick);
    return () => document.removeEventListener('click', handleLinkClick);
  }, []);

  // Handle message deleted
  const handleMessageDeleted = (messageId: string) => {
    setLocalMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  // Handle message pinned/unpinned
  const handleMessagePinned = (messageId: string, isPinned: boolean) => {
    setLocalMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, is_pinned: isPinned } : m)),
    );
  };

  // Separate pinned and regular messages
  const pinnedMessages = localMessages.filter((m) => m.is_pinned);
  const regularMessages = localMessages.filter((m) => !m.is_pinned);

  // Helper function to render a message
  const renderMessage = (message: Message) => {
    const profilePicture =
      message.sender_profile_picture ||
      profilePictures[message.sender_wallet_id] ||
      '/images/symbolobinfin.png';
    const adjustedTimestamp = new Date(message.created_at).toLocaleString(
      'default',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    );

    return (
      <div
        key={message.id}
        className={`message ${
          message.sender_wallet_id === currentUser?.wallet_address
            ? 'message-outgoing'
            : 'message-incoming'
        } ${message.is_pinned ? 'message-pinned' : ''}`}
      >
        <img
          className="message-avatar"
          src={profilePicture}
          alt="Profile"
          onClick={() => handleProfileClick(message.sender_wallet_id)}
          style={{ cursor: 'pointer' }}
        />
        <div className="message-content">
          {message.is_pinned && (
            <div className="pinned-indicator">
              <Pin className="h-3 w-3" />
              <span>Pinned</span>
            </div>
          )}
          <div
            className="message-text"
            dangerouslySetInnerHTML={{
              __html: formatMessageWithMentions(message.content),
            }}
          ></div>

          {/* Moderation menu - only show if user has chatModeration permission */}
          {canModerate && chatGroupId && (
            <ChatModerationMenu
              message={message}
              chatGroupId={chatGroupId}
              onMessageDeleted={handleMessageDeleted}
              onMessagePinned={handleMessagePinned}
            />
          )}
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
              <span className="read-receipt">
                {message.is_read ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="message-list">
      {/* Pinned messages section - always at top */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-messages-section">
          {pinnedMessages.map((message) => renderMessage(message))}
          <div className="pinned-separator" />
        </div>
      )}

      {/* Regular messages section */}
      {regularMessages && regularMessages.length > 0
        ? regularMessages.map((message) => renderMessage(message))
        : !pinnedMessages.length && <div>No messages to display.</div>}

      <div ref={messagesEndRef} />

      {selectedUser && (
        <ProfileModal user={selectedUser} users={users} onClose={closeModal} />
      )}

      {/* External Link Confirmation Modal */}
      {linkConfirmModal.show && (
        <div className="modal-overlay" onClick={() => setLinkConfirmModal({ show: false, url: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Leave SpiritDAO?</h3>
            <p>You're about to visit an external link:</p>
            <p style={{ wordBreak: 'break-all', color: '#2F5D50', fontWeight: 'bold' }}>
              {linkConfirmModal.url}
            </p>
            <p style={{ fontSize: '14px', color: '#6B7280' }}>
              Please verify the URL before continuing.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  window.open(linkConfirmModal.url, '_blank', 'noopener,noreferrer');
                  setLinkConfirmModal({ show: false, url: '' });
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#2F5D50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
              <button
                onClick={() => setLinkConfirmModal({ show: false, url: '' })}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#E5E7EB',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
