// src/app/chat-new/components/ChatInput.tsx

import React, { useRef, useState } from 'react';
import { supabase } from 'src/lib/supabase';
import '../styles/Chat.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faMicrophone, faPaperPlane, faSmile } from '@fortawesome/free-solid-svg-icons';
import EmojiPicker from 'emoji-picker-react';

interface ChatInputProps {
  onSendMessage: (content: string, attachments?: string[]) => void;
}

export default function ChatInput({ onSendMessage }: ChatInputProps) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const messageContent = inputRef.current?.innerHTML.trim();
    if (messageContent || attachments.length > 0) {
      onSendMessage(messageContent || '', attachments);
      if (inputRef.current) inputRef.current.innerHTML = ''; // Clear input
      setAttachments([]); // Clear attachments
    }
  };

  const handleBold = () => {
    document.execCommand('bold', false);
  };

  const handleItalic = () => {
    document.execCommand('italic', false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevent new line
    const messageContent = inputRef.current?.innerHTML.trim();
    if (messageContent || attachments.length > 0) {
      onSendMessage(messageContent || '', attachments);
      if (inputRef.current) inputRef.current.innerHTML = ''; // Clear input
      setAttachments([]); // Clear attachments
    }
  }
};

	  const handleVoiceToText = () => {
		if (!('webkitSpeechRecognition' in window)) {
		  alert('Voice-to-text is not supported in this browser.');
		  return;
		}

		const recognition = new window.webkitSpeechRecognition();
		recognition.lang = 'en-US';
		recognition.interimResults = false;
		recognition.maxAlternatives = 1;

		recognition.onresult = (event) => {
		  const transcript = event.results[0][0].transcript;
		  inputRef.current!.innerHTML += ` ${transcript}`;
		};

		recognition.onerror = (event) => {
		  console.error('Speech recognition error:', event.error);
		  alert('Error in voice-to-text functionality.');
		};

		recognition.start();
    };

	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
	  const files = e.target.files;
	  if (files && files.length > 0) {
		try {
		  const uploadedUrls = await Promise.all(
			Array.from(files).map(async (file) => {
			  const filePath = `public/${Date.now()}-${file.name}`; // Keep 'public' in the file path for Supabase
			  const { data, error } = await supabase.storage
				.from('attachments')
				.upload(filePath, file);

			  if (error) throw error;

			  // Generate signed URL for the uploaded file
			  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
				.from('attachments')
				.createSignedUrl(filePath, 60 * 60 * 24); // Signed URL valid for 24 hours

			  if (signedUrlError) throw signedUrlError;

			  return signedUrlData.signedUrl; // Use the signed URL
			})
		  );

		  console.log('Uploaded Signed URLs:', uploadedUrls);

		  setAttachments((prev) => [...prev, ...uploadedUrls]);
		} catch (error) {
		  console.error('File upload error:', error);
		}
	  }
	};

	  const handleEmojiClick = (emojiObject: any) => {
		inputRef.current!.innerHTML += emojiObject.emoji;
		setShowEmojiPicker(false);
	  };




  return (
    <form onSubmit={handleSendMessage} className="chat-input-form">
      <div className="chat-input-wrapper">
        {/* File Upload */}
        <span
          className="icon paperclip"
          onClick={() => fileInputRef.current?.click()}
        >
          <FontAwesomeIcon icon={faPaperclip} />
        </span>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden-file-input"
          multiple
        />

        {/* Chat Input */}
        <div
          ref={inputRef}
          contentEditable
          className="chat-input content-editable"
          placeholder="Share your message..."
		  onKeyDown={handleKeyDown}
        ></div>
		
		     {/* Emoji Picker */}
			<span className="icon emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
			  <FontAwesomeIcon icon={faSmile} />
			</span>
			{showEmojiPicker && (
			  <div className="emoji-picker-container">
				<EmojiPicker onEmojiClick={handleEmojiClick} />
			  </div>
			)}

        {/* Microphone */}
        <span className="icon mic" onClick={handleVoiceToText}>
          <FontAwesomeIcon icon={faMicrophone} />
        </span>

        {/* Send Button */}
        <button type="submit" className="icon send">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="attachments-list">
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
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
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
