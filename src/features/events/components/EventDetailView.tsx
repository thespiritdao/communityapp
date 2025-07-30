'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  MapPin, 
  Users, 
  DollarSign, 
  Clock, 
  User, 
  Edit,
  Share2,
  Download,
  QrCode
} from 'lucide-react';

import { EventWithStats, EventRegistration, EventAgenda } from '../types/event';
import { EventRegistrationModal } from './EventRegistrationModal';
import { useEvent, useEventRegistration } from '../hooks/useEvents';
import { useEventAgendas } from '../hooks/useEvents';
import { useEventAccess } from '../hooks/useEventTokenGating';
import { useAccount } from 'wagmi';
import Link from 'next/link';

interface EventDetailViewProps {
  eventId: string;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({ eventId }) => {
  const { address } = useAccount();
  const { event, loading: eventLoading, error: eventError } = useEvent(eventId);
  const { registration, registerForEvent, loading: registrationLoading } = useEventRegistration(eventId);
  const { agendas, loading: agendasLoading } = useEventAgendas(eventId);
  const { canView, canRegister, canManage } = useEventAccess(event);

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-500';
      case 'draft': return 'bg-yellow-500';
      case 'cancelled': return 'bg-red-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const isUpcoming = event ? new Date(event.event_date) > new Date() : false;
  const isPastEvent = event ? new Date(event.event_date) < new Date() : false;
  const isEventFull = event?.max_attendees ? event.registration_count >= event.max_attendees : false;

  if (eventLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
          <p className="text-gray-600 mb-4">
            The event you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <Button asChild>
            <Link href="/events">View All Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Access Restricted</h2>
          <p className="text-gray-600 mb-4">
            You need specific tokens to view this event.
          </p>
          <Button asChild>
            <Link href="/events">View Available Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h1 className="text-3xl font-bold">{event.title}</h1>
            <Badge className={`${getStatusColor(event.status)} text-white`}>
              {event.status}
            </Badge>
            {registration && (
              <Badge variant="outline">
                {registration.registration_status}
              </Badge>
            )}
          </div>
          <p className="text-gray-600">
            Created by {event.creator_address.substring(0, 6)}...{event.creator_address.substring(38)}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          
          {canManage && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/events/manage/${event.id}`}>
                <Edit className="w-4 h-4 mr-2" />
                Manage
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agenda">Agenda</TabsTrigger>
              <TabsTrigger value="attendees">Attendees</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>About This Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none">
                    <p className="text-gray-700 leading-relaxed">
                      {event.description}
                    </p>
                  </div>
                  
                  {event.event_image_url && (
                    <div className="mt-6">
                      <img
                        src={event.event_image_url}
                        alt={event.title}
                        className="w-full h-64 object-cover rounded-lg"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Event Requirements */}
              {event.required_tokens && event.required_tokens.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Requirements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 mb-3">
                        This event requires the following tokens:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {event.required_tokens.map((tokenId) => (
                          <Badge key={tokenId} variant="secondary">
                            {tokenId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="agenda" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Event Agenda</CardTitle>
                </CardHeader>
                <CardContent>
                  {agendasLoading ? (
                    <div className="animate-pulse space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-gray-200 rounded"></div>
                      ))}
                    </div>
                  ) : agendas.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No agenda items have been added yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {agendas.map((agenda) => (
                        <div key={agenda.id} className="border-l-4 border-blue-500 pl-4 py-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{agenda.title}</h4>
                            <div className="flex items-center text-sm text-gray-600">
                              <Clock className="w-4 h-4 mr-1" />
                              {agenda.start_time}
                              {agenda.end_time && ` - ${agenda.end_time}`}
                            </div>
                          </div>
                          {agenda.description && (
                            <p className="text-gray-600 mt-1">{agenda.description}</p>
                          )}
                          <p className="text-sm text-gray-500 mt-1">
                            {formatDate(agenda.agenda_date)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attendees" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Registered Attendees</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">
                      Attendee list will be available closer to the event date.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Event Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-3 text-blue-500" />
                <div>
                  <p className="font-medium">{formatDate(event.event_date)}</p>
                  <p className="text-sm text-gray-600">{formatTime(event.event_date)}</p>
                </div>
              </div>

              {event.event_end_date && (
                <div className="flex items-center">
                  <Clock className="w-5 h-5 mr-3 text-orange-500" />
                  <div>
                    <p className="font-medium">Ends</p>
                    <p className="text-sm text-gray-600">{formatDateTime(event.event_end_date)}</p>
                  </div>
                </div>
              )}

              {event.location && (
                <div className="flex items-center">
                  <MapPin className="w-5 h-5 mr-3 text-green-500" />
                  <div>
                    <p className="font-medium">Location</p>
                    <p className="text-sm text-gray-600">{event.location}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <Users className="w-5 h-5 mr-3 text-purple-500" />
                <div>
                  <p className="font-medium">Attendees</p>
                  <p className="text-sm text-gray-600">
                    {event.registration_count} registered
                    {event.max_attendees && ` of ${event.max_attendees} max`}
                  </p>
                </div>
              </div>

              {event.price_token !== 'free' && (
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 mr-3 text-yellow-500" />
                  <div>
                    <p className="font-medium">Price</p>
                    <p className="text-sm text-gray-600">
                      {event.price_amount} {event.price_token}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <User className="w-5 h-5 mr-3 text-gray-500" />
                <div>
                  <p className="font-medium">Organizer</p>
                  <p className="text-sm text-gray-600">
                    {event.creator_address.substring(0, 6)}...{event.creator_address.substring(38)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Registration Card */}
          <Card>
            <CardContent className="p-6">
              {registration ? (
                <div className="text-center space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-medium text-green-800">You're Registered!</p>
                    <p className="text-sm text-green-600">
                      Status: {registration.registration_status}
                    </p>
                  </div>
                  
                  {registration.registration_status === 'registered' && isUpcoming && (
                    <Button variant="destructive" className="w-full">
                      Cancel Registration
                    </Button>
                  )}
                  
                  <Button variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Add to Calendar
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  {!isUpcoming ? (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="font-medium text-gray-800">Event has ended</p>
                      <p className="text-sm text-gray-600">
                        This event took place on {formatDate(event.event_date)}
                      </p>
                    </div>
                  ) : isEventFull ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="font-medium text-yellow-800">Event is Full</p>
                      <p className="text-sm text-yellow-600">
                        This event has reached maximum capacity
                      </p>
                    </div>
                  ) : canRegister ? (
                    <>
                      <Button 
                        className="w-full"
                        onClick={() => setShowRegistrationModal(true)}
                        disabled={registrationLoading}
                      >
                        {registrationLoading ? 'Processing...' : 'Register Now'}
                      </Button>
                      <p className="text-xs text-gray-500">
                        {event.price_token === 'free' 
                          ? 'Free registration' 
                          : `${event.price_amount} ${event.price_token}`}
                      </p>
                    </>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="font-medium text-red-800">Cannot Register</p>
                      <p className="text-sm text-red-600">
                        You don't meet the requirements for this event
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Code for Check-in (if registered) */}
          {registration && registration.registration_status === 'registered' && isUpcoming && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <QrCode className="w-5 h-5 mr-2" />
                  Check-in QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="w-32 h-32 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">
                  Show this QR code at the event for check-in
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Registration Modal */}
      <EventRegistrationModal
        event={event}
        isOpen={showRegistrationModal}
        onClose={() => setShowRegistrationModal(false)}
        onSuccess={() => {
          setShowRegistrationModal(false);
          // Refetch event data
        }}
      />
    </div>
  );
};