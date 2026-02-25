'use client';

import type React from 'react';
import { useState } from 'react';
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
  QrCode,
  ArrowLeft,
  CheckCircle,
  Video,
} from 'lucide-react';
import { EventRegistrationModal } from './EventRegistrationModal';
import { EventTokenDisplay } from './EventTokenDisplay';
import { EventConferenceSection } from '@/features/conference/components/EventConferenceSection';
import {
  useEvent,
  useEventRegistration,
  useEventRegistrations,
} from '../hooks/useEvents';
import { useEventAgendas } from '../hooks/useEvents';
import { useEventAccess } from '../hooks/useEventTokenGating';
import { useEventRegistrationStatus } from '../hooks/useEventRegistrationStatus';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import Link from 'next/link';
import { useState as useStateForProfile, useEffect } from 'react';
import { EventService } from '../lib/supabase';
import { QRCodeService } from '../services/QRCodeService';
import type { EventRegistration } from '../types/event';

interface EventDetailViewProps {
  eventId: string;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({
  eventId,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const {
    event,
    loading: eventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useEvent(eventId);
  const {
    registration,
    registerForEvent,
    loading: registrationLoading,
    refetch: refetchRegistration,
  } = useEventRegistration(eventId);
  const {
    registrations,
    loading: registrationsLoading,
    refetch: refetchRegistrations,
  } = useEventRegistrations(eventId);
  const { agendas, loading: agendasLoading } = useEventAgendas(eventId);
  const { canView, canRegister, canManage } = useEventAccess(event);
  const {
    registration: hookRegistration,
    isRegistered: hookIsRegistered,
    refetch: refetchRegistrationStatus,
  } = useEventRegistrationStatus(event?.id || null);

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [cancellingRegistration, setCancellingRegistration] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [qrCodeLoading, setQrCodeLoading] = useState(false);

  // Use hook data if available, fallback to original registration data
  const effectiveRegistration = hookRegistration || registration;
  const effectiveIsRegistered = hookIsRegistered || registration !== null;

  // Organizer profile state
  const [organizerProfile, setOrganizerProfile] = useStateForProfile<{
    first_name?: string;
    last_name?: string;
    user_id: string;
    wallet_address: string;
  } | null>(null);
  const [loadingProfile, setLoadingProfile] = useStateForProfile(false);

  // Fetch organizer profile when event loads
  useEffect(() => {
    const fetchOrganizerProfile = async () => {
      if (!event?.creator_address) return;

      try {
        setLoadingProfile(true);
        const profile = await EventService.getUserProfileByWallet(
          event.creator_address,
        );
        setOrganizerProfile(profile);
      } catch (error) {
        console.error('Failed to fetch organizer profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchOrganizerProfile();
  }, [event?.creator_address]);

  // Generate QR code when user is registered
  useEffect(() => {
    const generateQRCode = async () => {
      if (
        !effectiveRegistration ||
        !event ||
        effectiveRegistration.registration_status !== 'registered'
      ) {
        setQrCodeData('');
        return;
      }

      try {
        setQrCodeLoading(true);
        console.log(
          '🎫 Regenerating QR code with fixed structure for registration:',
          effectiveRegistration.id,
        );
        console.log('🎫 QR Generation Debug:', {
          currentEventId: event.id,
          currentEventTitle: event.title,
          registrationEventId: effectiveRegistration.event_id,
          registrationId: effectiveRegistration.id,
          matches: event.id === effectiveRegistration.event_id,
        });

        // Fetch user profile for proper userId
        const userProfile = await EventService.getUserProfileByWallet(
          effectiveRegistration.user_address,
        );
        console.log('👤 User profile for QR:', userProfile);

        const qrCodeURL = await QRCodeService.generateUserQRCode(
          event.id,
          effectiveRegistration,
          userProfile ?? undefined,
        );
        setQrCodeData(qrCodeURL);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeData('');
      } finally {
        setQrCodeLoading(false);
      }
    };

    generateQRCode();
  }, [effectiveRegistration, event]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const addToCalendar = () => {
    if (!event) return;

    const startDate = new Date(event.event_date);
    const endDate = event.event_end_date
      ? new Date(event.event_end_date)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${formatDate(startDate)}/${formatDate(endDate)}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location || '')}`;

    window.open(calendarUrl, '_blank');
  };

  const getOrganizerDisplayName = () => {
    if (loadingProfile) {
      return 'Loading organizer...';
    }

    if (organizerProfile?.first_name || organizerProfile?.last_name) {
      return `${organizerProfile.first_name || ''} ${organizerProfile.last_name || ''}`.trim();
    }

    // Fallback to wallet address
    return `${event?.creator_address.substring(0, 6)}...${event?.creator_address.substring(38)}`;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-gradient-to-r from-[#D1E6DC] to-[#B8D9CA] text-black';
      case 'draft':
        return 'bg-gradient-to-r from-[#FAF4EC] to-[#F5EDD7] text-black';
      case 'cancelled':
        return 'bg-gradient-to-r from-[#E8CBCB] to-[#D9B3B3] text-black';
      case 'completed':
        return 'bg-gradient-to-r from-[#D1E6DC] to-[#B8D9CA] text-black';
      default:
        return 'bg-gradient-to-r from-gray-200 to-gray-300 text-black';
    }
  };

  // Event is live/upcoming if it hasn't ended yet (use end date, not start date)
  const isUpcoming = event
    ? event.event_end_date
      ? new Date(event.event_end_date) > new Date()
      : new Date(event.event_date).getTime() + 8 * 60 * 60 * 1000 >
        new Date().getTime() // +8 hours if no end date
    : false;
  const isPastEvent = event ? new Date(event.event_date) < new Date() : false;
  const isEventFull = event?.max_attendees
    ? event.registration_count >= event.max_attendees
    : false;

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

  // Show error only if loading is complete and there's actually an error
  if (!eventLoading && (eventError || !event)) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
          <p className="text-gray-600 mb-4">
            The event you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button asChild={true}>
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
          <Button asChild={true}>
            <Link href="/events">View Available Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Type guard: at this point event must exist
  if (!event) {
    return null;
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
            {effectiveIsRegistered && (
              <Badge
                variant="outline"
                style={{
                  backgroundColor: '#E8F1EE',
                  color: '#3F7A5A',
                  borderColor: '#B8D9CA',
                }}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Registered
              </Badge>
            )}
          </div>
          <p className="text-gray-600">
            Created by {getOrganizerDisplayName()}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" asChild={true}>
            <Link href="/events">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>

          <Button variant="outline" size="sm">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>

          {canManage && (
            <Button variant="outline" size="sm" asChild={true}>
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
                <CardContent>
                  {event.event_image_url && (
                    <div className="mt-6">
                      <img
                        src={event.event_image_url}
                        alt={event.title}
                        className="w-full h-64 object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <div className="prose max-w-none">
                    <p className="text-gray-700 leading-relaxed">
                      {event.description}
                    </p>
                  </div>
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
                      <EventTokenDisplay
                        tokenIds={event.required_tokens}
                        showImages={true}
                        compact={false}
                      />
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
                        <div
                          key={agenda.id}
                          className="border-l-4 pl-4 py-2"
                          style={{ borderLeftColor: '#2F5D50' }}
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{agenda.title}</h4>
                            <div className="flex items-center text-sm text-gray-600">
                              <Clock className="w-4 h-4 mr-1" />
                              {agenda.start_time}
                              {agenda.end_time && ` - ${agenda.end_time}`}
                            </div>
                          </div>
                          {agenda.description && (
                            <p className="text-gray-600 mt-1">
                              {agenda.description}
                            </p>
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
                  <CardTitle>
                    Registered Attendees (
                    {
                      registrations.filter((r) =>
                        ['registered', 'checked_in', 'completed'].includes(
                          r.registration_status,
                        ),
                      ).length
                    }
                    )
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {registrationsLoading ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                          <div className="flex-1 space-y-1">
                            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : registrations.filter((r) =>
                      ['registered', 'checked_in', 'completed'].includes(
                        r.registration_status,
                      ),
                    ).length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-500">
                        No attendees registered yet.
                      </p>
                    </div>
                  ) : (
                    <AttendeeList
                      registrations={registrations.filter((r) =>
                        ['registered', 'checked_in', 'completed'].includes(
                          r.registration_status,
                        ),
                      )}
                    />
                  )}
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
                <Calendar
                  className="w-5 h-5 mr-3"
                  style={{ color: '#2F5D50' }}
                />
                <div>
                  <p className="font-medium">{formatDate(event.event_date)}</p>
                  <p className="text-sm text-gray-600">
                    {formatTime(event.event_date)}
                  </p>
                </div>
              </div>

              {event.event_end_date && (
                <div className="flex items-center">
                  <Clock
                    className="w-5 h-5 mr-3"
                    style={{ color: '#C6933F' }}
                  />
                  <div>
                    <p className="font-medium">Ends</p>
                    <p className="text-sm text-gray-600">
                      {formatDateTime(event.event_end_date)}
                    </p>
                  </div>
                </div>
              )}

              {event.location && (
                <div className="flex items-center">
                  {event.location === 'Virtual — In-App Conference Room' ? (
                    <Video
                      className="w-5 h-5 mr-3 flex-shrink-0"
                      style={{ color: '#2F5D50' }}
                    />
                  ) : (
                    <MapPin
                      className="w-5 h-5 mr-3 flex-shrink-0"
                      style={{ color: '#3F7A5A' }}
                    />
                  )}
                  <div>
                    <p className="font-medium">Location</p>
                    {event.location === 'Virtual — In-App Conference Room' ? (
                      <p className="text-sm font-medium" style={{ color: '#2F5D50' }}>
                        Virtual — In-App Conference Room
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600">{event.location}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <Users className="w-5 h-5 mr-3" style={{ color: '#6A5F7A' }} />
                <div>
                  <p className="font-medium">Attendees</p>
                  <p className="text-sm text-gray-600">
                    {
                      registrations.filter((r) =>
                        ['registered', 'checked_in', 'completed'].includes(
                          r.registration_status,
                        ),
                      ).length
                    }{' '}
                    registered
                    {event.max_attendees > 0 && ` of ${event.max_attendees} max`}
                  </p>
                </div>
              </div>

              {event.price_token !== 'free' && (
                <div className="flex items-center">
                  <DollarSign
                    className="w-5 h-5 mr-3"
                    style={{ color: '#C6933F' }}
                  />
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
                    {getOrganizerDisplayName()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Registration Card */}
          <Card>
            <CardContent className="p-6">
              {effectiveIsRegistered ? (
                <div className="text-center space-y-4">
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: '#E8F1EE',
                      border: '1px solid #B8D9CA',
                    }}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <CheckCircle
                        className="w-5 h-5"
                        style={{ color: '#3F7A5A' }}
                      />
                      <p className="font-medium" style={{ color: '#1F453A' }}>
                        You're Registered!
                      </p>
                    </div>
                    <p className="text-sm" style={{ color: '#3F7A5A' }}>
                      Status:{' '}
                      {effectiveRegistration?.registration_status ||
                        'registered'}
                    </p>
                  </div>

                  {effectiveRegistration?.registration_status ===
                    'registered' &&
                    isUpcoming && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={cancellingRegistration}
                        onClick={async () => {
                          if (!address || !event) return;

                          setCancellingRegistration(true);
                          try {
                            const success =
                              await EventService.cancelEventRegistration(
                                event.id,
                                address,
                              );
                            if (success) {
                              alert('Registration cancelled successfully');
                              // Refresh the data without reloading the page
                              await Promise.all([
                                refetchEvent(),
                                refetchRegistration(),
                                refetchRegistrations(),
                                refetchRegistrationStatus &&
                                  refetchRegistrationStatus(),
                              ]);
                            } else {
                              alert(
                                'Failed to cancel registration. Please try again.',
                              );
                            }
                          } catch (error) {
                            console.error(
                              'Error cancelling registration:',
                              error,
                            );
                            alert(
                              'An error occurred while cancelling registration.',
                            );
                          } finally {
                            setCancellingRegistration(false);
                          }
                        }}
                      >
                        {cancellingRegistration
                          ? 'Cancelling...'
                          : 'Cancel Registration'}
                      </Button>
                    )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addToCalendar}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Add to Calendar
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  {isUpcoming ? (
                    isEventFull ? (
                      <div
                        className="p-4 rounded-lg"
                        style={{
                          backgroundColor: '#FAF4EC',
                          border: '1px solid #F5EDD7',
                        }}
                      >
                        <p className="font-medium" style={{ color: '#9C7137' }}>
                          Event is Full
                        </p>
                        <p className="text-sm" style={{ color: '#C6933F' }}>
                          This event has reached maximum capacity
                        </p>
                      </div>
                    ) : canRegister ? (
                      <>
                        <Button
                          className="w-full hover:opacity-90"
                          onClick={() => setShowRegistrationModal(true)}
                          disabled={registrationLoading}
                          style={{
                            backgroundColor: '#2F5D50',
                            color: '#FFFFFF',
                          }}
                        >
                          {registrationLoading
                            ? 'Processing...'
                            : 'Register Now'}
                        </Button>
                        <p className="text-xs text-gray-500">
                          {event.price_token === 'free'
                            ? 'Free registration'
                            : `${event.price_amount} ${event.price_token}`}
                        </p>
                      </>
                    ) : (
                      <div
                        className="p-4 rounded-lg"
                        style={{
                          backgroundColor: '#F5E6E6',
                          border: '1px solid #E8CBCB',
                        }}
                      >
                        <p className="font-medium" style={{ color: '#8B3A3A' }}>
                          Cannot Register
                        </p>
                        <p className="text-sm" style={{ color: '#8B3A3A' }}>
                          You don't meet the requirements for this event
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="font-medium text-gray-800">
                        Event has ended
                      </p>
                      <p className="text-sm text-gray-600">
                        This event took place on {formatDate(event.event_date)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Meeting Room */}
          <EventConferenceSection
            eventId={event.id}
            eventTitle={event.title}
            walletAddress={address ?? undefined}
            isOrganizer={canManage}
            isRegistered={effectiveIsRegistered}
          />

          {/* QR Code for Check-in (if registered) */}
          {effectiveRegistration &&
            effectiveRegistration.registration_status === 'registered' &&
            isUpcoming && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <QrCode className="w-5 h-5 mr-2" />
                    Check-in QR Code
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  {qrCodeLoading ? (
                    <div className="w-32 h-32 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                      <div
                        className="animate-spin rounded-full h-8 w-8"
                        style={{ borderBottom: '2px solid #2F5D50' }}
                      ></div>
                    </div>
                  ) : qrCodeData ? (
                    <div className="space-y-4">
                      <img
                        src={qrCodeData}
                        alt="Check-in QR Code"
                        className="w-32 h-32 mx-auto border rounded-lg"
                      />
                      <p className="text-sm text-gray-600">
                        Show this QR code at the event for check-in
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.download = `${event.title}-checkin-qr.png`;
                          link.href = qrCodeData;
                          link.click();
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download QR Code
                      </Button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
        </div>
      </div>

      {/* Registration Modal */}
      <EventRegistrationModal
        event={event as any}
        isOpen={showRegistrationModal}
        onClose={() => setShowRegistrationModal(false)}
        onSuccess={() => {
          setShowRegistrationModal(false);
          // Refetch event data
        }}
        currentRegistrationCount={
          registrations.filter((r) =>
            ['registered', 'checked_in', 'completed'].includes(
              r.registration_status,
            ),
          ).length
        }
      />
    </div>
  );
};

// AttendeeList component to display registered attendees with profile info
interface AttendeeListProps {
  registrations: EventRegistration[];
}

const AttendeeList: React.FC<AttendeeListProps> = ({ registrations }) => {
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      const profileMap = new Map();

      try {
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              const profile = await EventService.getUserProfileByWallet(
                registration.user_address,
              );
              if (profile) {
                profileMap.set(registration.user_address, profile);
              }
            } catch (error) {
              console.warn(
                `Failed to fetch profile for ${registration.user_address}:`,
                error,
              );
              // Set a default profile without showing wallet address
              profileMap.set(registration.user_address, {
                wallet_address: registration.user_address,
                first_name: 'Anonymous',
                last_name: 'User',
                profile_picture: null,
              });
            }
          }),
        );
        setProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching attendee profiles:', error);
      } finally {
        setLoading(false);
      }
    };

    if (registrations.length > 0) {
      fetchProfiles();
    } else {
      setLoading(false);
    }
  }, [registrations]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {registrations.map((_, i) => (
          <div key={i} className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {registrations.map((registration) => {
        const profile = profiles.get(registration.user_address);
        return (
          <div
            key={registration.id}
            className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
          >
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {profile?.profile_picture ? (
                <img
                  src={profile.profile_picture}
                  alt={`${profile.first_name} ${profile.last_name}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">
                {profile?.first_name || 'Anonymous'} {profile?.last_name || ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                {new Date(registration.registered_at).toLocaleDateString()}
              </p>
              <span
                className="inline-block px-2 py-1 rounded-full text-xs"
                style={{
                  backgroundColor:
                    registration.registration_status === 'registered'
                      ? '#E8F1EE'
                      : registration.registration_status === 'checked_in'
                        ? '#D1E6DC'
                        : registration.registration_status === 'completed'
                          ? '#E8E4DC'
                          : '#f3f4f6',
                  color:
                    registration.registration_status === 'registered'
                      ? '#3F7A5A'
                      : registration.registration_status === 'checked_in'
                        ? '#2F5D50'
                        : registration.registration_status === 'completed'
                          ? '#6A5F7A'
                          : '#6b7280',
                }}
              >
                {registration.registration_status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
