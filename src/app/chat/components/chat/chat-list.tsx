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
  selectedUser: UserData | null;
  sendMessage: (newMessage: Message) => void;
  isMobile: boolean;
}

const getMessageVariant = (
  messageSenderId: string | undefined,
  selectedUserId: string | undefined,
) => {
  if (!messageSenderId || !selectedUserId) return "received";
  return messageSenderId === selectedUserId ? "sent" : "received";
};

export default function ChatList({
  messages = [],
  selectedUser,
  sendMessage,
  isMobile,
}: ChatListProps) {
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

  if (!selectedUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No user selected.</p>
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
              const variant = getMessageVariant(
                message.sender_wallet_id,
                selectedUser.id,
              );

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
                  className="flex flex-col gap-2 p-4"
                >
                  <ChatBubble variant={variant}>
                    <ChatBubbleAvatar src={message.avatar} />
                    <ChatBubbleMessage isLoading={message.isLoading}>
                      {message.content}
                      {message.timestamp && (
                        <ChatBubbleTimestamp timestamp={message.timestamp} />
                      )}
                    </ChatBubbleMessage>
                    <ChatBubbleActionWrapper>
                      {actionIcons.map(({ icon: Icon, type }) => (
                        <ChatBubbleAction
                          key={type}
                          className="size-7"
                          icon={<Icon className="size-4" />}
                          onClick={() =>
                            console.log(
                              `Action ${type} clicked for message ${index}`,
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
}
