'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Plus, Calendar, Users } from 'lucide-react';
import { EventCard } from './EventCard';
import { EventRegistrationModal } from './EventRegistrationModal';
import { useEvents } from '../hooks/useEvents';
import { useEventRegistration } from '../hooks/useEvents';
import { useTokenGatedEvents } from '../hooks/useEventTokenGating';
import { EventWithStats, EventRegistration } from '../types/event';
import { useAccount } from 'wagmi';
import Link from 'next/link';

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
  limit
}) => {
  const { address } = useAccount();
  const [showPastToggle, setShowPastToggle] = useState(showPastEvents);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventWithStats | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<Record<string, EventRegistration>>({});

  // Get events based on different modes
  const { visibleEvents, registrableEvents, loading: tokenGatingLoading } = useTokenGatedEvents();
  
  // Get all events
  const { events: allEvents, loading: eventsLoading } = useEvents({
    status: 'published',
    organizing_pod_id: organizingPodId,
    upcoming_only: !showPastToggle
  });

  // Determine which events to show and loading state
  let events: EventWithStats[] = [];
  let loading = false;
  let error: string | null = null;

  if (showOnlyUserEvents) {
    // My Events: Show only events user can register for (token-gated for them)
    events = registrableEvents || [];
    loading = tokenGatingLoading;
  } else if (showAllEvents) {
    // All Events: Show all events regardless of token gating
    events = allEvents || [];
    loading = eventsLoading;
  } else if (showTokenGating) {
    // Token-gated events only
    events = visibleEvents || [];
    loading = tokenGatingLoading;
  } else {
    // Default fallback
    events = allEvents || [];
    loading = eventsLoading;
  }

  // Filter events based on search and past/future
  const filteredEvents = events
    .filter(event => {
      if (!showPastToggle && new Date(event.event_date) < new Date()) {
        return false;
      }
      if (searchTerm) {
        return (
          event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      return true;
    })
    .slice(0, limit);

  // Separate upcoming and past events
  const upcomingEvents = filteredEvents.filter(event => new Date(event.event_date) >= new Date());
  const pastEvents = filteredEvents.filter(event => new Date(event.event_date) < new Date());

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
    setSelectedEvent(event);
    setShowRegistrationModal(true);
  };

  const handleRegistrationSuccess = () => {
    setShowRegistrationModal(false);
    setSelectedEvent(null);
    // Refetch events or update local state
  };

  // Show loading only for the initial load, not on subsequent errors
  const [hasLoaded, setHasLoaded] = useState(false);
  
  useEffect(() => {
    if (!loading && (events.length > 0 || !hasLoaded)) {
      setHasLoaded(true);
    }
  }, [loading, events.length, hasLoaded]);

  if (loading && !hasLoaded) {
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

  const hasEvents = upcomingEvents.length > 0 || (showPastToggle && pastEvents.length > 0);

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
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="showPast"
            checked={showPastToggle}
            onChange={(e) => setShowPastToggle(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="showPast" className="text-sm font-medium">
            Show past events
          </label>
        </div>
      </div>

      {/* Event Stats */}
      {hasEvents && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{upcomingEvents.length}</p>
                  <p className="text-sm text-gray-600">Upcoming</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {upcomingEvents.reduce((sum, event) => sum + event.registration_count, 0)}
                  </p>
                  <p className="text-sm text-gray-600">Registrations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {showPastToggle && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-2xl font-bold">{pastEvents.length}</p>
                    <p className="text-sm text-gray-600">Past Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {events.filter(e => e.required_tokens && e.required_tokens.length > 0).length}
                  </p>
                  <p className="text-sm text-gray-600">Token Gated</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Events List */}
      {!hasEvents ? (
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
      ) : (
        <div className="space-y-8">
          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Upcoming Events ({upcomingEvents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    userRegistration={userRegistrations[event.id]}
                    forceShowAll={showAllEvents}
                    onRegister={() => handleRegisterClick(event)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Events */}
          {showPastToggle && pastEvents.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                Past Events ({pastEvents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    userRegistration={userRegistrations[event.id]}
                    forceShowAll={showAllEvents}
                    showRegistrationButton={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Registration Modal */}
      {selectedEvent && (
        <EventRegistrationModal
          event={selectedEvent}
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={handleRegistrationSuccess}
        />
      )}
    </div>
  );
};