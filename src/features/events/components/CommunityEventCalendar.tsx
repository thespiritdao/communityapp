'use client';

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Users, CheckCircle } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useTokenGatedEvents } from '../hooks/useEventTokenGating';
import { useBatchEventRegistrationStatus } from '../hooks/useEventRegistrationStatus';
import { EventRegistrationModal } from './EventRegistrationModal';

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_end_date?: string;
  location: string;
  max_attendees?: number;
  price_amount: string;
  price_token: string;
  required_tokens: string[];
  organizing_pod_id: string;
  event_image_url?: string;
  organizer?: {
    name: string;
    avatar_url?: string;
  };
  organizing_pod?: {
    name: string;
  };
  current_attendees?: number;
}

interface CommunityEventCalendarProps {
  showCreateButton?: boolean;
  onCreateEvent?: () => void;
}

export const CommunityEventCalendar: React.FC<CommunityEventCalendarProps> = ({
  showCreateButton = false,
  onCreateEvent
}) => {
  const { address } = useAccount();
  const { events, loading: eventsLoading, error: eventsError } = useEvents();
  const { visibleEvents, registrableEvents, loading: tokenLoading } = useTokenGatedEvents();
  
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  // Calendar only shows upcoming events
  const [tokenAccess, setTokenAccess] = useState<{[eventId: string]: boolean}>({});

  // Use token-gated events if available, otherwise fall back to all events (memoized)
  const eventsToShow = useMemo(() => {
    return registrableEvents && registrableEvents.length > 0 ? registrableEvents : (events || []);
  }, [registrableEvents, events]);
  
  // Filter events - calendar only shows upcoming events (memoized to prevent infinite loops)
  const filteredEvents = useMemo(() => {
    return eventsToShow.filter(event => {
      const eventDate = new Date(event.event_date);
      const now = new Date();
      
      // Only show future events that are not cancelled or completed
      return eventDate >= now && event.status !== 'cancelled' && event.status !== 'completed';
    }).sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  }, [eventsToShow]);

  // Get batch registration status for all events (memoized to prevent re-renders)
  const eventIds = useMemo(() => filteredEvents.map(event => event.id), [filteredEvents]);
  const { getRegistrationStatus } = useBatchEventRegistrationStatus(eventIds);

  // Set token access - since we're using registrableEvents, assume all have access
  useEffect(() => {
    const accessResults: {[eventId: string]: boolean} = {};
    
    filteredEvents.forEach(event => {
      // Since we're using registrableEvents from the token gating hook,
      // we can assume the user has access to these events
      accessResults[event.id] = true;
    });
      
    setTokenAccess(accessResults);
  }, [filteredEvents]);

  const handleRegisterClick = (event: Event) => {
    setSelectedEvent(event);
    setShowRegistrationModal(true);
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const getEventPrice = (event: Event) => {
    if (event.price_token === 'free' || Number.parseFloat(event.price_amount) === 0) {
      return 'Free';
    }
    return `${event.price_amount} ${event.price_token}`;
  };

  const canUserRegister = (event: Event) => {
    if (!address) return false;
    if (event.required_tokens.length === 0) return true;
    return tokenAccess[event.id] === true;
  };

  const getAccessRequirement = (event: Event) => {
    if (event.required_tokens.length === 0) return null;
    return `Requires: ${event.required_tokens.join(', ')}`;
  };


  if (eventsLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 rounded-full animate-spin mx-auto mb-4" style={{ border: '4px solid #2F5D50', borderTopColor: 'transparent' }}></div>
          <p className="text-gray-600">Loading community events...</p>
        </CardContent>
      </Card>
    );
  }

  if (eventsError) {
    return (
      <Card className="w-full">
        <CardContent className="p-8 text-center">
          <p style={{ color: '#8B3A3A' }}>Error loading events: {eventsError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Create Event Button */}
          {showCreateButton && (
            <Button
              onClick={onCreateEvent}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: '#2F5D50' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6F8F86'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2F5D50'}
            >
              Create Event
            </Button>
          )}
        </div>
      </div>

      {/* Events Grid */}
      {filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Events Found</h3>
            <p className="text-gray-600">
              There are no upcoming events at the moment.
            </p>
            {showCreateButton && (
              <Button
                onClick={onCreateEvent}
                className="mt-4 text-white hover:opacity-90"
                style={{ backgroundColor: '#2F5D50' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6F8F86'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2F5D50'}
              >
                Create First Event
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const { date, time } = formatEventDate(event.event_date);
            const userCanRegister = canUserRegister(event);
            const accessRequirement = getAccessRequirement(event);
            const { registration, isRegistered } = getRegistrationStatus(event.id);
            
            return (
              <Card 
                key={event.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleRegisterClick(event)}
              >
                {/* Event Image */}
                {event.event_image_url && (
                  <div className="aspect-video relative overflow-hidden rounded-t-lg">
                    <img 
                      src={event.event_image_url} 
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <CardContent className="p-4">
                  {/* Event Title */}
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2">
                    {event.title}
                  </h3>
                  
                  {/* Event Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>{time}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="w-4 h-4 mr-2" />
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                    )}
                    {event.max_attendees && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="w-4 h-4 mr-2" />
                        <span>{event.current_attendees || 0}/{event.max_attendees} attendees</span>
                      </div>
                    )}
                  </div>

                  {/* Status and Price */}
                  <div className="mb-3 flex items-center space-x-2">
                  <Badge
                    variant={event.status === 'published' ? 'default' : 'secondary'}
                    className={
                      event.status === 'cancelled'
                        ? 'bg-gradient-to-r from-[#E8CBCB] to-[#D9B3B3] text-black'
                        : event.status === 'completed'
                        ? 'bg-gradient-to-r from-[#D1E6DC] to-[#B8D9CA] text-black'
                        : event.status === 'draft'
                        ? 'bg-gradient-to-r from-[#FAF4EC] to-[#F5EDD7] text-black'
                        : 'bg-gradient-to-r from-[#D1E6DC] to-[#B8D9CA] text-black' // published or default
                    }
                  >

                      {event.status}
                    </Badge>
                    <Badge variant={getEventPrice(event) === 'Free' ? 'secondary' : 'default'}>
                      {getEventPrice(event)}
                    </Badge>
                  </div>

                  {/* Access Requirements */}
                  {accessRequirement && (
                    <div className="mb-3">
                      <Badge 
                        variant={userCanRegister ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        {userCanRegister ? '✓ Eligible' : accessRequirement}
                      </Badge>
                    </div>
                  )}

                  {/* Organizing Pod */}
                  {event.organizing_pod?.name && (
                    <p className="text-xs text-gray-500 mb-3">
                      Organized by {event.organizing_pod.name}
                    </p>
                  )}

                  {/* Description Preview */}
                  <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                    {event.description}
                  </p>

                  {/* Action Button */}
                  <div className="space-y-2">
                    {isRegistered ? (
                      <div className="w-full flex items-center justify-center space-x-1 py-2" style={{ color: '#3F7A5A' }}>
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">You're Registered!</span>
                      </div>
                    ) : (
                      <>
                        {event.status === 'cancelled' ? (
                          <Badge variant="destructive" className="w-full justify-center py-2">
                            Cancelled Event
                          </Badge>
                        ) : new Date(event.event_date) < new Date() ? (
                          <Badge variant="secondary" className="w-full justify-center py-2">
                            Past Event
                          </Badge>
                        ) : (
                          <Button
                            className="w-full hover:opacity-90"
                            variant={userCanRegister ? 'default' : 'outline'}
                            disabled={!address || (!userCanRegister && event.required_tokens.length > 0)}
                            style={userCanRegister ? { backgroundColor: '#8FAAA1', color: '#FFFFFF' } : {}}
                            onMouseEnter={(e) => {if (userCanRegister) e.currentTarget.style.backgroundColor = '#6F8F86'}}
                            onMouseLeave={(e) => {if (userCanRegister) e.currentTarget.style.backgroundColor = '#8FAAA1'}}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegisterClick(event);
                            }}
                          >
                            {address ?
                             userCanRegister ? 'Details / Sign Up' :
                             'View Details' : 'Connect Wallet'}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Registration Modal */}
      {selectedEvent && (
        <EventRegistrationModal
          event={selectedEvent}
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={() => {
            setShowRegistrationModal(false);
            // Refresh events or show success message
          }}
          currentRegistrationCount={selectedEvent.registration_count || selectedEvent.current_attendees || 0}
        />
      )}
    </div>
  );
};