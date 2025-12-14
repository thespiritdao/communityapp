import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/lib/supabase';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import EventManagerABI from '../../../abis/EventManager.json';

const EVENT_MANAGER_ADDRESS = CONTRACT_ADDRESSES.EVENT_MANAGER;

export interface SimplifiedEvent {
  eventId: string;
  title: string;
  description?: string; // From database
  eventDate: bigint;
  organizer: string;
  fundRecipient: string;
  priceSystem: bigint;
  priceSelf: bigint;
  status: number; // 0: Created, 1: Active, 2: Completed, 3: Cancelled
  createdAt: bigint;
  maxAttendees: bigint;
  currentAttendees: bigint;
  requiresPayment: boolean;
  // Additional fields from database
  location?: string;
  image_url?: string;
}

export interface EventWithDetails extends SimplifiedEvent {
  description: string;
  location: string;
  image_url: string;
  registration_open: boolean;
  registration_close: Date;
}

export function useSimplifiedEvents() {
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get all event IDs from contract
  const { data: eventIds, isLoading: idsLoading } = useReadContract({
    address: EVENT_MANAGER_ADDRESS,
    abi: EventManagerABI,
    functionName: 'getAllEvents',
  });

  useEffect(() => {
    async function fetchEventsWithDetails() {
      if (!eventIds || idsLoading) return;

      try {
        setLoading(true);
        const eventsWithDetails: EventWithDetails[] = [];

        for (const eventId of eventIds as string[]) {
          // Get event data from contract
          const eventData = await fetchEventFromContract(eventId);

          // Get additional details from database
          const { data: dbEvent } = await supabase
            .from('events')
            .select(
              'description, location, image_url, registration_open, registration_close',
            )
            .eq('blockchain_event_id', eventId)
            .single();

          if (eventData) {
            eventsWithDetails.push({
              ...eventData,
              description: dbEvent?.description || '',
              location: dbEvent?.location || '',
              image_url: dbEvent?.image_url || '',
              registration_open: dbEvent?.registration_open || true,
              registration_close: dbEvent?.registration_close
                ? new Date(dbEvent.registration_close)
                : new Date(Number(eventData.eventDate) * 1000),
            });
          }
        }

        setEvents(eventsWithDetails);
        setError(null);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError('Failed to load events');
      } finally {
        setLoading(false);
      }
    }

    fetchEventsWithDetails();
  }, [eventIds, idsLoading]);

  return { events, loading: loading || idsLoading, error };
}

export function useUserEvents(userAddress?: string) {
  const { evmAddress: address } = useEvmAddress();
  const targetAddress = userAddress || address;

  const { data: userEventIds, isLoading } = useReadContract({
    address: EVENT_MANAGER_ADDRESS,
    abi: EventManagerABI,
    functionName: 'getUserEvents',
    args: targetAddress ? [targetAddress] : undefined,
  });

  const [userEvents, setUserEvents] = useState<EventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserEvents() {
      if (!userEventIds || isLoading) return;

      try {
        setLoading(true);
        const events: EventWithDetails[] = [];

        for (const eventId of userEventIds as string[]) {
          const eventData = await fetchEventFromContract(eventId);

          const { data: dbEvent } = await supabase
            .from('events')
            .select(
              'description, location, image_url, registration_open, registration_close',
            )
            .eq('blockchain_event_id', eventId)
            .single();

          if (eventData) {
            events.push({
              ...eventData,
              description: dbEvent?.description || '',
              location: dbEvent?.location || '',
              image_url: dbEvent?.image_url || '',
              registration_open: dbEvent?.registration_open || true,
              registration_close: dbEvent?.registration_close
                ? new Date(dbEvent.registration_close)
                : new Date(Number(eventData.eventDate) * 1000),
            });
          }
        }

        setUserEvents(events);
      } catch (err) {
        console.error('Error fetching user events:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchUserEvents();
  }, [userEventIds, isLoading, targetAddress]);

  return { events: userEvents, loading: loading || isLoading };
}

export function useEventRegistration(eventId: string, userAddress?: string) {
  const { evmAddress: address } = useEvmAddress();
  const targetAddress = userAddress || address;

  const { data: isRegistered } = useReadContract({
    address: EVENT_MANAGER_ADDRESS,
    abi: EventManagerABI,
    functionName: 'isRegisteredForEvent',
    args: eventId && targetAddress ? [eventId, targetAddress] : undefined,
  });

  return { isRegistered: Boolean(isRegistered) };
}

// Helper function to fetch event data from contract
async function fetchEventFromContract(
  eventId: string,
): Promise<SimplifiedEvent | null> {
  try {
    // This would typically use a contract read call
    // For now, we'll use a mock implementation
    // In a real implementation, you'd call the contract's getEvent function

    return null; // Placeholder - implement actual contract read
  } catch (error) {
    console.error('Error fetching event from contract:', error);
    return null;
  }
}

export function useEventDetails(eventId: string) {
  const [event, setEvent] = useState<EventWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: contractEvent } = useReadContract({
    address: EVENT_MANAGER_ADDRESS,
    abi: EventManagerABI,
    functionName: 'getEvent',
    args: eventId ? [eventId] : undefined,
  });

  useEffect(() => {
    async function fetchEventDetails() {
      if (!contractEvent || !eventId) return;

      try {
        const { data: dbEvent } = await supabase
          .from('events')
          .select(
            'description, location, image_url, registration_open, registration_close',
          )
          .eq('blockchain_event_id', eventId)
          .single();

        const eventData = contractEvent as any;

        setEvent({
          eventId: eventData.eventId,
          title: eventData.title,
          eventDate: eventData.eventDate,
          organizer: eventData.organizer,
          fundRecipient: eventData.fundRecipient,
          priceSystem: eventData.priceSystem,
          priceSelf: eventData.priceSelf,
          status: eventData.status,
          createdAt: eventData.createdAt,
          maxAttendees: eventData.maxAttendees,
          currentAttendees: eventData.currentAttendees,
          requiresPayment: eventData.requiresPayment,
          description: dbEvent?.description || '',
          location: dbEvent?.location || '',
          image_url: dbEvent?.image_url || '',
          registration_open: dbEvent?.registration_open || true,
          registration_close: dbEvent?.registration_close
            ? new Date(dbEvent.registration_close)
            : new Date(Number(eventData.eventDate) * 1000),
        });
      } catch (error) {
        console.error('Error fetching event details:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEventDetails();
  }, [contractEvent, eventId]);

  return { event, loading };
}
