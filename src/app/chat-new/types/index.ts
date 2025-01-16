export interface UserProfile {
  wallet_address: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
}

export interface Message {
  id: string;
  content: string;
  sender_wallet_id: string;
  attachments?: string[];
  community_id?: string;
  created_at: string;
  receiver_wallet_id?: string;
  is_read: boolean;
}

export interface ChatState {
  messages: Message[];
  users: UserProfile[];
  currentUser?: UserProfile;
  loading: boolean;
  error?: string;
}