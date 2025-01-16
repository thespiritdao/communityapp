"use client";

import React, { useEffect, useState } from "react";
import useChatStore from "src/app/chat/hooks/useChatStore";
import ChatTopbar from "./chat-topbar";
import ChatList from "./chat-list";
import ChatBottombar from "./chat-bottombar";
import { supabase } from "src/utils/supabaseClient";
import { useWallet } from "src/wallet/components/Wallet";

interface ChatProps {
  selectedUser: UserData; // User object for the selected chat
  isMobile: boolean; // Whether the chat is being viewed on mobile
}

export function Chat({ selectedUser, isMobile }: ChatProps) {
  const [message, setMessage] = useState("");
  const messages = useChatStore((state) => state.messages);
  const setMessages = useChatStore((state) => state.setMessages);
  const { walletAddress } = useWallet(); // Ensure wallet is available

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_wallet_id.eq.${selectedUser.wallet_address},receiver_wallet_id.eq.${selectedUser.wallet_address}`)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error.message);
      } else if (data) {
        setMessages(data);
      }
    };

    const subscription = supabase
      .from("messages")
      .on("INSERT", (payload) => {
        setMessages((prevMessages) => [...prevMessages, payload.new]);
      })
      .subscribe();

    fetchMessages();

    return () => {
      supabase.removeSubscription(subscription);
    };
  }, [selectedUser.wallet_address, setMessages]);

  const handleSendMessage = (newMessageContent: string) => {
    if (!newMessageContent.trim()) return;

    const newMessage = {
      id: Date.now(),
      content: newMessageContent,
      sender_wallet_id: walletAddress,
      receiver_wallet_id: selectedUser.wallet_address,
      created_at: new Date().toISOString(),
      is_read: false,
    };

    // Optimistically update the UI
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    // Save to Supabase
    supabase
      .from("messages")
      .insert(newMessage)
      .catch((error) => {
        console.error("Error sending message:", error.message);
      });
  };

  return (
    <div className="flex flex-col justify-between w-full h-full">
      {/* Topbar */}
      <ChatTopbar
        userName={selectedUser.desired_involvement || "Guest"}
        userAvatar={selectedUser.profile_picture}
        walletAddress={selectedUser.wallet_address}
      />

      {/* Chat List */}
      <ChatList
        messages={messages}
        walletAddress={walletAddress || ""}
        selectedUser={selectedUser}
        sendMessage={handleSendMessage}
        isMobile={isMobile}
      />

      {/* Bottom Bar */}
      <ChatBottombar
        isMobile={isMobile}
        sendMessage={handleSendMessage}
      />
    </div>
  );
}
