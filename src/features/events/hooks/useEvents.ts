import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { EventService } from '../lib/supabase';
import { 
  Event, 
  EventWithStats, 
  EventRegistration, 
  EventAgenda,
  CreateEventForm,
  CreateAgendaForm 
} from '../types/event';

export function useEvents(filters?: {
  status?: string;
  creator_address?: string;
  organizing_pod_id?: string;
  upcoming_only?: boolean;
}) {
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getEvents(filters);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents
  };
}

export function useEvent(eventId: string | null) {
  const [event, setEvent] = useState<EventWithStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getEvent(eventId);
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch event');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  return {
    event,
    loading,
    error,
    refetch: fetchEvent
  };
}

export function useCreateEvent() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createEvent = useCallback(async (eventData: CreateEventForm): Promise<Event | null> => {
    if (!address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      const event = await EventService.createEvent(eventData, address);
      return event;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
      return null;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return {
    createEvent,
    loading,
    error
  };
}

export function useEventRegistrations(eventId: string | null) {
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegistrations = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getEventRegistrations(eventId);
      setRegistrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch registrations');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  return {
    registrations,
    loading,
    error,
    refetch: fetchRegistrations
  };
}

export function useEventRegistration(eventId: string | null) {
  const { address } = useAccount();
  const [registration, setRegistration] = useState<EventRegistration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const fetchRegistration = useCallback(async () => {
    if (!eventId || !address) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getUserRegistration(eventId, address);
      setRegistration(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch registration');
    } finally {
      setLoading(false);
    }
  }, [eventId, address]);

  const registerForEvent = useCallback(async (paymentAmount?: string, paymentToken?: string): Promise<boolean> => {
    if (!eventId || !address) {
      setError('Event ID or wallet address missing');
      return false;
    }

    try {
      setRegistering(true);
      setError(null);
      const newRegistration = await EventService.registerForEvent(
        eventId, 
        address, 
        paymentAmount, 
        paymentToken
      );
      setRegistration(newRegistration);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register for event');
      return false;
    } finally {
      setRegistering(false);
    }
  }, [eventId, address]);

  const cancelRegistration = useCallback(async (): Promise<boolean> => {
    if (!registration) {
      setError('No registration found');
      return false;
    }

    try {
      setRegistering(true);
      setError(null);
      const updatedRegistration = await EventService.cancelRegistration(registration.id);
      setRegistration(updatedRegistration);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel registration');
      return false;
    } finally {
      setRegistering(false);
    }
  }, [registration]);

  useEffect(() => {
    fetchRegistration();
  }, [fetchRegistration]);

  return {
    registration,
    loading,
    error,
    registering,
    registerForEvent,
    cancelRegistration,
    refetch: fetchRegistration
  };
}

export function useEventAgendas(eventId: string | null) {
  const [agendas, setAgendas] = useState<EventAgenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgendas = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getEventAgendas(eventId);
      setAgendas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agendas');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const createAgenda = useCallback(async (agendaData: CreateAgendaForm): Promise<boolean> => {
    if (!eventId) {
      setError('Event ID missing');
      return false;
    }

    try {
      setError(null);
      await EventService.createAgenda({ ...agendaData, event_id: eventId });
      await fetchAgendas();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agenda');
      return false;
    }
  }, [eventId, fetchAgendas]);

  const updateAgenda = useCallback(async (agendaId: string, updates: Partial<EventAgenda>): Promise<boolean> => {
    try {
      setError(null);
      await EventService.updateAgenda(agendaId, updates);
      await fetchAgendas();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agenda');
      return false;
    }
  }, [fetchAgendas]);

  const deleteAgenda = useCallback(async (agendaId: string): Promise<boolean> => {
    try {
      setError(null);
      await EventService.deleteAgenda(agendaId);
      await fetchAgendas();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agenda');
      return false;
    }
  }, [fetchAgendas]);

  useEffect(() => {
    fetchAgendas();
  }, [fetchAgendas]);

  return {
    agendas,
    loading,
    error,
    createAgenda,
    updateAgenda,
    deleteAgenda,
    refetch: fetchAgendas
  };
}

export function useUserEvents() {
  const { address } = useAccount();
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserEvents = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getUserEvents(address);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user events');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchUserEvents();
  }, [fetchUserEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchUserEvents
  };
}

export function useEventActions(eventId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishEvent = useCallback(async (): Promise<boolean> => {
    if (!eventId) {
      setError('Event ID missing');
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      await EventService.publishEvent(eventId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish event');
      return false;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const cancelEvent = useCallback(async (): Promise<boolean> => {
    if (!eventId) {
      setError('Event ID missing');
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      await EventService.cancelEvent(eventId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel event');
      return false;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const completeEvent = useCallback(async (): Promise<boolean> => {
    if (!eventId) {
      setError('Event ID missing');
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      await EventService.completeEvent(eventId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete event');
      return false;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  return {
    loading,
    error,
    publishEvent,
    cancelEvent,
    completeEvent
  };
}