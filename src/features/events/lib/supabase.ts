import { supabase } from '@/lib/supabase';
import { 
  Event, 
  EventRegistration, 
  EventAgenda, 
  EventNotification,
  EventToken,
  EventEscrow,
  CreateEventForm,
  CreateAgendaForm,
  EventWithStats,
  Pod
} from '../types/event';

export class EventService {
  // Event CRUD operations
  static async createEvent(eventData: CreateEventForm, creatorAddress: string): Promise<Event> {
    const { agendas, ...event } = eventData;
    
    // Insert event
    const { data: eventResult, error: eventError } = await supabase
      .from('events')
      .insert({
        ...event,
        creator_address: creatorAddress,
        event_date: event.event_date.toISOString(),
        event_end_date: event.event_end_date?.toISOString(),
        status: 'draft'
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Insert agendas if provided
    if (agendas && agendas.length > 0) {
      const agendasToInsert = agendas.map((agenda) => ({
        event_id: eventResult.id,
        title: agenda.title,
        description: agenda.description,
        agenda_date: agenda.agenda_date.toISOString().split('T')[0],
        start_time: agenda.start_time,
        end_time: agenda.end_time,
        sort_order: agenda.sort_order
      }));

      const { error: agendasError } = await supabase
        .from('event_agendas')
        .insert(agendasToInsert);

      if (agendasError) throw agendasError;
    }

    return eventResult;
  }

  static async getEvents(filters?: {
    status?: string;
    creator_address?: string;
    organizing_pod_id?: string;
    upcoming_only?: boolean;
  }): Promise<EventWithStats[]> {
    // Try the events_with_stats view first
    let query = supabase
      .from('events_with_stats')
      .select('*')
      .order('event_date', { ascending: true });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.creator_address) {
      query = query.eq('creator_address', filters.creator_address);
    }

    if (filters?.organizing_pod_id) {
      query = query.eq('organizing_pod_id', filters.organizing_pod_id);
    }

    if (filters?.upcoming_only) {
      query = query.gte('event_date', new Date().toISOString());
    }

    const { data, error } = await query;

    // If the view doesn't exist, fallback to events table
    if (error && (error.code === '42P01' || error.message.includes('relation "events_with_stats" does not exist'))) {
      console.warn('events_with_stats view not found, falling back to events table');
      return this.getEventsFromTable(filters);
    }

    if (error) throw error;
    return data || [];
  }

  static async getEventsFromTable(filters?: {
    status?: string;
    creator_address?: string;
    organizing_pod_id?: string;
    upcoming_only?: boolean;
  }): Promise<EventWithStats[]> {
    let query = supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.creator_address) {
      query = query.eq('creator_address', filters.creator_address);
    }

    if (filters?.organizing_pod_id) {
      query = query.eq('organizing_pod_id', filters.organizing_pod_id);
    }

    if (filters?.upcoming_only) {
      query = query.gte('event_date', new Date().toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Transform regular events to EventWithStats format
    return (data || []).map((event: any) => ({
      ...event,
      registration_count: 0,
      completion_count: 0,
      pod_name: null
    }));
  }

  static async getEvent(eventId: string): Promise<EventWithStats | null> {
    const { data, error } = await supabase
      .from('events_with_stats')
      .select('*')
      .eq('id', eventId)
      .single();

    // If the view doesn't exist, fallback to events table
    if (error && (error.code === '42P01' || error.message.includes('relation "events_with_stats" does not exist'))) {
      return this.getEventFromTable(eventId);
    }

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  static async getEventFromTable(eventId: string): Promise<EventWithStats | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Transform regular event to EventWithStats format
    return {
      ...data,
      registration_count: 0,
      completion_count: 0,
      pod_name: null
    };
  }

  static async updateEvent(eventId: string, updates: Partial<Event>): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) throw error;
  }

  static async publishEvent(eventId: string): Promise<Event> {
    return this.updateEvent(eventId, { status: 'published' });
  }

  static async cancelEvent(eventId: string): Promise<Event> {
    return this.updateEvent(eventId, { status: 'cancelled' });
  }

  static async completeEvent(eventId: string): Promise<Event> {
    return this.updateEvent(eventId, { status: 'completed' });
  }

