'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
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
} from 'lucide-react';

import type { EventWithStats, EventRegistration } from '../types/event';
import {
  useEvents,
  useEventRegistrations,
  useEventActions,
} from '../hooks/useEvents';
import { useEventManagementAccess } from '../hooks/useEventTokenGating';
import { EventService } from '../lib/supabase';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import Link from 'next/link';
import { unifiedNotificationService as notificationService } from '@/services/unifiedNotificationService';
import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import EventManagerABI from '@/abis/EventManager.json';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

interface EventManagementDashboardProps {
  eventId?: string;
}

export const EventManagementDashboard: React.FC<
  EventManagementDashboardProps
> = ({ eventId }) => {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();
  const { canManageEvents, managedPods } = useEventManagementAccess();
  // Load all events - RLS policies will automatically filter to user's events
  const {
    events: allEvents,
    loading: eventsLoading,
    error: eventsError,
  } = useEvents();

  // Debug logging
  console.log('EventManagementDashboard Debug:', {
    address,
    canManageEvents,
    managedPods,
    allEvents,
    eventsLoading,
    eventsError,
  });

  const [selectedEvent, setSelectedEvent] = useState<EventWithStats | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    'overview' | 'registrations' | 'analytics'
  >('overview');
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);

  // Filter events based on user's management permissions
  const managedEvents = allEvents.filter(
    (event) =>
      event.creator_address.toLowerCase() === address?.toLowerCase() ||
      (event.organizing_pod_id &&
        managedPods.some((pod) => pod.id === event.organizing_pod_id)),
  );

  const upcomingEvents = managedEvents.filter(
    (event) =>
      new Date(event.event_date) > new Date() && event.status === 'published',
  );

  const draftEvents = managedEvents.filter((event) => event.status === 'draft');
  const completedEvents = managedEvents.filter(
    (event) => event.status === 'completed',
  );

  // Calculate total donations from paid events
  const calculateTotalDonations = () => {
    return managedEvents.reduce((total, event) => {
      if (event.price_token === 'free') return total;

      const systemAmount =
        Number.parseFloat(event.price_amount || '0') * event.registration_count;
      const selfAmount =
        Number.parseFloat(event.price_self_amount || '0') *
        event.registration_count;

      return total + systemAmount + selfAmount;
    }, 0);
  };

  const totalDonations = calculateTotalDonations();

  // Export attendees functionality
  const handleExportAttendees = async () => {
    try {
      const csvData = await generateAttendeesCSV(managedEvents);
      downloadCSV(
        csvData,
        `attendees-export-${new Date().toISOString().split('T')[0]}.csv`,
      );
    } catch (error) {
      console.error('Failed to export attendees:', error);
    }
  };

  const generateAttendeesCSV = async (events: EventWithStats[]) => {
    const headers = [
      'Event Title',
      'Event Date',
      'Attendee Wallet',
      'Registration Status',
      'Payment Amount',
      'Payment Token',
      'Registered At',
      'Checked In At',
    ];

    const rows = [];
    for (const event of events) {
      try {
        const registrations = await EventService.getEventRegistrations(
          event.id,
        );
        for (const reg of registrations) {
          rows.push([
            event.title,
            new Date(event.event_date).toLocaleDateString(),
            reg.user_address,
            reg.registration_status,
            reg.payment_amount,
            reg.payment_token,
            new Date(reg.registered_at).toLocaleDateString(),
            reg.checked_in_at
              ? new Date(reg.checked_in_at).toLocaleDateString()
              : '',
          ]);
        }
      } catch (error) {
        console.error(
          `Failed to fetch registrations for event ${event.id}:`,
          error,
        );
      }
    }

    return [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');
  };

  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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

  if (!address) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Connect Wallet</h2>
          <p className="text-gray-600 mb-4">
            Please connect your wallet to access the event management dashboard.
          </p>
          <Button asChild={true}>
            <Link href="/events">View Public Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canManageEvents) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You need event management permissions to access this dashboard.
          </p>
          <Button asChild={true}>
            <Link href="/events">View Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (eventsLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-4">
          <p className="text-gray-600">Loading events...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (eventsError) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Error Loading Events</h2>
          <p className="text-gray-600 mb-4">{eventsError}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Event Management</h1>
        </div>
        <Button asChild={true}>
          <Link href="/events/create">
            <Calendar className="w-4 h-4 mr-2" />
            Create Event
          </Link>
        </Button>
      </div>

      {/* Overview Stats - More useful metrics */}
      <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <Play
              className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1"
              style={{ color: '#3F7A5A' }}
            />
            <p className="text-lg sm:text-xl font-bold text-gray-900">
              {upcomingEvents.length}
            </p>
            <p className="text-xs text-gray-600">Active Events</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <Users
              className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1"
              style={{ color: '#6A5F7A' }}
            />
            <p className="text-lg sm:text-xl font-bold text-gray-900">
              {managedEvents.reduce(
                (sum, event) => sum + (event.registration_count || 0),
                0,
              )}
            </p>
            <p className="text-xs text-gray-600">Total Registrations</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <CheckCircle
              className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1"
              style={{ color: '#2F5D50' }}
            />
            <p className="text-lg sm:text-xl font-bold text-gray-900">
              {completedEvents.length}
            </p>
            <p className="text-xs text-gray-600">Completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <DollarSign
              className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1"
              style={{ color: '#C6933F' }}
            />
            <p className="text-lg sm:text-xl font-bold text-gray-900">
              {totalDonations > 0 ? `${totalDonations.toFixed(0)} ETH` : 'Free'}
            </p>
            <p className="text-xs text-gray-600">Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button className="h-auto py-4 flex-col" asChild={true}>
              <Link href="/events/create">
                <Calendar className="w-6 h-6 mb-2" />
                <span>Create New Event</span>
              </Link>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col"
              disabled={managedEvents.length === 0}
              onClick={() => {
                if (managedEvents.length === 1) {
                  // If only one event, redirect directly to its check-in page
                  window.location.href = `/events/manage/${managedEvents[0].id}/checkin`;
                } else {
                  // Show QR code selection modal for multiple events
                  setShowQRCodeModal(true);
                }
              }}
            >
              <QrCode className="w-6 h-6 mb-2" />
              <span>Event Check-in Codes</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col"
              onClick={() => handleExportAttendees()}
            >
              <Download className="w-6 h-6 mb-2" />
              <span>Export Attendee List</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Management */}
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as 'overview' | 'registrations' | 'analytics')
        }
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Event Overview</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Draft Events */}
          {draftEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Edit className="w-5 h-5 mr-2" />
                  Draft Events ({draftEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {draftEvents.map((event) => (
                    <EventManagementRow
                      key={event.id}
                      event={event}
                      isDraft={true}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Upcoming Events ({upcomingEvents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-4">No upcoming events</p>
                  <Button asChild={true}>
                    <Link href="/events/create">Create Your First Event</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <EventManagementRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Completed Events */}
          {completedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Completed Events ({completedEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedEvents.map((event) => (
                    <EventManagementRow
                      key={event.id}
                      event={event}
                      isCompleted={true}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="registrations" className="space-y-6">
          <RegistrationManagement events={managedEvents} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <EventAnalytics events={managedEvents} />
        </TabsContent>
      </Tabs>

      {/* QR Code Selection Modal */}
      <Dialog open={showQRCodeModal} onOpenChange={setShowQRCodeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Select Event for Check-in
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose which event you want to access check-in codes for:
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {managedEvents
                .filter((event) => event.status === 'published')
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      window.location.href = `/events/manage/${event.id}/checkin`;
                    }}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(event.event_date).toLocaleDateString()} •{' '}
                        {event.registration_count} registered
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(event.status)}>
                        {event.status}
                      </Badge>
                      <QrCode className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))}
            </div>
            {managedEvents.filter((event) => event.status === 'published')
              .length === 0 && (
              <div className="text-center py-8">
                <QrCode className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No published events available</p>
                <p className="text-xs text-gray-400 mt-2">
                  Only published events can generate check-in codes
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowQRCodeModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Event Management Row Component
interface EventManagementRowProps {
  event: EventWithStats;
  isDraft?: boolean;
  isCompleted?: boolean;
}

const EventManagementRow: React.FC<EventManagementRowProps> = ({
  event,
  isDraft = false,
  isCompleted = false,
}) => {
  const { publishEvent, cancelEvent, completeEvent, loading } = useEventActions(
    event.id,
  );
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellingEvent, setCancellingEvent] = useState(false);
  const [organizerProfile, setOrganizerProfile] = useState<{
    first_name?: string;
    last_name?: string;
  } | null>(null);

  // Fetch organizer profile for notification
  useEffect(() => {
    const fetchOrganizerProfile = async () => {
      if (!event?.creator_address) return;
      try {
        const profile = await EventService.getUserProfileByWallet(
          event.creator_address,
        );
        setOrganizerProfile(profile);
      } catch (error) {
        console.error('Failed to fetch organizer profile:', error);
      }
    };
    fetchOrganizerProfile();
  }, [event?.creator_address]);

  const { getCancelEventCall } = useSimplifiedEventTransactions();
  const [showSmartContractCancel, setShowSmartContractCancel] = useState(false);

  // CDP-based blockchain event cancellation
  const handleCdpCancelEvent = async (blockchainEventId: string) => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found',
        variant: 'destructive',
      });
      return;
    }

    setCancellingEvent(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      const EVENT_MANAGER_CONTRACT = CONTRACT_ADDRESSES.EVENT_MANAGER;

      console.log('🚀 Cancelling event on blockchain via CDP:', {
        eventId: blockchainEventId,
        contract: EVENT_MANAGER_CONTRACT,
      });

      // Encode the cancelEvent call
      const callData = encodeFunctionData({
        abi: EventManagerABI,
        functionName: 'cancelEvent',
        args: [blockchainEventId],
      });

      // Send user operation with CDP paymaster (gasless)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: EVENT_MANAGER_CONTRACT as `0x${string}`,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Event cancelled on blockchain:', result);

      // Now cancel in database
      const success = await cancelEvent();

      setCancellingEvent(false);
      setShowCancelDialog(false);
      setShowSmartContractCancel(false);

      if (success) {
        toast({
          title: 'Event Cancelled',
          description: 'Event cancelled successfully. Refunds will be processed automatically.',
          variant: 'success',
        });
      }
    } catch (error: any) {
      console.error('❌ Event cancellation failed:', error);

      setCancellingEvent(false);

      let errorMessage = 'Event cancellation failed';
      if (error.shortMessage) errorMessage = error.shortMessage;
      else if (error.message) errorMessage = error.message;

      toast({
        title: 'Cancellation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleEventCancellation = async (
    eventToCancel: EventWithStats,
  ): Promise<boolean> => {
    try {
      // 1. Get all registrations for the event
      const registrations = await EventService.getEventRegistrations(
        eventToCancel.id,
      );

      // 2. If event has blockchain_event_id, cancel on smart contract first
      if (eventToCancel.blockchain_event_id) {
        // Show smart contract cancellation interface
        setShowSmartContractCancel(true);
        return false; // Prevent modal from closing - smart contract transaction will handle completion
      }

      // 3. Cancel the event in Supabase (for legacy events without blockchain ID)
      const success = await cancelEvent();
      if (!success) return false;

      // 4. Send notifications to all registered attendees
      const organizerName =
        organizerProfile?.first_name && organizerProfile?.last_name
          ? `${organizerProfile.first_name} ${organizerProfile.last_name}`
          : `${event.creator_address.substring(0, 6)}...${event.creator_address.substring(38)}`;

      for (const registration of registrations) {
        if (registration.registration_status === 'registered') {
          await notificationService.createNotification({
            recipient_address: registration.user_address,
            sender_address: event.creator_address,
            notification_type: 'bounty_update',
            title: 'Event Cancelled',
            message: `The event "${eventToCancel.title}" has been cancelled by ${organizerName}. Any payments will be refunded automatically.`,
            context_type: 'marketplace',
            context_id: eventToCancel.id,
            context_url: `/events/${eventToCancel.id}`,
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Error in handleEventCancellation:', error);
      return false;
    }
  };

  const handleSmartContractCancellationSuccess = async (
    eventToCancel: EventWithStats,
  ) => {
    try {
      // 1. Update Supabase status
      await EventService.cancelEvent(eventToCancel.id);

      // 2. Send notifications
      const registrations = await EventService.getEventRegistrations(
        eventToCancel.id,
      );
      const organizerName =
        organizerProfile?.first_name && organizerProfile?.last_name
          ? `${organizerProfile.first_name} ${organizerProfile.last_name}`
          : `${event.creator_address.substring(0, 6)}...${event.creator_address.substring(38)}`;

      for (const registration of registrations) {
        if (registration.registration_status === 'registered') {
          await notificationService.createNotification({
            recipient_address: registration.user_address,
            sender_address: event.creator_address,
            notification_type: 'bounty_update',
            title: 'Event Cancelled',
            message: `The event "${eventToCancel.title}" has been cancelled by ${organizerName}. Refunds have been processed automatically.`,
            context_type: 'marketplace',
            context_id: eventToCancel.id,
            context_url: `/events/${eventToCancel.id}`,
          });
        }
      }

      setShowSmartContractCancel(false);
      setShowCancelDialog(false);
      alert(
        'Event cancelled successfully. Attendees have been notified and refunds processed.',
      );
      window.location.reload();
    } catch (error) {
      console.error('Error in post-cancellation cleanup:', error);
      alert(
        'Event was cancelled on blockchain but some cleanup failed. Please refresh the page.',
      );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
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

  return (
    <div className="p-4 border rounded-lg hover:bg-gray-50 space-y-3">
      {/* Header with title and status */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-1">
            <h3 className="font-semibold text-lg">{event.title}</h3>
            <Badge className={getStatusColor(event.status)}>
              {event.status}
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            {formatDate(event.event_date)} at {formatTime(event.event_date)}
          </div>
        </div>
      </div>

      {/* Event details */}
      <div className="flex items-center space-x-4 text-sm text-gray-600">
        <span className="flex items-center">
          <Users className="w-4 h-4 mr-1" />
          {event.registration_count} registered
        </span>
        {event.price_token !== 'free' && (
          <span className="flex items-center">
            <DollarSign className="w-4 h-4 mr-1" />
            {event.price_amount} {event.price_token}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center space-x-2 pt-2">
        <Button variant="outline" size="sm" asChild={true}>
          <Link href={`/events/${event.id}`}>
            <Eye className="w-4 h-4 mr-1" />
            View
          </Link>
        </Button>

        <Button variant="outline" size="sm" asChild={true}>
          <Link href={`/events/manage/${event.id}/edit`}>
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Link>
        </Button>

        {isDraft && (
          <Button
            size="sm"
            onClick={async () => {
              const success = await publishEvent();
              if (success) {
                // Refresh the page to show updated event status
                window.location.reload();
              }
            }}
            disabled={loading}
          >
            <Play className="w-4 h-4 mr-1" />
            {loading ? 'Publishing...' : 'Publish'}
          </Button>
        )}

        {!isDraft && !isCompleted && (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
              disabled={loading || cancellingEvent}
            >
              <XCircle className="w-4 h-4 mr-1" />
              {cancellingEvent ? 'Cancelling...' : 'Cancel'}
            </Button>

            {/* Cancel Confirmation Dialog */}
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Cancel Event</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    <strong>Warning:</strong> Canceling this event will:
                  </p>
                  <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                    <li>Notify all registered attendees</li>
                    <li>Process automatic refunds for paid registrations</li>
                    <li>Mark the event as cancelled permanently</li>
                  </ul>
                  <p
                    className="text-sm font-medium"
                    style={{ color: '#8B3A3A' }}
                  >
                    This action cannot be undone.
                  </p>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelDialog(false)}
                    >
                      Keep Event
                    </Button>
                    {showSmartContractCancel ? (
                      <Button
                        variant="destructive"
                        onClick={() => handleCdpCancelEvent(event.blockchain_event_id || event.id)}
                        disabled={cancellingEvent}
                        className="text-white"
                      >
                        {cancellingEvent ? 'Cancelling...' : 'Cancel Event on Blockchain'}
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          setCancellingEvent(true);
                          try {
                            const success =
                              await handleEventCancellation(event);
                            if (success) {
                              setShowCancelDialog(false);
                              alert(
                                'Event cancelled successfully. Attendees have been notified.',
                              );
                              window.location.reload();
                            } else if (!showSmartContractCancel) {
                              alert(
                                'Failed to cancel event. Please try again.',
                              );
                            }
                          } catch (error) {
                            console.error('Error cancelling event:', error);
                            alert(
                              'An error occurred while cancelling the event.',
                            );
                          } finally {
                            setCancellingEvent(false);
                          }
                        }}
                        disabled={cancellingEvent}
                      >
                        {cancellingEvent ? 'Cancelling...' : 'Cancel Event'}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {event.status === 'published' &&
          new Date(event.event_date) < new Date() && (
            <Button
              size="sm"
              onClick={() => completeEvent()}
              disabled={loading}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Complete
            </Button>
          )}
      </div>
    </div>
  );
};

// Registration Management Component
interface RegistrationManagementProps {
  events: EventWithStats[];
}

const RegistrationManagement: React.FC<RegistrationManagementProps> = ({
  events,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const { registrations, loading } = useEventRegistrations(selectedEventId);
  const [showNotifyAllModal, setShowNotifyAllModal] = useState(false);
  const [notifyAllMessage, setNotifyAllMessage] = useState('');
  const [sendingNotifyAll, setSendingNotifyAll] = useState(false);

  // Get selected event
  const selectedEvent = events.find((event) => event.id === selectedEventId);

  // Set initial event ID when events load
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  console.log('🔍 Registration Management Debug:', {
    eventsCount: events.length,
    selectedEventId,
    registrationsCount: registrations.length,
    loading,
    eventIds: events.map((e) => e.id),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Registration Management</h3>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': '#2F5D50' } as React.CSSProperties}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

      {/* Notify All Button */}
      {selectedEventId && registrations.length > 0 && (
        <div className="flex justify-center">
          <Button
            onClick={() => setShowNotifyAllModal(true)}
            className="hover:opacity-90"
            style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
          >
            <Bell className="w-4 h-4 mr-2" />
            Notify All Attendees ({registrations.length})
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-200 rounded"></div>
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No registrations yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {registrations.map((registration) => (
                <RegistrationCard
                  key={registration.id}
                  registration={registration}
                  selectedEvent={selectedEvent}
                  selectedEventId={selectedEventId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notify All Modal */}
      <Dialog open={showNotifyAllModal} onOpenChange={setShowNotifyAllModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notify All Attendees</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Send a message to all {registrations.length} registered attendees
            </p>
            <textarea
              value={notifyAllMessage}
              onChange={(e) =>
                setNotifyAllMessage(e.target.value.slice(0, 300))
              }
              placeholder="Enter your message (max 300 characters)"
              className="w-full p-3 border rounded-lg resize-none h-24"
              maxLength={300}
            />
            <div className="text-right text-xs text-gray-500">
              {notifyAllMessage.length}/300 characters
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowNotifyAllModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!notifyAllMessage.trim()) return;
                  setSendingNotifyAll(true);
                  try {
                    // Send notification to all registered attendees
                    const notificationPromises = registrations.map(
                      (registration) =>
                        notificationService.createNotification({
                          recipient_address: registration.user_address,
                          sender_address:
                            selectedEvent?.creator_address || address || '',
                          notification_type: 'bounty_update',
                          title: 'Event Update',
                          message: notifyAllMessage.trim(),
                          context_type: 'marketplace',
                          context_id: selectedEventId,
                          context_url: `/events/${selectedEventId}`,
                        }),
                    );

                    await Promise.all(notificationPromises);
                    alert(
                      `Message sent to all ${registrations.length} attendees: ${notifyAllMessage}`,
                    );
                    setShowNotifyAllModal(false);
                    setNotifyAllMessage('');
                  } catch (error) {
                    console.error('Failed to send notifications:', error);
                    alert('Failed to send notifications');
                  } finally {
                    setSendingNotifyAll(false);
                  }
                }}
                disabled={!notifyAllMessage.trim() || sendingNotifyAll}
              >
                {sendingNotifyAll
                  ? 'Sending...'
                  : `Send to All (${registrations.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Registration Card Component
interface RegistrationCardProps {
  registration: EventRegistration;
  selectedEvent?: EventWithStats;
  selectedEventId: string;
}

const RegistrationCard: React.FC<RegistrationCardProps> = ({
  registration,
  selectedEvent,
  selectedEventId,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const [userProfile, setUserProfile] = useState<{
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await EventService.getUserProfileByWallet(
          registration.user_address,
        );
        setUserProfile(profile);
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [registration.user_address]);

  const handleSendNotification = async () => {
    if (!notificationMessage.trim()) return;

    setSendingNotification(true);
    try {
      await notificationService.createNotification({
        recipient_address: registration.user_address,
        sender_address: selectedEvent?.creator_address || address || '',
        notification_type: 'bounty_update',
        title: 'Event Update',
        message: notificationMessage.trim(),
        context_type: 'marketplace',
        context_id: selectedEventId,
        context_url: `/events/${selectedEventId}`,
      });

      alert(
        `Notification sent to ${userProfile?.first_name || 'attendee'}: ${notificationMessage}`,
      );
      setShowNotificationModal(false);
      setNotificationMessage('');
    } catch (error) {
      console.error('Failed to send notification:', error);
      alert('Failed to send notification');
    } finally {
      setSendingNotification(false);
    }
  };

  const displayName = loading
    ? 'Loading...'
    : userProfile?.first_name || userProfile?.last_name
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
      : `${registration.user_address.substring(0, 6)}...${registration.user_address.substring(38)}`;

  return (
    <>
      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
            {userProfile?.profile_picture ? (
              <img
                src={userProfile.profile_picture}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/images/symbolobinfin.png';
                }}
              />
            ) : (
              <img
                src="/images/symbolobinfin.png"
                alt={displayName}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div>
            <p className="font-medium">{displayName}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge
            variant={
              registration.registration_status === 'completed'
                ? 'default'
                : registration.registration_status === 'checked_in'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {registration.registration_status}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNotificationModal(true)}
          >
            <Bell className="w-4 h-4 mr-1" />
            Notify
          </Button>
        </div>
      </div>

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
              Send a message to {displayName}
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
    </>
  );
};

// Event Analytics Component
interface EventAnalyticsProps {
  events: EventWithStats[];
}

const EventAnalytics: React.FC<EventAnalyticsProps> = ({ events }) => {
  const totalEvents = events.length;
  const totalRegistrations = events.reduce(
    (sum, event) => sum + event.registration_count,
    0,
  );
  const averageRegistrations =
    totalEvents > 0 ? totalRegistrations / totalEvents : 0;
  const completedEvents = events.filter((e) => e.status === 'completed').length;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Event Analytics</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold" style={{ color: '#2F5D50' }}>
              {totalEvents}
            </p>
            <p className="text-sm text-gray-600">Total Events</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold" style={{ color: '#3F7A5A' }}>
              {totalRegistrations}
            </p>
            <p className="text-sm text-gray-600">Total Registrations</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold" style={{ color: '#6A5F7A' }}>
              {averageRegistrations.toFixed(1)}
            </p>
            <p className="text-sm text-gray-600">Avg per Event</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold" style={{ color: '#C6933F' }}>
              {completedEvents}
            </p>
            <p className="text-sm text-gray-600">Completed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(event.event_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{event.registration_count}</p>
                  <p className="text-sm text-gray-600">registrations</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
