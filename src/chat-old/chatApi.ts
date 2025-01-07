// src/chat/chatApi.ts

import { createClient } from '@supabase/supabase-js';
import { ChatMessage } from './types';

// Ensure environment variables are loaded properly
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase environment variables are missing.");
}

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const fetchMessagesFromAPI = async (): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error('Error fetching messages: ' + error.message);
  }

  return data as ChatMessage[];
};

export const sendMessageToAPI = async (
  content: string,
  attachments: File[] | null,
  communityId: string | null,
  senderWalletId: string
): Promise<any> => {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        content,
        sender_wallet_id: senderWalletId, // Link to wallet
        community_id: communityId,
        attachments: attachments
          ? attachments.map((file) => ({ name: file.name, size: file.size }))
          : null,
        created_at: new Date().toISOString(),
      },
    ])
    .single();

  if (error) {
    console.error('Error sending message:', error.message);
    throw error;
  }

  return data;
};


export const reactToMessageAPI = async (messageId: string, emoji: string): Promise<{ messageId: string; emoji: string; userId: string }> => {
  // TODO: Implement reaction logic in Supabase
  // This is a placeholder implementation
  return { messageId, emoji, userId: 'current_user_id' };
};

export const editMessageAPI = async (messageId: string, newContent: string): Promise<{ messageId: string; newContent: string }> => {
  const { data, error } = await supabase
    .from('messages')
    .update({ content: newContent })
    .eq('id', messageId)
    .single();

  if (error) {
    throw new Error('Error editing message: ' + error.message);
  }

  return { messageId, newContent };
};

// TODO: Implement file upload function for attachments
export const uploadFile = async (file: File): Promise<string> => {
  // Implement file upload to Supabase storage
  // Return the URL of the uploaded file
  throw new Error('File upload not implemented');
};