  // Event Registration operations
  static async registerForEvent(
    eventId: string, 
    userAddress: string,
    paymentAmount: string = '0',
    paymentToken: string = 'free'
  ): Promise<EventRegistration> {
    const { data, error } = await supabase
      .from('event_registrations')
      .insert({
        event_id: eventId,
        user_address: userAddress,
        payment_amount: paymentAmount,
        payment_token: paymentToken,
        payment_status: paymentAmount === '0' ? 'completed' : 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getEventRegistrations(eventId: string): Promise<EventRegistration[]> {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId)
      .order('registered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getUserRegistration(
    eventId: string, 
    userAddress: string
  ): Promise<EventRegistration | null> {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_address', userAddress)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  static async updateRegistration(
    registrationId: string, 
    updates: Partial<EventRegistration>
  ): Promise<EventRegistration> {
    const { data, error } = await supabase
      .from('event_registrations')
      .update(updates)
      .eq('id', registrationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async cancelRegistration(registrationId: string): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'cancelled',
      cancelled_at: new Date().toISOString()
    });
  }

  static async checkInUser(registrationId: string): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'checked_in',
      checked_in_at: new Date().toISOString()
    });
  }

  static async completeUserRegistration(registrationId: string): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'completed',
      completed_at: new Date().toISOString()
    });
  }

  // Event Agenda operations
  static async getEventAgendas(eventId: string): Promise<EventAgenda[]> {
    const { data, error } = await supabase
      .from('event_agendas')
      .select('*')
      .eq('event_id', eventId)
      .order('agenda_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async createAgenda(agendaData: CreateAgendaForm & { event_id: string }): Promise<EventAgenda> {
    const { data, error } = await supabase
      .from('event_agendas')
      .insert({
        ...agendaData,
        agenda_date: agendaData.agenda_date.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateAgenda(agendaId: string, updates: Partial<EventAgenda>): Promise<EventAgenda> {
    const { data, error } = await supabase
      .from('event_agendas')
      .update(updates)
      .eq('id', agendaId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteAgenda(agendaId: string): Promise<void> {
    const { error } = await supabase
      .from('event_agendas')
      .delete()
      .eq('id', agendaId);

    if (error) throw error;
  }

  // Notification operations
  static async createNotification(
    notificationData: Omit<EventNotification, 'id' | 'created_at'>
  ): Promise<EventNotification> {
    const { data, error } = await supabase
      .from('event_notifications')
      .insert(notificationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getUserNotifications(userAddress: string): Promise<EventNotification[]> {
    const { data, error } = await supabase
      .from('event_notifications')
      .select('*')
      .eq('recipient_address', userAddress)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async markNotificationAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('event_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }

  // Token operations
  static async createEventToken(tokenData: Omit<EventToken, 'id' | 'minted_at'>): Promise<EventToken> {
    const { data, error } = await supabase
      .from('event_tokens')
      .insert(tokenData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getEventTokens(eventId: string, tokenType?: 'registration' | 'completion'): Promise<EventToken[]> {
    let query = supabase
      .from('event_tokens')
      .select('*')
      .eq('event_id', eventId);

    if (tokenType) {
      query = query.eq('token_type', tokenType);
    }

    const { data, error } = await query.order('minted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getUserEventTokens(userAddress: string, eventId?: string): Promise<EventToken[]> {
    let query = supabase
      .from('event_tokens')
      .select('*')
      .eq('owner_address', userAddress);

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    const { data, error } = await query.order('minted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Escrow operations
  static async createEscrow(escrowData: Omit<EventEscrow, 'id' | 'created_at'>): Promise<EventEscrow> {
    const { data, error } = await supabase
      .from('event_escrow')
      .insert(escrowData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getEventEscrow(eventId: string): Promise<EventEscrow | null> {
    const { data, error } = await supabase
      .from('event_escrow')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  static async updateEscrow(escrowId: string, updates: Partial<EventEscrow>): Promise<EventEscrow> {
    const { data, error } = await supabase
      .from('event_escrow')
      .update(updates)
      .eq('id', escrowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Utility functions
  static async getPods(): Promise<Pod[]> {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async getUserEvents(userAddress: string): Promise<EventWithStats[]> {
    const { data, error } = await supabase
      .rpc('get_user_events', { user_wallet_address: userAddress });

    if (error) throw error;
    return data || [];
  }

  static async canUserRegisterForEvent(eventId: string, userAddress: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('can_user_register_for_event', { 
        event_uuid: eventId, 
        user_wallet_address: userAddress 
      });

    if (error) throw error;
    return data || false;
  }

  // Search and filtering
  static async searchEvents(searchTerm: string, filters?: {
    status?: string;
    price_token?: string;
    organizing_pod_id?: string;
  }): Promise<EventWithStats[]> {
    let query = supabase
      .from('events_with_stats')
      .select('*')
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.price_token) {
      query = query.eq('price_token', filters.price_token);
    }

    if (filters?.organizing_pod_id) {
      query = query.eq('organizing_pod_id', filters.organizing_pod_id);
    }

    const { data, error } = await query.order('event_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}