// src/app/sensemaker-ai/page.tsx

'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './SensemakerAI.module.css';
import { supabase } from '@/lib/supabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  queryType?: 'spiritdao' | 'temporal-naturalism';
  model?: string;
  timestamp?: string;
}

export default function SensemakerAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! I can help you with SpiritDAO operations or discuss Temporal Naturalism philosophy. What would you like to know?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const sessionIdRef = useRef<string>('');

  // Initialize session ID on mount to avoid hydration mismatch
  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = crypto.randomUUID();
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message to chat
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Send to API
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch('/api/sensemaker/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          sessionId: sessionIdRef.current,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Add assistant response
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        queryType: data.queryType,
        model: data.model,
        timestamp: data.timestamp,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);

      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Refocus input after sending
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    // Generate new session ID for new conversation
    sessionIdRef.current = crypto.randomUUID();

    setMessages([
      {
        role: 'assistant',
        content: 'Chat cleared. How can I help you?',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  // Voice-to-text functionality
  const startListening = () => {
    if (
      !('webkitSpeechRecognition' in window) &&
      !('SpeechRecognition' in window)
    ) {
      alert(
        'Speech recognition is not supported in your browser. Please try Chrome or Edge.',
      );
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.chatContainer}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>SensemakerAI</h1>
          <button
            onClick={clearChat}
            className={styles.clearButton}
            title="Clear chat"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        </div>

        {/* Messages Area */}
        <div className={styles.messagesArea}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`${styles.message} ${
                msg.role === 'user'
                  ? styles.userMessage
                  : styles.assistantMessage
              }`}
            >
              <div className={styles.messageHeader}>
                <span className={styles.messageRole}>
                  {msg.role === 'user' ? 'You' : 'SensemakerAI'}
                </span>
                {msg.timestamp && (
                  <span className={styles.messageTime}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className={styles.messageContent}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              {msg.queryType && (
                <div className={styles.badges}>
                  <span
                    className={`${styles.badge} ${
                      msg.queryType === 'spiritdao'
                        ? styles.badgeDAO
                        : styles.badgePhilosophy
                    }`}
                  >
                    {msg.queryType === 'spiritdao'
                      ? 'DAO Support'
                      : 'Philosophy'}
                  </span>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className={`${styles.message} ${styles.assistantMessage}`}>
              <div className={styles.messageHeader}>
                <span className={styles.messageRole}>SensemakerAI</span>
              </div>
              <div className={styles.loadingDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={styles.inputArea}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about SpiritDAO or Temporal Naturalism..."
            className={styles.input}
            disabled={isLoading || isListening}
          />
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            className={`${styles.micButton} ${isListening ? styles.micButtonActive : ''}`}
            title={isListening ? 'Stop recording' : 'Voice input'}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className={styles.sendButton}
            title="Send message (Enter)"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
