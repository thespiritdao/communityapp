'use client';

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Calendar, X } from 'lucide-react';
import { EventCard } from './EventCard';
import { EventRegistrationModal } from './EventRegistrationModal';
import { useEvents } from '../hooks/useEvents';
import { useTokenGatedEvents } from '../hooks/useEventTokenGating';
import { useBatchEventRegistrationStatus } from '../hooks/useEventRegistrationStatus';
import type { EventWithStats, EventRegistration } from '../types/event';
import { useEvmAddress } from '@coinbase/cdp-hooks';

interface EventListProps {
  showCreateButton?: boolean;
  showPastEvents?: boolean;
  showTokenGating?: boolean;
  showOnlyUserEvents?: boolean;
  showAllEvents?: boolean;
  organizingPodId?: string;
  title?: string;
  emptyMessage?: string;
  limit?: number;
}

export const EventList: React.FC<EventListProps> = ({
  showCreateButton = false,
  showPastEvents = false,
  showTokenGating = true,
  showOnlyUserEvents = false,
  showAllEvents = false,
  organizingPodId,
  title = 'Events',
  emptyMessage,
  limit,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const [showPastToggle, setShowPastToggle] = useState(showPastEvents);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventWithStats | null>(
    null,
  );
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<
    Record<string, EventRegistration>
  >({});
  const [refreshKey, setRefreshKey] = useState(0);

  // Get events based on different modes
  const {
    visibleEvents,
    registrableEvents,
    registeredEvents,
    loading: tokenGatingLoading,
  } = useTokenGatedEvents();

  // Get all events - include completed events for past events toggle
  const eventStatus = showPastToggle ? undefined : 'published'; // Don't filter by status for past events
  const { events: allEvents, loading: eventsLoading } = useEvents({
    status: eventStatus,
    organizing_pod_id: organizingPodId,
    upcoming_only: showAllEvents ? false : !showPastToggle, // Show all events regardless of date when showAllEvents is true
  });

  // Get batch registration status for all events (memoized to prevent re-renders)
  const eventIds = useMemo(
    () => allEvents.map((event) => event.id),
    [allEvents],
  );
  const { getRegistrationStatus } = useBatchEventRegistrationStatus(
    eventIds,
    refreshKey,
  );

  // Determine which events to show and loading state (memoized to prevent flickering)
  const { events, loading } = useMemo(() => {
    const error: string | null = null;

    if (showOnlyUserEvents) {
      // My Events: Show only events user is registered for (both upcoming and past)
      // Don't filter by time here - let the filteredEvents logic handle past/future separation
      return { events: registeredEvents || [], loading: tokenGatingLoading };
    } else if (showAllEvents) {
      // All Events: Show all events regardless of token gating
      return { events: allEvents || [], loading: eventsLoading };
    } else if (showTokenGating) {
      // Token-gated events only (for registration, so upcoming events primarily)
      return { events: visibleEvents || [], loading: tokenGatingLoading };
    } else {
      // Default fallback
      return { events: allEvents || [], loading: eventsLoading };
    }
  }, [
    showOnlyUserEvents,
    showAllEvents,
    showTokenGating,
    registeredEvents,
    registrableEvents,
    allEvents,
    visibleEvents,
    tokenGatingLoading,
    eventsLoading,
  ]);

  // Filter and sort events based on search and show past events setting
  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        // Handle search filtering first
        if (searchTerm && searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase().trim();
          const matchesSearch =
            event.title.toLowerCase().includes(searchLower) ||
            event.description.toLowerCase().includes(searchLower) ||
            (event.location &&
              event.location.toLowerCase().includes(searchLower)) ||
            (event.organizing_pod_id &&
              event.organizing_pod_id.toLowerCase().includes(searchLower));
          if (!matchesSearch) return false;
        }

        // Handle past/future filtering based on showPastToggle
        const now = new Date();
        const eventStartDate = new Date(event.event_date);

        // For events without end dates, add default duration to avoid immediate expiration
        const eventEndDate = event.event_end_date
          ? new Date(event.event_end_date)
          : new Date(eventStartDate.getTime() + 8 * 60 * 60 * 1000); // +8 hours if no end date

        // Determine event timing status
        const hasStarted = eventStartDate <= now;
        const hasEnded = eventEndDate < now;
        const isManuallyCompleted =
          event.status === 'cancelled' || event.status === 'completed';

        // Event states: upcoming -> ongoing -> past
        const isUpcomingEvent = !hasStarted && !isManuallyCompleted;
        const isOngoingEvent = hasStarted && !hasEnded && !isManuallyCompleted;
        const isPastEvent = hasEnded || isManuallyCompleted;

        // Enhanced debug logging for ALL events to identify the classification issue
        if (event.title.toLowerCase().includes('test')) {
          console.log('🔍 Event Classification Debug:', {
            title: event.title,
            id: event.id,
            eventStartDate: eventStartDate.toISOString(),
            eventEndDate: eventEndDate.toISOString(),
            now: now.toISOString(),
            hasStarted,
            hasEnded,
            isManuallyCompleted,
            eventState: isUpcomingEvent
              ? 'UPCOMING'
              : isOngoingEvent
                ? 'ONGOING'
                : 'PAST',
            timeDiffMinutes: Math.round(
              (eventEndDate.getTime() - now.getTime()) / 60000,
            ),
            status: event.status,
            finalIsPastEvent: isPastEvent,
            rawEventEndDate: event.event_end_date,
          });
        }

        // Debug logging to understand timing issues
        if (
          event.title.toLowerCase().includes('test') ||
          event.id.includes('1754963457566')
        ) {
          console.log('🕐 Event timing debug:', {
            title: event.title,
            eventStartDate: eventStartDate.toISOString(),
            eventEndDate: eventEndDate.toISOString(),
            originalEndDate: event.event_end_date,
            hasEndDate: !!event.event_end_date,
            now: now.toISOString(),
            status: event.status,
            isPastEvent,
            currentTime: now.getTime(),
            startTime: eventStartDate.getTime(),
            endTime: eventEndDate.getTime(),
            minutesUntilEnd: Math.round(
              (eventEndDate.getTime() - now.getTime()) / 60000,
            ),
          });
        }

        // Debug logging for completed events
        if (event.status === 'completed') {
          console.log('🔍 Found completed event:', {
            title: event.title,
            status: event.status,
            eventDate: eventStartDate.toISOString(),
            now: now.toISOString(),
            isPastEvent,
            showPastToggle,
            willShow: showPastToggle ? isPastEvent : !isPastEvent,
          });
        }

        if (showPastToggle) {
          // When showing past events, only show past events
          return isPastEvent;
        } else {
          // When not showing past events, show upcoming events only
          return !isPastEvent;
        }
      })
      .sort((a, b) => {
        const dateA = new Date(a.event_date);
        const dateB = new Date(b.event_date);

        if (showPastToggle) {
          // For past events: most recent first (descending order)
          return dateB.getTime() - dateA.getTime();
        } else {
          // For upcoming events: earliest first (ascending order)
          return dateA.getTime() - dateB.getTime();
        }
      })
      .slice(0, limit);
  }, [events, showPastToggle, searchTerm, limit]);

  // Since filteredEvents already handles past/future filtering,
  // we can use them directly, but still separate for display logic
  const { upcomingEvents, pastEvents } = useMemo(() => {
    if (showPastToggle) {
      // When showing past events page, all filteredEvents are past events
      return {
        upcomingEvents: [],
        pastEvents: filteredEvents,
      };
    } else if (showOnlyUserEvents) {
      // For "My Events", only show UPCOMING registered events (no past events)
      const now = new Date();
      const upcoming: EventWithStats[] = [];

      // Use registeredEvents but only include upcoming ones
      (registeredEvents || []).forEach((event) => {
        // Apply search filter if present
        if (searchTerm && searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase().trim();
          const matchesSearch =
            event.title.toLowerCase().includes(searchLower) ||
            event.description.toLowerCase().includes(searchLower) ||
            (event.location &&
              event.location.toLowerCase().includes(searchLower)) ||
            (event.organizing_pod_id &&
              event.organizing_pod_id.toLowerCase().includes(searchLower));
          if (!matchesSearch) return;
        }

        const eventStartDate = new Date(event.event_date);
        const eventEndDate = event.event_end_date
          ? new Date(event.event_end_date)
          : new Date(eventStartDate.getTime() + 8 * 60 * 60 * 1000);

        const isPastEvent =
          eventEndDate < now ||
          event.status === 'cancelled' ||
          event.status === 'completed';

        // Only include upcoming events in "My Events"
        if (!isPastEvent) {
          upcoming.push(event);
        }
      });

      return { upcomingEvents: upcoming, pastEvents: [] };
    } else {
      // When not showing past events, all filteredEvents are upcoming
      return {
        upcomingEvents: filteredEvents,
        pastEvents: [],
      };
    }
  }, [
    filteredEvents,
    showPastToggle,
    showOnlyUserEvents,
    registeredEvents,
    searchTerm,
  ]);

  // Get user registrations for visible events
  useEffect(() => {
    if (!address || !events.length) return;

    const fetchUserRegistrations = async () => {
      // This is a simplified version - in production you'd want to batch this
      const registrations: Record<string, EventRegistration> = {};

      // For now, we'll handle this in individual EventCard components
      // In a production app, you'd want to optimize this with a batch query

      setUserRegistrations(registrations);
    };

    fetchUserRegistrations();
  }, [address, events]);

  const handleRegisterClick = (event: EventWithStats) => {
    console.log('🔍 EventList - handleRegisterClick event data:', {
      id: event.id,
      title: event.title,
      blockchain_event_id: event.blockchain_event_id,
      hasBlockchainId: !!event.blockchain_event_id,
    });
    setSelectedEvent(event);
    setShowRegistrationModal(true);
  };

  const handleRegistrationSuccess = () => {
    setShowRegistrationModal(false);
    setSelectedEvent(null);
    // Force refresh of registration status data
    setRefreshKey((prev) => prev + 1);
  };

  if (loading && events.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const hasEvents =
    upcomingEvents.length > 0 || (showPastToggle && pastEvents.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search events by title, description, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Results Indicator */}
      {searchTerm && searchTerm.trim() && (
        <div className="text-sm text-gray-600">
          {filteredEvents.length === 0 ? (
            <p>No events found matching "{searchTerm}"</p>
          ) : (
            <p>
              {filteredEvents.length} event
              {filteredEvents.length !== 1 ? 's' : ''} found matching "
              {searchTerm}"
            </p>
          )}
        </div>
      )}

      {/* Events List */}
      {hasEvents ? (
        <div className="space-y-8">
          {/* Upcoming Events - show if NOT showing past events toggle */}
          {!showPastToggle && upcomingEvents.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Upcoming Events ({upcomingEvents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={`upcoming-${event.id}`}
                    event={event}
                    userRegistration={
                      getRegistrationStatus(event.id).registration
                    }
                    registrationStatus={getRegistrationStatus(event.id)}
                    forceShowAll={showAllEvents}
                    onRegister={() => handleRegisterClick(event)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Events - show when showPastToggle is true OR when showAllEvents is true */}
          {(showPastToggle || showAllEvents) && pastEvents.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                Past Events ({pastEvents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastEvents.map((event) => (
                  <EventCard
                    key={`past-${event.id}`}
                    event={event}
                    userRegistration={
                      getRegistrationStatus(event.id).registration
                    }
                    registrationStatus={getRegistrationStatus(event.id)}
                    forceShowAll={showAllEvents}
                    showRegistrationButton={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {emptyMessage || 'No events found'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm
                ? 'Try adjusting your search terms or filters.'
                : showTokenGating
                  ? 'You may need specific tokens to view available events.'
                  : 'Check back later for new events.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Registration Modal */}
      {selectedEvent && (
        <EventRegistrationModal
          event={selectedEvent}
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={handleRegistrationSuccess}
          currentRegistrationCount={selectedEvent.registration_count || 0}
        />
      )}
    </div>
  );
};
