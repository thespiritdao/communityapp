'use client';

import { useState } from 'react';
import { EventList } from '@/features/events/components/EventList';
import { PersonalCalendar } from '@/features/events/components/PersonalCalendar';
import { useEventManagementAccess } from '@/features/events/hooks/useEventTokenGating';
import { useEventStats } from '@/features/events/hooks/useEventStats';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Plus, Users, Trophy, CalendarDays, Settings } from 'lucide-react';
import Link from 'next/link';

export default function EventsPage() {
  const { canManageEvents } = useEventManagementAccess();
  const {
    upcomingEvents,
    totalParticipants,
    completedEvents,
    loading: statsLoading,
    error: statsError,
  } = useEventStats();
  const [activeTab, setActiveTab] = useState<
    'all' | 'my-events' | 'past' | 'my-calendar'
  >('my-events');

  return (
    <div className="min-h-screen p-4 bottom-nav-spacing" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Community Events
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover and participate in events organized by our DAO community.
              From workshops to social gatherings, find events that match your
              interests and token holdings.
            </p>
          </div>

          {/* Quick Stats - Compact 3-column layout */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 max-w-2xl mx-auto">
            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-blue-500 mb-1" />
                {statsLoading ? (
                  <div className="h-5 sm:h-6 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {upcomingEvents}
                  </p>
                )}
                <p className="text-xs text-gray-600">Upcoming</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-green-500 mb-1" />
                {statsLoading ? (
                  <div className="h-5 sm:h-6 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {totalParticipants}
                  </p>
                )}
                <p className="text-xs text-gray-600">Participants</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-purple-500 mb-1" />
                {statsLoading ? (
                  <div className="h-5 sm:h-6 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {completedEvents}
                  </p>
                )}
                <p className="text-xs text-gray-600">Completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Error display for stats */}
          {statsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-w-2xl mx-auto">
              <p className="text-red-600 text-sm text-center">
                Failed to load event statistics: {statsError}
              </p>
            </div>
          )}

          {/* Navigation Tabs - Centered */}
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 pt-4">
            <div className="flex justify-center mb-4 sm:mb-0">
              <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm">
                <Button
                  variant={activeTab === 'my-events' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('my-events')}
                >
                  My Events
                </Button>
                <Button
                  variant={activeTab === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('all')}
                >
                  All Events
                </Button>
                <Button
                  variant={activeTab === 'my-calendar' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('my-calendar')}
                >
                  <CalendarDays className="w-4 h-4 mr-1" />
                  Calendar
                </Button>
                <Button
                  variant={activeTab === 'past' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('past')}
                >
                  Past Events
                </Button>
              </div>
            </div>

            {canManageEvents && (
              <div className="flex space-x-2">
                <Button asChild={true}>
                  <Link href="/events/create">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Event
                  </Link>
                </Button>
                <Button variant="outline" asChild={true}>
                  <Link href="/events/manage">
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Events
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-8">
          {activeTab === 'my-events' && (
            <EventList
              key="my-events"
              showCreateButton={false}
              showTokenGating={true}
              showOnlyUserEvents={true}
              title=""
              emptyMessage="You haven't registered for any events yet."
            />
          )}

          {activeTab === 'all' && (
            <EventList
              key="all-events"
              showCreateButton={false}
              showTokenGating={false}
              showAllEvents={true}
              title=""
              emptyMessage="No events available. Check back later or create the first event!"
            />
          )}

          {activeTab === 'my-calendar' && (
            <div key="my-calendar">
              <PersonalCalendar />
            </div>
          )}

          {activeTab === 'past' && (
            <EventList
              key="past-events"
              showCreateButton={false}
              showPastEvents={true}
              showTokenGating={false}
              showAllEvents={true}
              title=""
              emptyMessage="No past events to display."
            />
          )}
        </div>
      </div>
    </div>
  );
}
