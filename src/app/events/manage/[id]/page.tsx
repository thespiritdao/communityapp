'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Calendar,
  Users,
  DollarSign,
  Eye,
  Edit,
  Play,
  CheckCircle,
  XCircle,
  Download,
  QrCode,
  Bell,
  ArrowLeft,
  Clock,
  UserCheck,
  User,
} from 'lucide-react';

import {
  useEvent,
  useEventRegistrations,
  useEventActions,
} from '@/features/events/hooks/useEvents';
import { useEventManagementAccess } from '@/features/events/hooks/useEventTokenGating';
import { EventService } from '@/features/events/lib/supabase';
import { unifiedNotificationService as notificationService } from '@/services/unifiedNotificationService';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import Link from 'next/link';

interface EventManagePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EventManagePage({ params }: EventManagePageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const {
    event,
    loading: eventLoading,
    error: eventError,
  } = useEvent(resolvedParams.id);
  const { registrations, loading: registrationsLoading } =
    useEventRegistrations(resolvedParams.id);
  const { canManageEvents } = useEventManagementAccess();
  const {
    publishEvent,
    cancelEvent,
    completeEvent,
    loading: actionLoading,
  } = useEventActions(resolvedParams.id);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'registrations' | 'analytics'
  >('overview');
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<any>(null);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
  };

  const formatFullDate = (dateString: string) => {
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
        return 'bg-gradient-to-r from-green-200 to-green-300 text-black';
      case 'draft':
        return 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-black';
      case 'cancelled':
        return 'bg-gradient-to-r from-red-200 to-red-300 text-black';
      case 'completed':
        return 'bg-gradient-to-r from-blue-200 to-blue-300 text-black';
      default:
        return 'bg-gradient-to-r from-gray-200 to-gray-300 text-black';
    }
  };

  const canUserManageEvent = () => {
    if (!event || !address) return false;
    return event.creator_address.toLowerCase() === address.toLowerCase();
  };

  // Fetch user profiles for registrations
  useEffect(() => {
    const fetchProfiles = async () => {
      if (!registrations.length) {
        setProfilesLoading(false);
        return;
      }

      setProfilesLoading(true);
      try {
        const profileMap = new Map();
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
              // Set a default profile with wallet address
              profileMap.set(registration.user_address, {
                wallet_address: registration.user_address,
                first_name: registration.user_address.slice(0, 6) + '...',
                last_name: '',
                profile_picture: null,
              });
            }
          }),
        );
        setProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching attendee profiles:', error);
      } finally {
        setProfilesLoading(false);
      }
    };

    if (registrations.length > 0) {
      fetchProfiles();
    } else {
      setProfilesLoading(false);
    }
  }, [registrations]);

  // Handle sending notification to individual attendee
  const handleSendNotification = async () => {
    if (!notificationMessage.trim() || !selectedRegistration) return;

    setSendingNotification(true);
    try {
      await notificationService.createNotification({
        recipient_address: selectedRegistration.user_address,
        sender_address: event?.creator_address || address || '',
        notification_type: 'event_update',
        title: 'Event Update',
        message: notificationMessage.trim(),
        context_type: 'events',
        context_id: resolvedParams.id,
        context_url: `/events/${resolvedParams.id}`,
      });

      const profile = profiles.get(selectedRegistration.user_address);
      const displayName =
        profile?.first_name ||
        selectedRegistration.user_address.slice(0, 6) + '...';
      alert(`Notification sent to ${displayName}: ${notificationMessage}`);
      setShowNotificationModal(false);
      setNotificationMessage('');
      setSelectedRegistration(null);
    } catch (error) {
      console.error('Failed to send notification:', error);
      alert('Failed to send notification');
    } finally {
      setSendingNotification(false);
    }
  };

  // Loading state
  if (eventLoading) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (eventError || !event) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
        <div className="max-w-7xl mx-auto">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
              <p className="text-gray-600 mb-4">
                The event you're looking for doesn't exist or you don't have
                permission to manage it.
              </p>
              <Button onClick={() => router.push('/events/manage')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Management
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Access control
  if (!canManageEvents || !canUserManageEvent()) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
        <div className="max-w-7xl mx-auto">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
              <p className="text-gray-600 mb-4">
                You don't have permission to manage this event.
              </p>
              <div className="space-x-4">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/events/${resolvedParams.id}`)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Event
                </Button>
                <Button onClick={() => router.push('/events')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  All Events
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Main component render
  return (
    <div className="min-h-screen p-4 pb-20" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          {/* Back Button and Title */}
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/events/manage')}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">{event.title}</h1>
          </div>

          {/* Status and Date */}
          <div className="flex items-center space-x-4">
            <Badge className={getStatusColor(event.status)}>
              {event.status}
            </Badge>

            <span className="flex items-center text-gray-600">
              <Calendar className="w-4 h-4 mr-1" />
              {formatDate(event.event_date)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild={true}>
              <Link href={`/events/${event.id}`}>
                <Eye className="w-4 h-4 mr-2" />
                View
              </Link>
            </Button>

            <Button variant="outline" asChild={true}>
              <Link href={`/events/manage/${event.id}/edit`}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Link>
            </Button>

            {event.status === 'draft' && (
              <Button onClick={() => publishEvent()} disabled={actionLoading}>
                <Play className="w-4 h-4 mr-2" />
                Publish
              </Button>
            )}

            {event.status === 'published' &&
              new Date(event.event_date) < new Date() && (
                <Button
                  onClick={() => completeEvent()}
                  disabled={actionLoading}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete
                </Button>
              )}

            {event.status === 'published' &&
              new Date(event.event_date) > new Date() && (
                <Button
                  variant="destructive"
                  onClick={() => cancelEvent()}
                  disabled={actionLoading}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
          </div>
        </div>

        {/* Overview Stats - 2x2 Layout */}
        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-blue-500 mb-1" />
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {event.registration_count}
              </p>
              <p className="text-xs text-gray-600">Registrations</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-green-500 mb-1" />
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {event.checked_in_count || 0}
              </p>
              <p className="text-xs text-gray-600">Check-ins</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-yellow-500 mb-1" />
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {event.price_token === 'free'
                  ? 'Free'
                  : `${event.price_amount} ${event.price_token}`}
              </p>
              <p className="text-xs text-gray-600">Donations</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-purple-500 mb-1" />
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {new Date(event.event_date) > new Date()
                  ? Math.ceil(
                      (new Date(event.event_date).getTime() -
                        new Date().getTime()) /
                        (1000 * 60 * 60 * 24),
                    )
                  : 0}{' '}
                days
              </p>
              <p className="text-xs text-gray-600">Next Event</p>
            </CardContent>
          </Card>
        </div>

        {/* Management Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'overview' | 'registrations' | 'analytics')}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Event Details */}
            <Card>
              <CardHeader>
                <CardTitle>Event Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-gray-600">{event.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Event Date</h4>
                    <p className="text-gray-600">
                      {formatFullDate(event.event_date)}
                    </p>
                  </div>

                  {event.location && (
                    <div>
                      <h4 className="font-medium mb-2">Location</h4>
                      <p className="text-gray-600">{event.location}</p>
                    </div>
                  )}

                  {event.max_attendees && (
                    <div>
                      <h4 className="font-medium mb-2">Max Attendees</h4>
                      <p className="text-gray-600">{event.max_attendees}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-2">Pricing</h4>
                    <p className="text-gray-600">
                      {event.price_token === 'free'
                        ? 'Free Event'
                        : `${event.price_amount} ${event.price_token}`}
                      {event.price_self_amount &&
                        ` + ${event.price_self_amount} SELF`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button className="h-auto py-4 flex-col" asChild={true}>
                    <Link href={`/events/manage/${event.id}/checkin`}>
                      <QrCode className="w-6 h-6 mb-2" />
                      <span>Check-in Management</span>
                    </Link>
                  </Button>

                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <Download className="w-6 h-6 mb-2" />
                    <span>Export Attendees</span>
                  </Button>

                  <Button variant="outline" className="h-auto py-4 flex-col">
                    <Bell className="w-6 h-6 mb-2" />
                    <span>Send Notifications</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Event Registrations</span>
                  <Badge variant="outline">{registrations.length} total</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {registrationsLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                ) : registrations.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No registrations yet</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Share your event to get people registered!
                    </p>
                  </div>
                ) : profilesLoading ? (
                  <div className="animate-pulse space-y-3">
                    {registrations.map((registration) => (
                      <div
                        key={registration.id}
                        className="flex items-center space-x-3"
                      >
                        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
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
                              {profile?.first_name || 'Anonymous'}{' '}
                              {profile?.last_name || ''}
                            </p>
                            <p className="text-xs text-gray-500">
                              {registration.user_address.slice(0, 6)}...
                              {registration.user_address.slice(-4)}
                            </p>
                            {registration.payment_amount !== '0' && (
                              <p className="text-xs text-gray-500">
                                Paid: {registration.payment_amount}{' '}
                                {registration.payment_token}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <Badge
                              variant={
                                registration.registration_status === 'completed'
                                  ? 'default'
                                  : registration.registration_status ===
                                      'checked_in'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-xs"
                            >
                              {registration.registration_status}
                            </Badge>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                setSelectedRegistration(registration);
                                setShowNotificationModal(true);
                              }}
                            >
                              <Bell className="w-3 h-3 mr-1" />
                              Notify
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Event Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-4">Registration Timeline</h4>
                    <div className="space-y-3">
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-4" />
                        <p>Registration analytics coming soon</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-4">Event Performance</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Registration Rate</span>
                        <span>
                          {event.max_attendees
                            ? Math.round(
                                (event.registration_count /
                                  event.max_attendees) *
                                  100,
                              )
                            : 100}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Check-in Rate</span>
                        <span>
                          {event.registration_count > 0
                            ? Math.round(
                                ((event.checked_in_count || 0) /
                                  event.registration_count) *
                                  100,
                              )
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completion Rate</span>
                        <span>
                          {event.registration_count > 0
                            ? Math.round(
                                ((event.completed_count || 0) /
                                  event.registration_count) *
                                  100,
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Notification Modal */}
        <Dialog
          open={showNotificationModal}
          onOpenChange={setShowNotificationModal}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send Notification</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Send a message to{' '}
                {selectedRegistration &&
                  (profiles.get(selectedRegistration.user_address)
                    ?.first_name ||
                    `${selectedRegistration.user_address.slice(0, 6)}...${selectedRegistration.user_address.slice(-4)}`)}
              </p>
              <textarea
                value={notificationMessage}
                onChange={(e) =>
                  setNotificationMessage(e.target.value.slice(0, 300))
                }
                placeholder="Enter your message (max 300 characters)"
                className="w-full p-3 border rounded-lg resize-none h-24"
                maxLength={300}
              />
              <div className="text-right text-xs text-gray-500">
                {notificationMessage.length}/300 characters
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowNotificationModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendNotification}
                  disabled={!notificationMessage.trim() || sendingNotification}
                >
                  {sendingNotification ? 'Sending...' : 'Send Notification'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
