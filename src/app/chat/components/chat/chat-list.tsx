// src/app/chat/components/chat/chat-list.tsx

"use client";

import React, { useRef, useEffect } from "react";
import ChatBottombar from "./chat-bottombar";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChatBubbleAvatar,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
  ChatBubble,
  ChatBubbleAction,
  ChatBubbleActionWrapper,
} from "src/app/chat/components/ui/chat/chat-bubble";
import { ChatMessageList } from "src/app/chat/components/ui/chat/chat-message-list";
import { DotsVerticalIcon, Forward, Heart } from "lucide-react";

interface ChatListProps {
  messages: Message[];
  walletAddress: string; // Added to determine alignment for sent/received messages
  selectedUser: UserData | null;
  sendMessage: (newMessage: Message) => void;
  isMobile: boolean;
}

const ChatList: React.FC<ChatListProps> = ({
  messages, // State of messages
  walletAddress, // Logged-in user’s wallet address
  selectedUser, // Selected user for chat
  sendMessage, // Function to send messages
  isMobile, // Whether the view is mobile
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const actionIcons = [
    { icon: DotsVerticalIcon, type: "More" },
    { icon: Forward, type: "Forward" },
    { icon: Heart, type: "Like" },
  ];

  // Handle when no user is selected
  if (!selectedUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No user selected.</p>
      </div>
    );
  }

  // Handle when there are no messages
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-y-auto h-full flex flex-col">
      {/* Messages List */}
      <ChatMessageList ref={messagesContainerRef}>
        <AnimatePresence>
          {Array.isArray(messages) &&
            messages.map((message, index) => {
              const isSentByUser = message.sender_wallet_id === walletAddress;

              return (
                <motion.div
                  key={message.id || index}
                  layout
                  initial={{ opacity: 0, scale: 1, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1, y: 50 }}
                  transition={{
                    opacity: { duration: 0.1 },
                    layout: {
                      type: "spring",
                      bounce: 0.3,
                      duration: index * 0.05 + 0.2,
                    },
                  }}
                  className={`flex ${
                    isSentByUser ? "justify-end" : "justify-start"
                  } gap-2 p-4`}
                >
                  <ChatBubble variant={isSentByUser ? "sent" : "received"}>
                    {!isSentByUser && (
                      <ChatBubbleAvatar src={message.avatar} />
                    )}
                    <ChatBubbleMessage isLoading={message.isLoading}>
                      {message.content}
                      {message.timestamp && (
                        <ChatBubbleTimestamp timestamp={message.timestamp} />
                      )}
                    </ChatBubbleMessage>
                    {isSentByUser && (
                      <ChatBubbleAvatar src={message.avatar} />
                    )}
                    <ChatBubbleActionWrapper>
                      {actionIcons.map(({ icon: Icon, type }) => (
                        <ChatBubbleAction
                          key={type}
                          className="size-7"
                          icon={<Icon className="size-4" />}
                          onClick={() =>
                            console.log(
                              `Action ${type} clicked for message ${index}`
                            )
                          }
                        />
                      ))}
                    </ChatBubbleActionWrapper>
                  </ChatBubble>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </ChatMessageList>

      {/* Bottom Bar */}
      <ChatBottombar isMobile={isMobile} sendMessage={sendMessage} />
    </div>
  );
};

export default ChatList;
