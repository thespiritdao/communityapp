import React from "react";
import useChatStore from "src/app/chat/hooks/useChatStore";
import ChatTopbar from "./chat-topbar";
import { ChatList } from "./chat-list";

interface Message {
  id: number | string;
  content: string;
  sender_wallet_id: string;
  created_at: string;
  // ...any other fields from your Supabase `messages` table
}

interface ChatProps {
  messages?: Message[];
  selectedUserWalletAddress: string;
  isMobile: boolean;
}

export function Chat({ messages, selectedUserWalletAddress, isMobile }: ChatProps) {
  const messagesState = useChatStore((state) => state.messages);

  const sendMessage = (newMessage: Message) => {
    useChatStore.setState((state) => ({
      messages: [...state.messages, newMessage],
    }));
  };

  return (
    <div className="flex flex-col justify-between w-full h-full">
      <ChatTopbar selectedUserWalletAddress={selectedUserWalletAddress} />
      <ChatList
        messages={messagesState}
        selectedUserWalletAddress={selectedUserWalletAddress}
        sendMessage={sendMessage}
        isMobile={isMobile}
      />
    </div>
  );
}
