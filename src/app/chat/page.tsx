"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Sidebar } from "./components/sidebar";
import { Chat } from "./components/chat/chat";
import { WalletProvider, useWalletContext } from "src/wallet/components/WalletProvider";
import { ConnectButton } from "src/wallet/components/ConnectButton";
import { OnchainProviders } from "src/wallet/components/OnchainProviders";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ChatPage() {
  return (
    <OnchainProviders>
      <WalletProvider>
        <ChatPageContent />
      </WalletProvider>
    </OnchainProviders>
  );
}

function ChatPageContent() {
  const { walletAddress, isConnected, setIsOpen } = useWalletContext();

  // State variables
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  console.log("Rendering ChatPage...");
  console.log("Supabase URL:", supabaseUrl);
  console.log("Supabase Key:", supabaseAnonKey ? "Present" : "Missing");
  console.log("Wallet Address:", walletAddress);
  console.log("Is Connected:", isConnected);

  useEffect(() => {
    if (!isConnected) {
      console.log("Wallet is not connected. Prompting user to connect.");
      setIsOpen(true); // Opens the wallet connection modal
    }
  }, [isConnected, setIsOpen]);

  // Fetch Users
  useEffect(() => {
    const fetchUsers = async () => {
      console.log("Fetching users...");
      const { data, error } = await supabase
        .from("user_profiles")
        .select("wallet_address, profile_picture, first_name, last_name, desired_involvement");

      if (error) {
        console.error("Error fetching users:", error.message);
        return;
      }

      // Combine `first_name` and `last_name` to form `userName`
      const formattedUsers = (data || []).map((user) => ({
        wallet_address: user.wallet_address,
        profile_picture: user.profile_picture,
        userName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Guest",
        desired_involvement: user.desired_involvement,
      }));

      console.log("Formatted users:", formattedUsers);
      setUsers(formattedUsers);
    };

    fetchUsers();
  }, []);

  // Fetch Messages
  useEffect(() => {
    if (!isConnected || !selectedUser) {
      console.log("Skipping message fetch. isConnected:", isConnected, "selectedUser:", selectedUser);
      return;
    }

    const fetchMessages = async () => {
      console.log("Fetching messages for selected user:", selectedUser.wallet_address);
      setLoadingMessages(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_wallet_id.eq.${walletAddress},receiver_wallet_id.eq.${selectedUser.wallet_address}),
           and(sender_wallet_id.eq.${selectedUser.wallet_address},receiver_wallet_id.eq.${walletAddress})`
        )
        .order("created_at", { ascending: true });

      setLoadingMessages(false);

      if (error) {
        console.error("Error fetching messages:", error.message);
        return;
      }

      console.log("Fetched messages:", data);
      setMessages(data || []);
    };

    fetchMessages();
  }, [isConnected, selectedUser]);

  // Send Message
  const sendMessage = async (newMessageContent: string) => {
    if (!newMessageContent.trim()) {
      console.log("Message content is empty. Aborting send.");
      return;
    }

    console.log("Sending message:", newMessageContent);

    const newMessage = {
      content: newMessageContent,
      sender_wallet_id: walletAddress,
      receiver_wallet_id: selectedUser?.wallet_address,
      created_at: new Date().toISOString(),
      is_read: false,
    };

    // Optimistically update local state
    setMessages((prevMessages) => [...prevMessages, { ...newMessage, id: Date.now() }]);

    // Persist the message to Supabase
    const { error } = await supabase.from("messages").insert([newMessage]);
    if (error) {
      console.error("Error sending message:", error.message);
    } else {
      console.log("Message sent successfully:", newMessage);
    }
  };

  // Log rendering condition
  console.log("Is connected:", isConnected, "Selected user:", selectedUser);

  if (!isConnected) {
    console.log("Wallet is not connected. Showing ConnectButton.");
    return (
      <div className="flex justify-center items-center h-screen">
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-1/4 bg-muted p-4 overflow-y-auto">
        <Sidebar
          chats={users.map((user) => ({
            wallet_address: user.wallet_address,
            name: user.userName || "Unknown User",
            avatar: user.profile_picture,
            lastMessage: messages.length
              ? messages[messages.length - 1].content
              : "No messages yet",
          }))}
          onSelectChat={(walletAddress) => {
            const user = users.find((u) => u.wallet_address === walletAddress);
            console.log("Selected user:", user);
            setSelectedUser(user || null);
          }}
          isCollapsed={false}
        />
      </aside>

      {/* Main Chat Window */}
      <main className="flex-1 bg-background flex flex-col">
        {selectedUser ? (
          <Chat
            messages={messages}
            selectedUser={selectedUser}
            isMobile={false}
            sendMessage={sendMessage}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a user to start chatting.</p>
          </div>
        )}
      </main>
    </div>
  );
}
