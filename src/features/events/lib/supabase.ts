import { getCurrentSession } from '@/features/identity/utils/serverAuth';
import { supabase } from '@/utils/supabaseClient';
import type {
  Event,
  EventRegistration,
  EventAgenda,
  EventNotification,
  EventToken,
  EventEscrow,
  CreateEventForm,
  CreateAgendaForm,
  EventWithStats,
  Pod,
} from '../types/event';

export class EventService {
  // Event CRUD operations
  static async createEvent(
    eventData: CreateEventForm,
    creatorAddress: string,
  ): Promise<Event> {
    const { agendas, ...event } = eventData;

    // Ensure user session is valid for authenticated operations
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    // Fetch user profile details (same pattern as forum)
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('wallet_address, first_name, last_name')
      .eq('user_id', session.user.id)
      .single();

    if (profileError || !profileData?.wallet_address) {
      throw new Error('No wallet address found in user_profiles');
    }

    // Check if event already exists (from previous failed attempt)
    const eventPayload = {
      ...event,
      creator_address: profileData.wallet_address,
      user_id: session.user.id, // Add user_id for RLS
      event_date: event.event_date.toISOString(),
      event_end_date: event.event_end_date?.toISOString(),
      status: 'draft',
    };

    // First, try to find existing event by blockchain_event_id
    if (event.blockchain_event_id) {
      console.log('🔍 Checking for existing event:', {
        blockchain_event_id: event.blockchain_event_id,
        user_id: session.user.id,
      });

      const { data: existingEvent, error: selectError } = await supabase
        .from('events')
        .select('*')
        .eq('blockchain_event_id', event.blockchain_event_id)
        .eq('user_id', session.user.id) // Only find our own events
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors if not found

      if (selectError) {
        console.error('❌ Error checking for existing event:', selectError);
      }

      if (existingEvent) {
        console.log(
          '✅ Event already exists in database, returning existing event:',
          {
            blockchain_event_id: existingEvent.blockchain_event_id,
            id: existingEvent.id,
            title: existingEvent.title,
          },
        );
        // Event already exists, return it instead of trying to insert again
        return existingEvent;
      } else {
        console.log('📝 No existing event found, will insert new event');
      }
    }

    // Event doesn't exist, insert it
    console.log('📤 Inserting event into database:', {
      blockchain_event_id: eventPayload.blockchain_event_id,
      title: eventPayload.title,
      user_id: eventPayload.user_id,
      creator_address: eventPayload.creator_address,
    });

    let eventResult;
    let eventError;

    try {
      const result = await supabase
        .from('events')
        .insert(eventPayload)
        .select()
        .single();

      eventResult = result.data;
      eventError = result.error;
    } catch (thrownError: any) {
      // Supabase might throw exceptions instead of returning errors
      console.error('❌ Exception thrown during insert:', thrownError);
      eventError = thrownError;
    }

    if (eventError) {
      console.error('Event creation error details:', {
        error: eventError,
        message: eventError.message,
        details: eventError.details,
        hint: eventError.hint,
        code: eventError.code,
        status: eventError.status,
      });

      // Handle 409 Conflict - event was already inserted but we couldn't read it
      const is409 =
        eventError.code === '23505' ||
        eventError.status === 409 ||
        eventError.message?.includes('duplicate key') ||
        eventError.message?.includes('409') ||
        eventError.message?.includes('Conflict');

      if (is409) {
        console.log(
          '⚠️ 409 Conflict detected - event might already exist, retrying SELECT...',
        );

        // Try to fetch the existing event
        const { data: retryEvent, error: retryError } = await supabase
          .from('events')
          .select('*')
          .eq('blockchain_event_id', event.blockchain_event_id)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (retryEvent) {
          console.log('✅ Successfully retrieved existing event after 409:', {
            id: retryEvent.id,
            blockchain_event_id: retryEvent.blockchain_event_id,
            title: retryEvent.title,
          });
          return retryEvent;
        }

        if (retryError) {
          console.error('❌ Failed to retrieve event after 409:', retryError);
        }
      }

      throw eventError;
    }

    // Check if eventResult is null (RLS policy issue)
    if (!eventResult) {
      console.error('❌ Event insert succeeded but SELECT returned null:', {
        possibleCause:
          'RLS SELECT policy may be blocking read access to newly created event',
        userId: session.user.id,
        creatorAddress: profileData.wallet_address,
        hint: 'Check that SELECT policy on events table allows user to read their own events',
      });

      // Try one more time to fetch the event - it might have been inserted
      console.log('🔄 Retrying SELECT after null result...');
      const { data: retryEvent, error: retryError } = await supabase
        .from('events')
        .select('*')
        .eq('blockchain_event_id', event.blockchain_event_id)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (retryEvent) {
        console.log('✅ Successfully retrieved event on retry:', {
          id: retryEvent.id,
          blockchain_event_id: retryEvent.blockchain_event_id,
          title: retryEvent.title,
        });
        return retryEvent;
      }

      if (retryError) {
        console.error('❌ Retry SELECT also failed:', retryError);
      }

      throw new Error(
        'Database insert succeeded but could not retrieve event data. This may be due to Row Level Security policies.',
      );
    }

    // Insert agendas if provided
    if (agendas && agendas.length > 0) {
      const agendasToInsert = agendas.map((agenda) => ({
        event_id: eventResult.id,
        title: agenda.title,
        description: agenda.description,
        agenda_date: agenda.agenda_date.toISOString().split('T')[0],
        start_time: agenda.start_time,
        end_time: agenda.end_time,
        sort_order: agenda.sort_order,
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
    // Force using the events table to ensure blockchain_event_id is included
    console.log(
      '📊 Forcing events table usage to preserve blockchain_event_id',
    );
    return this.getEventsFromTable(filters);

    // Original view-first approach (disabled to test blockchain_event_id issue)
    /*
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
      // Use event_end_date if available, otherwise fall back to event_date
      const now = new Date().toISOString();
      query = query.or(`event_end_date.gte.${now},and(event_end_date.is.null,event_date.gte.${now})`);
    }

    const { data, error } = await query;

    // If the view doesn't exist, fallback to events table
    if (error && (error.code === '42P01' || error.message.includes('relation "events_with_stats" does not exist'))) {
      console.warn('events_with_stats view not found, falling back to events table');
      return this.getEventsFromTable(filters);
    }

    if (error) throw error;
    return data || [];
    */
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
      // Use event_end_date if available, otherwise fall back to event_date
      // Events are upcoming if they haven't ended yet
      const now = new Date().toISOString();
      query = query.or(
        `event_end_date.gte.${now},and(event_end_date.is.null,event_date.gte.${now})`,
      );

      console.log('📅 Database upcoming_only filter applied:', {
        now,
        logic:
          'event_end_date >= now OR (event_end_date is null AND event_date >= now)',
      });
    }

    const { data, error } = await query;

    if (error) throw error;

    // Debug: Check blockchain_event_id in fetched data
    console.log('📊 Events fetched from table with blockchain_event_id:', {
      totalEvents: data?.length || 0,
      eventsWithBlockchainId:
        data?.filter((e) => e.blockchain_event_id).length || 0,
      sampleEvent: data?.[0]
        ? {
            id: data[0].id,
            title: data[0].title,
            blockchain_event_id: data[0].blockchain_event_id,
            hasBlockchainId: !!data[0].blockchain_event_id,
          }
        : null,
    });

    // Calculate registration counts for each event
    const eventsWithStats = await Promise.all(
      (data || []).map(async (event: any) => {
        try {
          // Get registration count for this event
          const { count: registrationCount } = await supabase
            .from('event_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .in('registration_status', [
              'registered',
              'checked_in',
              'completed',
            ]);

          // Get checked-in count
          const { count: checkedInCount } = await supabase
            .from('event_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .in('registration_status', ['checked_in', 'completed']);

          // Get completed count
          const { count: completedCount } = await supabase
            .from('event_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('registration_status', 'completed');

          return {
            ...event,
            registration_count: registrationCount || 0,
            checked_in_count: checkedInCount || 0,
            completed_count: completedCount || 0,
            pod_name: null,
          };
        } catch (countError) {
          console.error(
            `Failed to get counts for event ${event.id}:`,
            countError,
          );
          return {
            ...event,
            registration_count: 0,
            checked_in_count: 0,
            completed_count: 0,
            pod_name: null,
          };
        }
      }),
    );

    return eventsWithStats;
  }

  static async getEvent(eventId: string): Promise<EventWithStats | null> {
    // Always try events table first to ensure blockchain_event_id is included
    console.log('📊 Fetching event with blockchain_event_id support:', eventId);

    try {
      const tableResult = await this.getEventFromTable(eventId);
      if (tableResult) {
        return tableResult;
      }
    } catch (tableError) {
      console.warn(
        '📊 Failed to fetch from events table, trying view:',
        tableError,
      );
    }

    // Fallback to events_with_stats view
    const { data, error } = await supabase
      .from('events_with_stats')
      .select('*')
      .eq('id', eventId)
      .single();

    // If the view doesn't exist, we already tried the table above
    if (
      error &&
      (error.code === '42P01' ||
        error.message.includes('relation "events_with_stats" does not exist'))
    ) {
      console.log('📊 events_with_stats view not found and table failed');
      return null;
    }

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Debug: Check if blockchain_event_id is present in the view data
    console.log('📊 Event data from events_with_stats view (fallback):', {
      eventId,
      hasBlockchainId: !!data?.blockchain_event_id,
      blockchain_event_id: data?.blockchain_event_id,
      allFields: Object.keys(data || {}),
    });

    return data;
  }

  static async getEventFromTable(
    eventId: string,
  ): Promise<EventWithStats | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Debug: Check if blockchain_event_id is present in the table data
    console.log('📊 Event data from events table:', {
      eventId,
      hasBlockchainId: !!data?.blockchain_event_id,
      blockchain_event_id: data?.blockchain_event_id,
      allFields: Object.keys(data || {}),
    });

    // Calculate registration counts for this event
    try {
      // Get registration count for this event
      const { count: registrationCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('registration_status', ['registered', 'checked_in', 'completed']);

      // Get checked-in count
      const { count: checkedInCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('registration_status', ['checked_in', 'completed']);

      // Get completed count
      const { count: completedCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('registration_status', 'completed');

      // Transform regular event to EventWithStats format with actual counts
      return {
        ...data,
        registration_count: registrationCount || 0,
        checked_in_count: checkedInCount || 0,
        completed_count: completedCount || 0,
        pod_name: null,
      };
    } catch (countError) {
      console.error(`Failed to get counts for event ${eventId}:`, countError);
      // Fallback to zero counts
      return {
        ...data,
        registration_count: 0,
        checked_in_count: 0,
        completed_count: 0,
        pod_name: null,
      };
    }
  }

  static async updateEvent(
    eventId: string,
    updates: Partial<Event>,
  ): Promise<Event> {
    // Ensure user session is valid for authenticated operations
    await this.ensureAuthenticated();

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
    const { error } = await supabase.from('events').delete().eq('id', eventId);

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
    paymentAmount = '0',
    paymentToken = 'free',
  ): Promise<EventRegistration> {
    // Ensure user session is valid for authenticated operations
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('event_registrations')
      .insert({
        event_id: eventId,
        user_address: userAddress,
        payment_amount: paymentAmount,
        payment_token: paymentToken,
        payment_status: paymentAmount === '0' ? 'completed' : 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getEventRegistrations(
    eventId: string,
  ): Promise<EventRegistration[]> {
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
    userAddress: string,
  ): Promise<EventRegistration | null> {
    try {
      // Check if user session is valid for authenticated operations
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) {
        console.warn('Session error in getUserRegistration:', sessionError);
        return null; // Return null instead of throwing
      }

      if (!session?.user?.id) {
        console.warn(
          'No authenticated session in getUserRegistration, returning null',
        );
        return null; // Return null instead of throwing
      }

      // Use maybeSingle() to avoid errors when no record found
      const { data, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_address', userAddress.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error('Database error in getUserRegistration:', error);
        return null; // Return null instead of throwing on DB errors
      }

      return data;
    } catch (error) {
      console.error('Unexpected error in getUserRegistration:', error);
      return null; // Always return null instead of throwing
    }
  }

  static async updateRegistration(
    registrationId: string,
    updates: Partial<EventRegistration>,
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

  static async cancelRegistration(
    registrationId: string,
  ): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    });
  }

  static async checkInUser(registrationId: string): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'checked_in',
      checked_in_at: new Date().toISOString(),
    });
  }

  static async completeUserRegistration(
    registrationId: string,
  ): Promise<EventRegistration> {
    return this.updateRegistration(registrationId, {
      registration_status: 'completed',
      completed_at: new Date().toISOString(),
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

  static async createAgenda(
    agendaData: CreateAgendaForm & { event_id: string },
  ): Promise<EventAgenda> {
    // Ensure user session is valid for authenticated operations
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    console.log('Session check in createAgenda:', {
      session,
      sessionError,
      hasUser: !!session?.user,
      userId: session?.user?.id,
    });

    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error(`Session error: ${sessionError.message}`);
    }

    if (!session?.user?.id) {
      console.error('No valid session found:', { session });
      throw new Error('Authentication required - please log in again');
    }

    // Get user profile to ensure proper permissions
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', session.user.id)
      .single();

    if (!profileData?.wallet_address) {
      throw new Error('User profile not found');
    }

    // Verify user has permission to modify this event
    const { data: eventData } = await supabase
      .from('events')
      .select('creator_address, user_id')
      .eq('id', agendaData.event_id)
      .single();

    if (
      !eventData ||
      (eventData.user_id !== session.user.id &&
        eventData.creator_address !== profileData.wallet_address)
    ) {
      throw new Error(
        'Permission denied: You can only add agenda items to events you created',
      );
    }

    const { data, error } = await supabase
      .from('event_agendas')
      .insert({
        ...agendaData,
        agenda_date: agendaData.agenda_date.toISOString().split('T')[0],
        // Include sort_order as number, not string
        sort_order: Number(agendaData.sort_order),
      })
      .select()
      .single();

    if (error) {
      console.error('Agenda creation error:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }
    return data;
  }

  static async updateAgenda(
    agendaId: string,
    updates: Partial<EventAgenda>,
  ): Promise<EventAgenda> {
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
    notificationData: Omit<EventNotification, 'id' | 'created_at'>,
  ): Promise<EventNotification> {
    // Ensure user session is valid for authenticated operations
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('event_notifications')
      .insert(notificationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getUserNotifications(
    userAddress: string,
  ): Promise<EventNotification[]> {
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
  static async createEventToken(
    tokenData: Omit<EventToken, 'id' | 'minted_at'>,
  ): Promise<EventToken> {
    // Ensure user session is valid for authenticated operations
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('event_tokens')
      .insert(tokenData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getEventTokens(
    eventId: string,
    tokenType?: 'registration' | 'completion',
  ): Promise<EventToken[]> {
    let query = supabase
      .from('event_tokens')
      .select('*')
      .eq('event_id', eventId);

    if (tokenType) {
      query = query.eq('token_type', tokenType);
    }

    const { data, error } = await query.order('minted_at', {
      ascending: false,
    });

    if (error) throw error;
    return data || [];
  }

  static async getUserEventTokens(
    userAddress: string,
    eventId?: string,
  ): Promise<EventToken[]> {
    let query = supabase
      .from('event_tokens')
      .select('*')
      .eq('owner_address', userAddress);

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    const { data, error } = await query.order('minted_at', {
      ascending: false,
    });

    if (error) throw error;
    return data || [];
  }

  // Escrow operations
  static async createEscrow(
    escrowData: Omit<EventEscrow, 'id' | 'created_at'>,
  ): Promise<EventEscrow> {
    // Ensure user session is valid for authenticated operations
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

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

  static async updateEscrow(
    escrowId: string,
    updates: Partial<EventEscrow>,
  ): Promise<EventEscrow> {
    const { data, error } = await supabase
      .from('event_escrow')
      .update(updates)
      .eq('id', escrowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Pod Management Functions
  static async createPod(podData: {
    name: string;
    description: string;
    parentPodId: string;
    podLeads: string[];
    accountabilitySignatures: Record<string, any>;
    image: string;
    managementHatId?: string;
    membershipHatId?: string;
    treasuryContractAddress?: string;
    status?: string;
    podId?: string; // NEW: Optional pod ID for tracking
    proxyContractAddress?: string; // NEW: Proxy contract address
    proxyAdminHatId?: string; // NEW: Proxy admin HAT ID
    blockchainPodId?: string; // NEW: Blockchain pod ID for factory (format: "pod-{timestamp}-{random}")
  }): Promise<Pod> {
    console.log('🏗️ Creating pod in Supabase:', podData.name);

    // Get user session for RLS
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    // Get user profile for wallet address
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', session.user.id)
      .single();

    if (profileError || !profileData?.wallet_address) {
      throw new Error('No wallet address found in user_profiles');
    }

    // Find the parent pod UUID by looking up the parent HAT ID
    let parentPodUuid = null;
    if (podData.parentPodId && podData.parentPodId !== 'TOP_LEVEL') {
      const { data: parentPodData, error: parentPodError } = await supabase
        .from('pods')
        .select('id')
        .eq('management_hat_id', podData.parentPodId)
        .order('created_at', { ascending: false }) // Get most recent pod with this HAT ID
        .limit(1);

      if (parentPodError || !parentPodData || parentPodData.length === 0) {
        console.warn(
          'Could not find parent pod with HAT ID:',
          podData.parentPodId,
          parentPodError,
        );
        // Continue without parent (creates orphaned pod, but better than failing)
      } else {
        parentPodUuid = parentPodData[0].id;
        console.log(
          'Found parent pod UUID:',
          parentPodUuid,
          'for HAT ID:',
          podData.parentPodId,
        );
      }
    }

    const { data, error } = await supabase
      .from('pods')
      .insert({
        id: podData.podId, // Use provided pod ID if available
        name: podData.name,
        description: podData.description,
        parent_pod_id: parentPodUuid, // Use the UUID, not the HAT ID
        pod_leads: podData.podLeads,
        accountability_signatures: JSON.stringify(
          podData.accountabilitySignatures,
        ),
        pod_image_url: podData.image,
        management_hat_id: podData.managementHatId,
        membership_hat_id: podData.membershipHatId,
        token_address: podData.managementHatId, // Set token_address to management HAT ID for compatibility
        treasury_contract_address: podData.treasuryContractAddress,
        proxy_contract_address: podData.proxyContractAddress || null, // NEW: Store proxy address
        proxy_admin_hat_id: podData.proxyAdminHatId || null, // NEW: Store proxy admin HAT
        blockchain_pod_id: podData.blockchainPodId || null, // NEW: Store blockchain pod ID for factory operations
        created_by_address: profileData.wallet_address,
        status: podData.status || 'active',
        pod_metadata: JSON.stringify({
          created_via: 'hats_modules',
          timestamp: new Date().toISOString(),
          auth_user_id: session.user.id, // Store auth user ID in metadata instead
          proxy_contract_address: podData.proxyContractAddress, // Also in metadata for redundancy
          proxy_admin_hat_id: podData.proxyAdminHatId,
          blockchain_pod_id: podData.blockchainPodId, // Also in metadata for tracking
        }),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create pod in Supabase:', error);
      throw error;
    }

    console.log('✅ Pod created successfully in Supabase:', data.id);
    return data;
  }

  // Update Pod Function
  static async updatePod(
    podId: string,
    updates: {
      treasuryContractAddress?: string;
      treasuryDeploymentHash?: string;
      status?: string;
      managementHatId?: string;
      membershipHatId?: string;
    },
  ): Promise<Pod> {
    console.log('🔄 Updating pod in Supabase:', podId, updates);

    const { data, error } = await supabase
      .from('pods')
      .update({
        treasury_contract_address: updates.treasuryContractAddress,
        treasury_deployment_hash: updates.treasuryDeploymentHash,
        status: updates.status,
        management_hat_id: updates.managementHatId,
        membership_hat_id: updates.membershipHatId,
        token_address: updates.managementHatId, // Keep token_address in sync with management_hat_id
        updated_at: new Date().toISOString(),
      })
      .eq('id', podId)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to update pod in Supabase:', error);
      throw error;
    }

    console.log('✅ Pod updated successfully in Supabase:', data.id);
    return data;
  }

  // Utility functions
  static async getPods(): Promise<Pod[]> {
    console.log('🔄 Getting pods from dedicated pods table...');

    // Check if user is authenticated for RLS policies
    const session = await getCurrentSession();
    console.log('🔐 User authentication status:', !!session?.user?.id);
    console.log('🔐 Session details:', {
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      userRole: session?.user?.role,
      sessionExpiry: session?.expires_at,
    });

    // Get user profile for RLS context (might be needed for wallet address matching)
    let userWalletAddress = null;
    if (session?.user?.id) {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('wallet_address')
          .eq('user_id', session.user.id)
          .single();

        if (!profileError && profileData) {
          userWalletAddress = profileData.wallet_address;
          console.log(
            '🔐 User wallet address from profile:',
            userWalletAddress,
          );
        } else {
          console.log(
            '⚠️ Could not get user wallet address:',
            profileError?.message,
          );
        }
      } catch (profileFetchError) {
        console.log('⚠️ Error fetching user profile:', profileFetchError);
      }
    }

    // Get pods from the dedicated 'pods' table only - this is the correct source
    // All pods are tokens, but not all tokens are pods (events, permissions, etc. also create tokens)

    // First, try with RLS bypass for debugging
    let data, error;
    try {
      console.log('🔍 Attempting query with RLS bypass...');
      const { data: bypassData, error: bypassError } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      data = bypassData;
      error = bypassError;

      console.log('🔍 RLS bypass result:', {
        dataLength: data?.length || 0,
        error: error?.message || 'none',
      });
    } catch (bypassAttemptError) {
      console.log('⚠️ RLS bypass failed, using standard query...');

      // Fallback to standard query
      const { data: standardData, error: standardError } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      data = standardData;
      error = standardError;
    }

    console.log('🔍 Pods query result:', {
      dataLength: data?.length || 0,
      error: error?.message || 'none',
      errorCode: error?.code || 'none',
      sampleData:
        data?.slice(0, 2)?.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          pod_image_url: p.pod_image_url,
          management_hat_id: p.management_hat_id,
        })) || [],
    });

    if (error) {
      console.error('❌ Error fetching pods from pods table:', error);
      throw error;
    }

    console.log(`✅ Found ${data?.length || 0} pods in pods table`);
    return data || [];
  }

  static async getAllTokens(): Promise<
    { id: string; name: string; symbol?: string; contract_address?: string }[]
  > {
    // First try with symbol, if it fails, fallback without symbol
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('id, name, symbol, contract_address')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error && error.code === '42703') {
        // Column doesn't exist, try without symbol
        console.warn('Symbol column does not exist, querying without it');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('tokens')
          .select('id, name, contract_address')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (fallbackError) throw fallbackError;
        return (fallbackData || []).map((token) => ({
          ...token,
          symbol: undefined,
        }));
      }

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching tokens:', err);
      // Final fallback - try basic query
      const { data: basicData, error: basicError } = await supabase
        .from('tokens')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (basicError) throw basicError;
      return (basicData || []).map((token) => ({
        ...token,
        symbol: undefined,
        contract_address: undefined,
      }));
    }
  }

  static async getUserEvents(userAddress: string): Promise<EventWithStats[]> {
    const { data, error } = await supabase.rpc('get_user_events', {
      user_wallet_address: userAddress,
    });

    if (error) throw error;
    return data || [];
  }

  static async canUserRegisterForEvent(
    eventId: string,
    userAddress: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_user_register_for_event', {
      event_uuid: eventId,
      user_wallet_address: userAddress,
    });

    if (error) throw error;
    return data || false;
  }

  // User profile operations
  static async getUserProfileByWallet(walletAddress: string): Promise<{
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
    user_id: string;
    wallet_address: string;
  } | null> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, wallet_address, first_name, last_name, profile_picture')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No profile found
      throw error;
    }

    return data;
  }

  // Search and filtering
  static async searchEvents(
    searchTerm: string,
    filters?: {
      status?: string;
      price_token?: string;
      organizing_pod_id?: string;
    },
  ): Promise<EventWithStats[]> {
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

    const { data, error } = await query.order('event_date', {
      ascending: true,
    });

    if (error) throw error;
    return data || [];
  }

  // Cancel registration
  static async cancelEventRegistration(
    eventId: string,
    userAddress: string,
  ): Promise<boolean> {
    try {
      console.log('📝 Cancelling registration:', { eventId, userAddress });

      const { data, error } = await supabase
        .from('event_registrations')
        .update({
          registration_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('user_address', userAddress.toLowerCase())
        .select(); // Return the updated record to confirm the update

      if (error) {
        console.error('❌ Error cancelling registration:', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          eventId,
          userAddress,
        });
        return false;
      }

      if (!data || data.length === 0) {
        console.error('❌ No registration found to cancel:', {
          eventId,
          userAddress,
        });
        return false;
      }

      console.log('✅ Registration cancelled successfully:', {
        eventId,
        userAddress,
        updatedRecord: data[0],
      });

      return true;
    } catch (error) {
      console.error('❌ Exception while cancelling registration:', {
        error,
        eventId,
        userAddress,
      });
      return false;
    }
  }

  // Get all registrations for a user
  static async getUserRegistrations(
    userAddress: string,
  ): Promise<EventRegistration[]> {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('registered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Helper method to ensure user is authenticated with Supabase
  private static async ensureAuthenticated(): Promise<void> {
    const session = await getCurrentSession();

    if (!session?.user?.id) {
      throw new Error(
        'Authentication required - please connect your wallet and sign in',
      );
    }
  }
}
