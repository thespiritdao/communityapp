"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "src/utils/supabaseClient";
import { Message, UserProfile, ChatGroup } from "../types"; // Ensure ChatGroup includes required_token if not already
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import "../styles/Chat.css";
// Removed direct notificationService import - using context instead
import { extractMentionedWalletsEnhanced } from 'src/utils/mentions';
import { useNotifications } from 'src/context/NotificationContext';

interface ChatContainerProps {
  chatGroupId?: string;
}

export default function ChatContainer({ chatGroupId }: ChatContainerProps) {
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [selectedChatGroup, setSelectedChatGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { createUserMentionNotification } = useNotifications();

  // Fetch current user session & profile once on mount.
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          throw new Error("No authenticated user found");
        }
        const userId = sessionData.session.user.id;
        const { data: userProfile, error: userProfileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();
        if (userProfileError || !userProfile) {
          throw new Error("User profile not found");
        }
        setCurrentUser(userProfile);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    fetchUserData();
  }, []);

  // If a chatGroupId is provided (via URL), fetch that chat group.
  useEffect(() => {
    if (chatGroupId) {
      const fetchChatGroup = async () => {
        const { data, error } = await supabase
          .from("chat_groups")
          .select("*")
          .eq("id", chatGroupId)
          .single();
        if (error) {
          console.error("Error fetching chat group:", error);
        } else {
          setSelectedChatGroup(data);
        }
      };
      fetchChatGroup();
    }
  }, [chatGroupId]);

  // If no chat group is currently selected, fetch available chat groups based on token gating.
  useEffect(() => {
    if (!selectedChatGroup) {
      const fetchChatGroups = async () => {
        if (!currentUser?.wallet_address) return;
        try {
          const res = await fetch(`/api/chat-groups?wallet_address=${currentUser.wallet_address}`);
          const json = await res.json();
          setChatGroups(json.chatGroups || []);
        } catch (error) {
          console.error("Error fetching chat groups:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchChatGroups();
    }
  }, [selectedChatGroup, currentUser]);

  // Once a chat group is selected, fetch its messages and associated users.
  useEffect(() => {
    if (selectedChatGroup) {
      const fetchMessages = async () => {
        setLoading(true);
        try {
          const { data: messagesData, error } = await supabase
            .from("messages")
            .select("*")
            .eq("chat_group_id", selectedChatGroup.id)
            .order("created_at", { ascending: true });
          if (error) throw error;
          setMessages(messagesData || []);
          const { data: usersData, error: usersError } = await supabase.from("user_profiles").select("*");
          if (usersError) throw usersError;
          setUsers(usersData || []);
        } catch (error) {
          console.error("Error fetching messages:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchMessages();

      // Subscribe to realtime message updates for the selected chat group.
      const subscription = supabase
        .channel(`messages-${selectedChatGroup.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `chat_group_id=eq.${selectedChatGroup.id}`,
          },
          (payload) => {
            console.log('Realtime event received! (INSERT)', payload);
            console.log('New message received (INSERT):', payload.new);
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `chat_group_id=eq.${selectedChatGroup.id}`,
          },
          (payload) => {
            console.log('Realtime event received! (UPDATE)', payload);
            console.log('Message updated (UPDATE):', payload.new);
            setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg));
          }
        )
        .subscribe();

      return () => {
        console.log('Cleaning up subscription for chat group:', selectedChatGroup.id);
        supabase.removeChannel(subscription);
      };
    }
  }, [selectedChatGroup]);

  // Handler for sending a new message.
	const sendMessage = async (content: string, attachments?: string[]) => {
	  if (!currentUser || !selectedChatGroup) {
		console.error("No current user or chat group selected.");
		return;
	  }
	  
	  console.log('Sending message:', {
	    content,
	    attachments,
	    sender: currentUser.wallet_address,
	    chatGroup: selectedChatGroup.id
	  });
	  
	  try {
		const messagePayload = {
		  content,
		  attachments: attachments || [],
		  sender_wallet_id: currentUser.wallet_address,
		  sender_profile_picture: currentUser.profile_picture, // include sender's profile image
		  chat_group_id: selectedChatGroup.id,
		  created_at: new Date().toISOString(),
		  required_token: selectedChatGroup.required_token || null,
		};
		console.log('Message payload:', messagePayload);
		
		const { data, error } = await supabase.from("messages").insert([messagePayload]);
		if (error) {
		  console.error('Error inserting message:', error);
		  throw error;
		}
		console.log('Message sent successfully:', data);

        // Extract mentions and send notifications via context (handles both DB and local state)
        console.log('Processing mentions in message:', content);
        const mentionedWallets = await extractMentionedWalletsEnhanced(content);
        console.log('Extracted mentioned wallets:', mentionedWallets);
        
        for (const wallet of mentionedWallets) {
          // TODO: Re-enable self-mention rejection before launch
          // if (wallet.toLowerCase() !== currentUser.wallet_address.toLowerCase()) {
            console.log('Creating chat mention notification for:', wallet.toLowerCase());
            await createUserMentionNotification(
              wallet.toLowerCase(),
              currentUser.wallet_address.toLowerCase(),
              'chat',
              selectedChatGroup.id,
              `/chat/${selectedChatGroup.id}`
            );
          // } else {
          //   console.log('Skipping self-mention for:', wallet.toLowerCase());
          // }
        }
	  } catch (error) {
		console.error("Error sending message:", error);
	  }
	};


  // If no chat group is selected, render the chat group selection screen.
  if (!selectedChatGroup) {
    return (
      <div className="chat-groups-container">
        <h1 className="text-3xl font-bold">SpiritDAO Chats</h1>
        {loading ? (
          <p>Loading chat groups...</p>
        ) : chatGroups.length > 0 ? (
          <ul>
            {chatGroups.map((group) => (
              <li
                key={group.id}
                className="chat-group-item"
                onClick={() => setSelectedChatGroup(group)}
                style={{ cursor: "pointer", marginBottom: "1rem" }}
              >
                <h3>{group.title}</h3>
                <p className="chat-group-description">{group.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No chat groups available.</p>
        )}
      </div>
    );
  }

  // Render the chat conversation for the selected group.
  return (
    <div className="chat-container">
      <header className="chat-header">
        <button className="back-button" onClick={() => setSelectedChatGroup(null)}>
          Chat List
        </button>
        <h2>{selectedChatGroup.title}</h2>
      </header>
      <main className="chat-main">
        <section className="chat-messages">
          <MessageList messages={messages} currentUser={currentUser} loading={loading} users={users} />
        </section>
      </main>
      <footer className="chat-input-section">
        <ChatInput onSendMessage={sendMessage} chatId={selectedChatGroup?.id} />
      </footer>
    </div>
  );
}
