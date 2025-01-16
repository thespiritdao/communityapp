"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Message, UserProfile } from '../types';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import UserList from './UserList';

export default function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Temporary mock user - replace with actual wallet authentication
  const currentUser: UserProfile = {
    wallet_address: '0x123...abc',
    first_name: 'Test',
    last_name: 'User',
    profile_picture: 'https://via.placeholder.com/50'
  };

  useEffect(() => {
    fetchMessages();
    fetchUsers();
    subscribeToMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const subscribeToMessages = () => {
    const subscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const sendMessage = async (content: string, attachments?: string[]) => {
    try {
      const newMessage = {
        content,
        sender_wallet_id: currentUser.wallet_address,
        attachments,
        created_at: new Date().toISOString(),
        is_read: false
      };

      const { error } = await supabase.from('messages').insert([newMessage]);
      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/4 bg-white border-r">
        <UserList users={users} currentUser={currentUser} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          <MessageList
            messages={messages}
            users={users}
            currentUser={currentUser}
            loading={loading}
          />
        </div>
        <ChatInput onSendMessage={sendMessage} />
      </div>
    </div>
  );
}
