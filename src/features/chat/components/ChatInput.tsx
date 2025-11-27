'use client';

import type React from 'react';
import { useRef, useState, useEffect, useMemo } from 'react';
import { supabase } from '@/utils/supabaseClient';
import UserTagging from '@/components/UserTagging';
import '@/features/chat/styles/Chat.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaperclip,
  faMicrophone,
  faSmile,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import EmojiPicker from 'emoji-picker-react';

interface Mention {
  id: string;
  name: string;
  address: string;
}

interface ChatInputProps {
  onSendMessage: (content: string, attachments?: string[], mentions?: Mention[]) => void;
  chatId?: string;
}

export default function ChatInput({ onSendMessage, chatId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasText = message.trim().length > 0;

  const contextUrl = useMemo(() => (chatId ? `/chat/${chatId}` : undefined), [chatId]);

  useEffect(() => {
    console.log('ChatInput received chatId:', chatId);
  }, [chatId]);

  // Check if current user is muted
  useEffect(() => {
    const checkMuteStatus = async () => {
      if (!chatId) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's wallet address
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('user_id', user.id)
        .single();

      if (!profile?.wallet_address) return;

      // Check if muted
      const { data: muteData } = await supabase
        .from('chat_muted_users')
        .select('id')
        .eq('chat_group_id', chatId)
        .eq('user_wallet', profile.wallet_address.toLowerCase())
        .maybeSingle();

      setIsMuted(!!muteData);
    };

    checkMuteStatus();

    // Realtime subscription to detect mute/unmute changes
    if (!chatId) return;

    console.log('🔄 [ChatInput] Setting up mute status subscription...');

    const subscription = supabase
      .channel(`mute-status-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT (mute) and DELETE (unmute)
          schema: 'public',
          table: 'chat_muted_users',
          filter: `chat_group_id=eq.${chatId}`
        },
        async (payload) => {
          console.log('🔔 [ChatInput] Mute status change detected:', payload);

          // Re-check mute status when changes occur
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('user_profiles')
            .select('wallet_address')
            .eq('user_id', user.id)
            .single();

          if (!profile?.wallet_address) return;

          const { data: muteData } = await supabase
            .from('chat_muted_users')
            .select('id')
            .eq('chat_group_id', chatId)
            .eq('user_wallet', profile.wallet_address.toLowerCase())
            .maybeSingle();

          const newMuteStatus = !!muteData;
          console.log('🔄 [ChatInput] Updated mute status:', newMuteStatus);
          setIsMuted(newMuteStatus);

          // Clear error message if unmuted
          if (!newMuteStatus && uploadError?.includes('muted')) {
            setUploadError(null);
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      console.log('🧹 [ChatInput] Cleaning up mute subscription');
      subscription.unsubscribe();
    };
  }, [chatId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent muted users from sending messages
    if (isMuted) {
      setUploadError('You are muted in this chat and cannot send messages.');
      return;
    }

    if (message.trim() || attachments.length > 0) {
      console.log('ChatInput: Sending message with mentions:', mentions);
      console.log('ChatInput: Message content:', message.trim());
      onSendMessage(message.trim(), attachments, mentions);
      setMessage('');
      setAttachments([]);
      setMentions([]);
      setUploadError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      // Prevent muted users from sending messages
      if (isMuted) {
        setUploadError('You are muted in this chat and cannot send messages.');
        return;
      }

      if (hasText || attachments.length > 0) {
        console.log('ChatInput: Enter key - sending message with mentions:', mentions);
        onSendMessage(message.trim(), attachments, mentions);
        setMessage('');
        setAttachments([]);
        setMentions([]);
        setUploadError(null);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const maxFileSize = 5 * 1024 * 1024; // 5MB
      const newUrls: string[] = [];

      for (const file of Array.from(files)) {
        if (file.size > maxFileSize) {
          setUploadError(`File "${file.name}" is too large. Maximum allowed size is 5MB.`);
          continue;
        }

        const filePath = `public/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadErr) {
          console.error('Upload error:', uploadErr);
          setUploadError(`Error uploading file "${file.name}". Please try again.`);
          continue;
        }

        const { data: publicUrlData, error: publicUrlErr } = await supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);

        if (publicUrlErr || !publicUrlData.publicUrl) {
          console.error('Public URL error:', publicUrlErr);
          setUploadError(`Error retrieving URL for file "${file.name}".`);
          continue;
        }

        newUrls.push(publicUrlData.publicUrl);
      }

      if (newUrls.length > 0) {
        setAttachments((prev) => [...prev, ...newUrls]);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleEmojiClick = (emoji: any) => {
    setMessage((prev) => prev + emoji.emoji);
    setShowEmojiPicker(false);
  };

  const handleVoiceToText = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice-to-text is not supported in this browser.');
      return;
    }
    // @ts-ignore
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setMessage((prev) => prev + ' ' + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      alert('Error in voice-to-text functionality.');
    };

    recognition.start();
  };

  const handleAttachmentClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <form onSubmit={handleSendMessage} className="chat-input-form">
      <div className="chat-input-wrapper">
        {/* Emoji Button */}
        <button
          type="button"
          className="icon emoji"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        >
          <FontAwesomeIcon icon={faSmile} />
        </button>

        {/* Input + Mentions */}
        <div className="chat-input-container">
          <UserTagging
            value={message}
            onChange={setMessage}
            placeholder="Type your message..."
            className="chat-mentions-input"
            onKeyDown={handleKeyDown}
            contextType="chat"
            contextId={chatId || 'general'}
            contextUrl={contextUrl}
            onMentionsChange={(mentions) => {
              setMentions(mentions);
              console.log('ChatInput: Mentions changed:', mentions);
              console.log('ChatInput: Current mentions state:', mentions);
            }}
          />
        </div>

        {/* Right Side Icons */}
        <div className="right-icons">
          {hasText ? (
            <button type="submit" className="icon send">
              <FontAwesomeIcon icon={faPaperPlane} />
            </button>
          ) : (
            <>
              <button type="button" className="icon paperclip" onClick={handleAttachmentClick}>
                <FontAwesomeIcon icon={faPaperclip} />
              </button>
              <button type="button" className="icon mic" onClick={handleVoiceToText}>
                <FontAwesomeIcon icon={faMicrophone} />
              </button>
            </>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden-file-input"
          multiple={true}
        />

        {showEmojiPicker && (
          <div className="emoji-picker-container">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
      </div>

      {uploadError && (
        <div className="upload-error" style={{ color: 'red', marginTop: '8px' }}>
          {uploadError}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attachments-list" style={{ marginTop: '10px' }}>
          {attachments.map((attachment, index) => (
            <div key={index} className="attachment">
              <a
                href={attachment}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-link"
              >
                {attachment.split('/').pop()}
              </a>
              <button
                type="button"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, i) => i !== index))
                }
                className="remove-attachment"
              >
                ✖
              </button>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
