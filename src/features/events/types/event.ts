export interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_end_date?: string;
  location?: string;
  max_attendees?: number;
  
  // Pricing and token info
  price_amount: string;
  price_self_amount?: string;
  price_token: 'free' | 'SELF' | 'SYSTEM' | 'dual';
  
  // Token gating
  required_tokens: string[];
  
  // Pod association
  organizing_pod_id?: string;
  fund_recipient_pod_id?: string;
  fund_recipient_type: 'pod' | 'dao';
  
  // Event creator and management
  creator_address: string;
  
  // Event tokens/NFTs
  registration_contract_address?: string;
  completion_contract_address?: string;
  
  // Status and metadata
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  qr_code_data?: string;
  
  // Image and metadata
  event_image_url?: string;
  event_metadata?: Record<string, any>;
  
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_address: string;
  
  // Registration details
  registration_status: 'registered' | 'cancelled' | 'checked_in' | 'completed';
  
  // Token tracking
  registration_token_id?: string;
  completion_token_id?: string;
  
  // Payment tracking
  payment_amount: string;
  payment_token: string;
  payment_tx_hash?: string;
  payment_status: 'pending' | 'completed' | 'refunded';
  
  // Timestamps
  registered_at: string;
  checked_in_at?: string;
  completed_at?: string;
  cancelled_at?: string;
}

export interface EventAgenda {
  id: string;
  event_id: string;
  title: string;
  description?: string;
  agenda_date: string;
  start_time: string;
  end_time?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventNotification {
  id: string;
  recipient_address: string;
  event_id?: string;
  registration_id?: string;
  
  notification_type: 
    | 'event_created' 
    | 'event_updated' 
    | 'event_cancelled'
    | 'registration_confirmed' 
    | 'registration_cancelled'
    | 'event_one_week_reminder' 
    | 'event_day_reminder'
    | 'event_starting_soon' 
    | 'event_completed'
    | 'check_in_required' 
    | 'completion_nft_ready';
  
  title: string;
  message: string;
  context_url?: string;
  
  // Notification scheduling
  scheduled_for?: string;
  sent_at?: string;
  
  is_read: boolean;
  created_at: string;
}

export interface EventToken {
  id: string;
  event_id: string;
  token_type: 'registration' | 'completion';
  contract_address: string;
  token_id: string;
  
  // Token metadata
  token_name?: string;
  token_description?: string;
  token_image_url?: string;
  token_metadata?: Record<string, any>;
  
  // Owner tracking
  owner_address: string;
  minted_at: string;
}

export interface EventEscrow {
  id: string;
  event_id: string;
  
  // Escrow account details
  escrow_account_id: string;
  escrow_account_address?: string;
  
  // Token amounts
  total_self_amount: string;
  total_system_amount: string;
  
  // Distribution tracking
  distributed: boolean;
  distributed_at?: string;
  distribution_tx_hash?: string;
  
  created_at: string;
}

// Form types for event creation
export interface CreateEventForm {
  title: string;
  description: string;
  event_date: Date;
  event_end_date?: Date;
  location?: string;
  max_attendees?: number;
  price_amount: string;
  price_self_amount?: string;
  price_token: 'free' | 'SELF' | 'SYSTEM' | 'dual';
  required_tokens: string[];
  organizing_pod_id?: string;
  fund_recipient_pod_id?: string;
  fund_recipient_type: 'pod' | 'dao';
  event_image_url?: string;
  agendas: CreateAgendaForm[];
}

export interface CreateAgendaForm {
  title: string;
  description?: string;
  agenda_date: Date;
  start_time: string;
  end_time?: string;
  sort_order: number;
}

// Extended types with computed properties
export interface EventWithStats extends Event {
  registration_count: number;
  checked_in_count: number;
  completed_count: number;
}

export interface EventWithRegistration extends Event {
  user_registration?: EventRegistration;
  can_register: boolean;
  registration_open: boolean;
}

// Pod information for event management
export interface Pod {
  id: string;
  name: string;
  description: string;
  contract_address?: string | null;
  token_type: string;
  hat_id?: string | null;
  is_active: boolean;
  created_at: string;
}

// Utility types
export type EventStatus = Event['status'];
export type RegistrationStatus = EventRegistration['registration_status'];
export type PaymentStatus = EventRegistration['payment_status'];
export type NotificationType = EventNotification['notification_type'];
export type TokenType = EventToken['token_type'];
export type PriceToken = Event['price_token'];
export type FundRecipientType = Event['fund_recipient_type'];