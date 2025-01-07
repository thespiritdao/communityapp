"use client";

import { useState, useEffect, useRef } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { ChatList } from "./components/chat/chat-list";
import { ChatInput } from "./components/ui/chat/chat-input";
import { WalletProvider } from "src/wallet/components/WalletProvider";
import { ConnectButton } from "src/wallet/components/ConnectButton";
import { useWallet } from "src/wallet/components/Wallet";
import ChatTopbar from "./components/chat/chat-topbar";

export default function ChatPage() {
  const supabase = useSupabaseClient();
  const { walletAddress, isConnected } = useWallet();

  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fetch Users
  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from("users") // Replace "users" with your actual table name
        .select("id, name, avatar"); // Adjust columns based on your schema

      if (!error) {
        setUsers(data || []);
      }
    };

    fetchUsers();
  }, [supabase]);

  // Fetch Messages
  useEffect(() => {
    if (!isConnected || !selectedUser) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("sender_wallet_id", selectedUser.id) // Adjust filter as needed
        .order("created_at", { ascending: true });

      if (!error) {
        setMessages(data || []);
      }
    };

    fetchMessages();
  }, [isConnected, supabase, selectedUser]);

  // Send Message
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMessage = {
      content: inputMessage,
      sender_wallet_id: walletAddress,
      receiver_wallet_id: selectedUser?.id, // Assuming you store this in your schema
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("messages").insert([newMessage]);

    if (!error) {
      setMessages((prevMessages) => [
        ...prevMessages,
        { ...newMessage, id: data[0]?.id || Date.now() },
      ]);
      setInputMessage("");
    }
  };

  if (!isConnected) {
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
        <h2 className="text-lg font-bold mb-4">Chats</h2>
        <ul>
          {users.map((user) => (
            <li
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className="p-2 hover:bg-primary rounded-md cursor-pointer"
            >
              {user.name}
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Chat Window */}
      <div className="flex-1 bg-background flex flex-col">
        {selectedUser ? (
          <>
            {/* Topbar */}
            <ChatTopbar
              userName={selectedUser.name || "Guest"} // Ensure a fallback for userName
              userAvatar={selectedUser.avatar || ""}
            />
            {/* Chat Messages */}
            <div
              className="flex-1 overflow-y-auto p-4"
              ref={messagesContainerRef}
            >
              <ChatList
                messages={messages}
                selectedUser={selectedUser}
                sendMessage={handleSendMessage}
                isMobile={false}
              />
            </div>
            {/* Chat Input */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t flex items-center space-x-2"
            >
              <ChatInput
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1"
              />
              <button
                type="submit"
                className="bg-primary text-white px-4 py-2 rounded-lg"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a user to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}
