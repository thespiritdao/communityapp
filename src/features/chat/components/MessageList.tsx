import { useRef, useEffect, useState } from 'react';
import type { Message, UserProfile } from '../types';
import '../styles/Chat.css';
import '../styles/ChatModeration.css';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import { ChatModerationMenu } from './ChatModerationMenu';
import { supabase } from '@/utils/supabaseClient';
import { Pin, MessageSquare } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { AuthorAvatar, AuthorLine, displayNameOf } from '@/components/community';

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
  // Empty string = no picture; AuthorAvatar then shows the member's initial.
  return user?.profile_picture?.startsWith('http')
    ? user.profile_picture
    : user?.profile_picture
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
      : '';
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


function getDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderDayDivider(label: string) {
  return (
    <div key={`divider-${label}`} style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
      <span style={{
        backgroundColor: 'var(--cs-cream)',
        color: 'var(--cs-brown)',
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '4px 14px',
        borderRadius: '9999px',
        border: '1px solid var(--cs-tan)',
      }}>
        {label}
      </span>
    </div>
  );
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
    if (messages.length === 0) return;
    const isFirst = isInitialLoad.current;
    if (isFirst) isInitialLoad.current = false;
    requestAnimationFrame(() => {
      const scrollContainer = messagesEndRef.current?.closest('.chat-main') as HTMLElement | null;
      if (!scrollContainer) return;
      scrollContainer.style.scrollBehavior = 'auto';
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      if (!isFirst) scrollContainer.style.scrollBehavior = '';
    });
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
      null;
    const isOwn = message.sender_wallet_id === currentUser?.wallet_address;
    const sender = users.find((u) => u.wallet_address === message.sender_wallet_id);
    const senderName = isOwn ? 'You' : displayNameOf(sender, message.sender_wallet_id);

    return (
      <div
        key={message.id}
        className={`message ${isOwn ? 'message-outgoing' : 'message-incoming'} ${
          message.is_pinned ? 'message-pinned' : ''
        }`}
      >
        <AuthorAvatar
          className="message-avatar"
          name={isOwn ? displayNameOf(currentUser, message.sender_wallet_id) : senderName}
          src={profilePicture}
          size={36}
          onClick={() => handleProfileClick(message.sender_wallet_id)}
        />
        <div className="message-content">
          {message.is_pinned && (
            <div className="pinned-indicator">
              <Pin className="h-3 w-3" />
              <span>Pinned</span>
            </div>
          )}
          <AuthorLine
            className="message-author"
            name={senderName}
            timestamp={message.created_at}
            timeFormat="clock"
            avatarSize={0}
            compact
            onAuthorClick={isOwn ? undefined : () => handleProfileClick(message.sender_wallet_id)}
          />
          <div className="message-text">
            <MarkdownContent content={message.content} className="chat-markdown" />
          </div>

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
          {isOwn && (
            <div className="message-timestamp-container">
              <span className="read-receipt" title={message.is_read ? 'Read' : 'Sent'}>
                {message.is_read ? '✓✓' : '✓'}
              </span>
            </div>
          )}
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

      {/* Regular messages section with day dividers */}
      {regularMessages && regularMessages.length > 0
        ? (() => {
            const elements: React.ReactNode[] = [];
            let lastDateStr = '';
            for (const message of regularMessages) {
              const msgDate = new Date(message.created_at);
              const dateStr = msgDate.toDateString();
              if (dateStr !== lastDateStr) {
                elements.push(renderDayDivider(getDateLabel(msgDate)));
                lastDateStr = dateStr;
              }
              elements.push(renderMessage(message));
            }
            return elements;
          })()
        : !pinnedMessages.length && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <MessageSquare size={48} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.4, color: 'var(--cs-muted)' }} />
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--cs-brown)', margin: '0 0 0.5rem' }}>No messages yet</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--cs-meta)', margin: 0 }}>Start the conversation!</p>
            </div>
          )}

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
