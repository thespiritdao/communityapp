'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Eye, 
  Edit, 
  Trash2, 
  Play, 
  Pause,
  CheckCircle,
  XCircle,
  Download,
  QrCode,
  Bell
} from 'lucide-react';

import { EventWithStats, EventRegistration } from '../types/event';
import { useEvents, useEventRegistrations, useEventActions } from '../hooks/useEvents';
import { useEventManagementAccess } from '../hooks/useEventTokenGating';
import { useAccount } from 'wagmi';
import Link from 'next/link';

interface EventManagementDashboardProps {
  eventId?: string;
}

export const EventManagementDashboard: React.FC<EventManagementDashboardProps> = ({
  eventId
}) => {
  const { address } = useAccount();
  const { canManageEvents, managedPods } = useEventManagementAccess();
  const { events: allEvents, loading: eventsLoading } = useEvents({
    creator_address: address
  });

  const [selectedEvent, setSelectedEvent] = useState<EventWithStats | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'registrations' | 'analytics'>('overview');

  // Filter events based on user's management permissions
  const managedEvents = allEvents.filter(event => 
    event.creator_address.toLowerCase() === address?.toLowerCase() ||
    (event.organizing_pod_id && managedPods.some(pod => pod.id === event.organizing_pod_id))
  );

  const upcomingEvents = managedEvents.filter(event => 
    new Date(event.event_date) > new Date() && event.status === 'published'
  );
  
  const draftEvents = managedEvents.filter(event => event.status === 'draft');
  const completedEvents = managedEvents.filter(event => event.status === 'completed');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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

  if (!canManageEvents) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You need event management permissions to access this dashboard.
          </p>
          <Button asChild>
            <Link href="/events">View Events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (eventsLoading) {
    return (
      <div className="space-y-6">
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Event Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your events, registrations, and attendees
          </p>
        </div>
        <Button asChild>
          <Link href="/events/create">
            <Calendar className="w-4 h-4 mr-2" />
            Create Event
          </Link>
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Events</p>
                <p className="text-2xl font-bold">{managedEvents.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Upcoming</p>
                <p className="text-2xl font-bold">{upcomingEvents.length}</p>
              </div>
              <Play className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Registrations</p>
                <p className="text-2xl font-bold">
                  {managedEvents.reduce((sum, event) => sum + event.registration_count, 0)}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Revenue</p>
                <p className="text-2xl font-bold">$2,450</p>
              </div>
              <DollarSign className="h-8 w-8 text-yellow-500" />
            </div>
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
            <Button className="h-auto py-4 flex-col" asChild>
              <Link href="/events/create">
                <Calendar className="w-6 h-6 mb-2" />
                <span>Create New Event</span>
              </Link>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex-col">
              <QrCode className="w-6 h-6 mb-2" />
              <span>Generate Check-in Codes</span>
            </Button>
            
            <Button variant="outline" className="h-auto py-4 flex-col">
              <Download className="w-6 h-6 mb-2" />
              <span>Export Attendee List</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Management */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                    <EventManagementRow key={event.id} event={event} isDraft />
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
                  <Button asChild>
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
                    <EventManagementRow key={event.id} event={event} isCompleted />
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
  isCompleted = false 
}) => {
  const { publishEvent, cancelEvent, completeEvent, loading } = useEventActions(event.id);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
      <div className="flex-1">
        <div className="flex items-center space-x-3">
          <h3 className="font-semibold">{event.title}</h3>
          <Badge className={`${getStatusColor(event.status)} text-white`}>
            {event.status}
          </Badge>
        </div>
        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
          <span className="flex items-center">
            <Calendar className="w-4 h-4 mr-1" />
            {formatDate(event.event_date)}
          </span>
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
      </div>

      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/events/${event.id}`}>
            <Eye className="w-4 h-4 mr-1" />
            View
          </Link>
        </Button>

        <Button variant="outline" size="sm" asChild>
          <Link href={`/events/manage/${event.id}/edit`}>
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Link>
        </Button>

        {isDraft && (
          <Button 
            size="sm" 
            onClick={() => publishEvent()}
            disabled={loading}
          >
            <Play className="w-4 h-4 mr-1" />
            Publish
          </Button>
        )}

        {!isDraft && !isCompleted && (
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => cancelEvent()}
            disabled={loading}
          >
            <XCircle className="w-4 h-4 mr-1" />
            Cancel
          </Button>
        )}

        {event.status === 'published' && new Date(event.event_date) < new Date() && (
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

const RegistrationManagement: React.FC<RegistrationManagementProps> = ({ events }) => {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const { registrations, loading } = useEventRegistrations(selectedEventId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Registration Management</h3>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

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
                <div key={registration.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">
                      {registration.user_address.substring(0, 6)}...{registration.user_address.substring(38)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Registered: {new Date(registration.registered_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={
                      registration.registration_status === 'completed' ? 'default' :
                      registration.registration_status === 'checked_in' ? 'secondary' :
                      'outline'
                    }>
                      {registration.registration_status}
                    </Badge>
                    <Button variant="outline" size="sm">
                      <Bell className="w-4 h-4 mr-1" />
                      Notify
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Event Analytics Component
interface EventAnalyticsProps {
  events: EventWithStats[];
}

const EventAnalytics: React.FC<EventAnalyticsProps> = ({ events }) => {
  const totalEvents = events.length;
  const totalRegistrations = events.reduce((sum, event) => sum + event.registration_count, 0);
  const averageRegistrations = totalEvents > 0 ? totalRegistrations / totalEvents : 0;
  const completedEvents = events.filter(e => e.status === 'completed').length;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Event Analytics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-blue-600">{totalEvents}</p>
            <p className="text-sm text-gray-600">Total Events</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-green-600">{totalRegistrations}</p>
            <p className="text-sm text-gray-600">Total Registrations</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-purple-600">{averageRegistrations.toFixed(1)}</p>
            <p className="text-sm text-gray-600">Avg per Event</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-orange-600">{completedEvents}</p>
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