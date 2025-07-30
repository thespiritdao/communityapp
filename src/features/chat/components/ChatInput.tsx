import React, { useRef, useState, useEffect } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import UserTagging from 'src/components/UserTagging';
import '../styles/Chat.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaperclip,
  faMicrophone,
  faSmile,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import EmojiPicker from 'emoji-picker-react';

interface ChatInputProps {
  onSendMessage: (content: string, attachments?: string[]) => void;
  chatId?: string;
}

export default function ChatInput({ onSendMessage, chatId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasText = message.trim().length > 0;

  // Debug logging for chatId
  useEffect(() => {
    console.log('ChatInput received chatId:', chatId);
  }, [chatId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow sending if there is text or attachments
    if (message.trim() || attachments.length > 0) {
      onSendMessage(message.trim(), attachments);
      setMessage('');
      setAttachments([]);
      setUploadError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasText || attachments.length > 0) {
        onSendMessage(message.trim(), attachments);
        setMessage('');
        setAttachments([]);
        setUploadError(null);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear any previous error message
    setUploadError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      // Set the limit to 5 MB (adjust as needed)
      const maxFileSize = 5 * 1024 * 1024; // 5 MB in bytes
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        // Check file size before uploading
        if (file.size > maxFileSize) {
          setUploadError(`File "${file.name}" is too large. Maximum allowed size is 5MB.`);
          continue;
        }
        const filePath = `public/${Date.now()}-${file.name}`;
        // Upload the file
        const { error: uploadErr } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);
        if (uploadErr) {
          console.error('Upload error:', uploadErr);
          setUploadError(`Error uploading file "${file.name}". Please try again.`);
          continue;
        }
        // Get the permanent public URL using getPublicUrl
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
      // Append only valid URLs to attachments
      if (newUrls.length > 0) {
        setAttachments((prev) => [...prev, ...newUrls]);
      }
      // Clear the file input so the same file can be uploaded again if needed
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
        {/* Left icon (emoji) */}
        <span className="icon emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
          <FontAwesomeIcon icon={faSmile} />
        </span>

        {/* Middle container for the mention input */}
        <div className="chat-input-container">
          <UserTagging
            value={message}
            onChange={setMessage}
            placeholder="Type your message..."
            className="chat-mentions-input"
            onKeyDown={handleKeyDown}
            contextType="chat"
            contextId={chatId || 'general'}
            contextUrl={chatId ? `/chat/${chatId}` : undefined}
            onMentionsChange={(mentions) => {
              console.log('ChatInput: Mentions changed:', mentions);
              console.log('ChatInput: Context info:', {
                chatId,
                contextType: 'chat',
                contextUrl: chatId ? `/chat/${chatId}` : undefined
              });
            }}
          />
        </div>

        {/* Right icons: either send or paperclip + mic */}
        <div className="right-icons">
          {hasText ? (
            <button type="submit" className="icon send">
              <FontAwesomeIcon icon={faPaperPlane} />
            </button>
          ) : (
            <>
              <span className="icon paperclip" onClick={handleAttachmentClick}>
                <FontAwesomeIcon icon={faPaperclip} />
              </span>
              <span className="icon mic" onClick={handleVoiceToText}>
                <FontAwesomeIcon icon={faMicrophone} />
              </span>
            </>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden-file-input"
          multiple
        />

        {showEmojiPicker && (
          <div className="emoji-picker-container">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
      </div>

      {/* Display upload error if any */}
      {uploadError && (
        <div className="upload-error" style={{ color: 'red', marginTop: '8px' }}>
          {uploadError}
        </div>
      )}

      {/* Render attachments list below the input */}
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
