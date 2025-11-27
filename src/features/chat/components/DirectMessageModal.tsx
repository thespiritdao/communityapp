'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '@/lib/supabase';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { Send, X, Ban, Trash2 } from 'lucide-react';
import '../styles/Chat.css';

interface DirectMessageModalProps {
  recipientAddress: string;
  recipientName: string;
  recipientImage: string;
  onClose: () => void;
}

interface DirectMessage {
  id: string;
  sender_wallet_id: string;
  receiver_wallet_id: string;
  content: string;
  created_at: string;
  is_direct_message: boolean;
}

export function DirectMessageModal({
  recipientAddress,
  recipientName,
  recipientImage,
  onClose
}: DirectMessageModalProps) {
  const { address } = useAccount();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    // Save original overflow
    const originalOverflow = document.body.style.overflow;

    // Disable body scroll
    document.body.style.overflow = 'hidden';

    // Re-enable on unmount
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Load messages
  useEffect(() => {
    if (!address) return;

    // Normalize addresses to lowercase for comparison
    const normalizedAddress = address.toLowerCase();
    const normalizedRecipient = recipientAddress.toLowerCase();

    loadMessages();
    checkBlockedStatus();

    // Subscribe to new messages
    const subscription = supabase
      .channel(`dm_${normalizedAddress}_${normalizedRecipient}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `is_direct_message=eq.true`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as DirectMessage;
            // Normalize message addresses for comparison
            const msgSender = newMsg.sender_wallet_id?.toLowerCase();
            const msgReceiver = newMsg.receiver_wallet_id?.toLowerCase();

            // Only add if it's part of this conversation
            if (
              (msgSender === normalizedAddress && msgReceiver === normalizedRecipient) ||
              (msgSender === normalizedRecipient && msgReceiver === normalizedAddress)
            ) {
              setMessages(prev => [...prev, newMsg]);
            }
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [address, recipientAddress]);

  // Auto-scroll to bottom of messages container (not the page)
  useEffect(() => {
    if (messagesContainerRef.current) {
      // Scroll the messages container to bottom, not the page
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    if (!address) return;

    try {
      setIsLoading(true);

      // Normalize addresses to lowercase for comparison
      const normalizedAddress = address.toLowerCase();
      const normalizedRecipient = recipientAddress.toLowerCase();

      // Query direct messages without foreign key relationships
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('is_direct_message', true)
        .or(`and(sender_wallet_id.eq.${normalizedAddress},receiver_wallet_id.eq.${normalizedRecipient}),and(sender_wallet_id.eq.${normalizedRecipient},receiver_wallet_id.eq.${normalizedAddress})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
    } catch (error) {
      console.error('[DirectMessage] Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkBlockedStatus = async () => {
    if (!address) return;

    try {
      // Normalize addresses to lowercase for comparison
      const normalizedAddress = address.toLowerCase();
      const normalizedRecipient = recipientAddress.toLowerCase();

      const { data, error } = await supabase
        .from('dm_blocks')
        .select('*')
        .eq('blocker_id', normalizedRecipient)
        .eq('blocked_id', normalizedAddress)
        .maybeSingle(); // Use maybeSingle instead of single to handle no results gracefully

      setIsBlocked(!!data);
    } catch (error) {
      // No block found, that's fine
      setIsBlocked(false);
    }
  };

  const handleSendMessage = async () => {
    if (!address || !newMessage.trim() || isBlocked) return;

    try {
      setIsSending(true);

      // Normalize addresses to lowercase for storage
      const normalizedAddress = address.toLowerCase();
      const normalizedRecipient = recipientAddress.toLowerCase();

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          sender_wallet_id: normalizedAddress,
          receiver_wallet_id: normalizedRecipient,
          content: newMessage.trim(),
          is_direct_message: true,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      // Send notification to recipient
      try {
        await unifiedNotificationService.createNotification({
          recipient_address: normalizedRecipient,
          sender_address: normalizedAddress,
          notification_type: 'chat_message',
          title: 'New Direct Message',
          message: `You have a new message from ${recipientName}`,
          context_type: 'chat',
          context_id: normalizedAddress,
          context_url: `/chat/dm/${normalizedAddress}`,
          priority: 'high'
        });
      } catch (notificationError) {
        console.error('[DirectMessage] Failed to send notification:', notificationError);
        // Non-fatal - message was sent successfully
      }

      setNewMessage('');
    } catch (error) {
      console.error('[DirectMessage] Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!address) return;

    // Recipient can delete any message in the DM
    if (!confirm('Delete this message?')) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      console.error('[DirectMessage] Error deleting message:', error);
      alert('Failed to delete message');
    }
  };

  const handleBlockUser = async () => {
    if (!address) return;

    if (!confirm(`Block ${recipientName}? They will no longer be able to send you messages.`)) return;

    try {
      // Normalize addresses to lowercase for storage
      const normalizedAddress = address.toLowerCase();
      const normalizedRecipient = recipientAddress.toLowerCase();

      const { error } = await supabase
        .from('dm_blocks')
        .insert({
          blocker_id: normalizedAddress,
          blocked_id: normalizedRecipient,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      alert(`${recipientName} has been blocked`);
      onClose();
    } catch (error) {
      console.error('[DirectMessage] Error blocking user:', error);
      alert('Failed to block user');
    }
  };

  const isRecipient = address?.toLowerCase() === recipientAddress.toLowerCase();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dm-header">
          <div className="dm-header-info">
            <img src={recipientImage} alt={recipientName} className="dm-avatar" />
            <div>
              <h3>{recipientName}</h3>
            </div>
          </div>
          <button onClick={onClose} className="dm-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="dm-messages" ref={messagesContainerRef}>
          {isLoading ? (
            <div className="dm-loading">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="dm-empty">No messages yet. Say hello!</div>
          ) : (
            messages.map((msg) => {
              const isOwnMessage = msg.sender_wallet_id === address;
              return (
                <div
                  key={msg.id}
                  className={`dm-message ${isOwnMessage ? 'dm-message-own' : 'dm-message-other'}`}
                >
                  <div className="dm-message-content">
                    <p>{msg.content}</p>
                    <span className="dm-message-time">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {/* Delete button - recipient can delete any message */}
                  {isRecipient && !isOwnMessage && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="dm-delete-btn"
                      title="Delete message"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="dm-input-container">
          {isBlocked ? (
            <div className="dm-blocked-message">
              You have been blocked by this user and cannot send messages.
            </div>
          ) : (
            <>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Type a message..."
                className="dm-input"
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className="dm-send-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#555'
                }}
              >
                <Send size={18} />
              </button>
            </>
          )}
        </div>

        {/* Mod Actions (Recipient Only) */}
        {isRecipient && !isBlocked && (
          <div className="dm-mod-actions">
            <button onClick={handleBlockUser} className="dm-block-btn">
              <Ban size={14} />
              <span>Block User</span>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1001;
        }

        .dm-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .dm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid #eee;
        }

        .dm-header-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dm-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .dm-address {
          font-size: 0.75rem;
          color: #666;
        }

        .dm-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
        }

        .dm-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .dm-loading,
        .dm-empty {
          text-align: center;
          color: #999;
          padding: 40px;
        }

        .dm-message {
          display: flex;
          gap: 8px;
          max-width: 70%;
        }

        .dm-message-own {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .dm-message-other {
          align-self: flex-start;
        }

        .dm-message-content {
          background: #f0f0f0;
          padding: 10px 14px;
          border-radius: 12px;
          word-break: break-word;
        }

        .dm-message-own .dm-message-content {
          background: #2F5D50;
          color: white;
        }

        .dm-message-time {
          font-size: 0.7rem;
          opacity: 0.7;
          display: block;
          margin-top: 4px;
        }

        .dm-delete-btn {
          background: #fee;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #c33;
          opacity: 0.5;
        }

        .dm-delete-btn:hover {
          opacity: 1;
        }

        .dm-input-container {
          display: flex;
          gap: 8px;
          padding: 16px;
          border-top: 1px solid #eee;
        }

        .dm-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #ddd;
          border-radius: 20px;
          outline: none;
        }

        .dm-send-btn {
          background: #2F5D50;
          color: white;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .dm-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .dm-blocked-message {
          padding: 12px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 6px;
          text-align: center;
          color: #856404;
        }

        .dm-mod-actions {
          padding: 12px 16px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: center;
        }

        .dm-block-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #fff;
          border: 1px solid #dc3545;
          color: #dc3545;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }

        .dm-block-btn:hover {
          background: #dc3545;
          color: white;
        }
      `}</style>
    </div>
  );
}
