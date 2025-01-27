"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "src/lib/supabase";
import { Message, UserProfile } from "../types";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import UserList from "./UserList";
import "../styles/Chat.css";

export default function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        console.log("Fetching session data...");
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          console.error("Session error or no authenticated user found:", sessionError);
          throw new Error("No authenticated user found");
        }
        console.log("Session data fetched successfully:", sessionData);

        const userId = sessionData.session.user.id;

        console.log("Fetching current user profile...");
        const { data: userProfile, error: userProfileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (userProfileError || !userProfile) {
          console.error("User profile error:", userProfileError);
          throw new Error("User profile not found");
        }
        console.log("User profile fetched successfully:", userProfile);

        setCurrentUser(userProfile);

        console.log("Fetching messages...");
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: true });

        if (messagesError) {
          console.error("Messages fetch error:", messagesError);
          throw messagesError;
        }
        console.log("Messages fetched successfully:", messagesData);

        setMessages(messagesData || []);

        console.log("Fetching all users...");
        const { data: usersData, error: usersError } = await supabase.from("user_profiles").select("*");

        if (usersError) {
          console.error("Users fetch error:", usersError);
          throw usersError;
        }
        console.log("Users fetched successfully:", usersData);

        setUsers(usersData || []);
      } catch (error) {
        console.error("Error fetching chat data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

	const subscription = supabase
	  .channel("messages")
	  .on(
		"postgres_changes",
		{ event: "INSERT", schema: "public", table: "messages" },
		(payload) => {
		  console.log("Payload on INSERT:", payload.new); // Correctly placed within the callback
		  setMessages((prev) => {
			const updatedMessages = [...prev, payload.new as Message];
			console.log("Updated Messages:", updatedMessages);
			return updatedMessages;
		  });
		}
	  )
	  .subscribe();


    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const sendMessage = async (content: string, attachments?: string[]) => {
    if (!currentUser) {
      console.error("No current user available.");
     return;
    }

    try {
      const messagePayload = {
        content,
        attachments: attachments || [],
        sender_wallet_id: currentUser.wallet_address, // Ensure this matches `user_profiles.wallet_address`
        created_at: new Date().toISOString(),
      };

      console.log("Message payload:", messagePayload);
	  console.log("Message Payload Sent to Supabase:", messagePayload);


      const { error } = await supabase.from("messages").insert([messagePayload]);

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

	return (
	  <div className="chat-container">

		<main className="chat-main">
			<section className="chat-messages">
			  <MessageList messages={messages} currentUser={currentUser} loading={loading}  users={users} />
			</section>


		  {/* Add logs outside JSX */}
		  {console.log('Current User in ChatContainer:', currentUser)}
		  {console.log('Messages in ChatContainer:', messages)}
		  {console.log('Users in ChatContainer:', users)}
		  {console.log('Messages in MessageList:', messages)}
		</main>
		<footer className="chat-input-section">
		  <ChatInput onSendMessage={sendMessage} />
		</footer>
	  </div>
	);

}
