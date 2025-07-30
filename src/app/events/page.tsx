'use client';

import React, { useState } from 'react';
import { EventList } from '@/features/events/components/EventList';
import { useEventManagementAccess } from '@/features/events/hooks/useEventTokenGating';
import { useEventStats } from '@/features/events/hooks/useEventStats';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Plus, Users, Trophy } from 'lucide-react';
import Link from 'next/link';

export default function EventsPage() {
  const { canManageEvents } = useEventManagementAccess();
  const { upcomingEvents, totalParticipants, completedEvents, loading: statsLoading, error: statsError } = useEventStats();
  const [activeTab, setActiveTab] = useState<'all' | 'my-events' | 'past'>('my-events');

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Community Events
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover and participate in events organized by our DAO community. 
              From workshops to social gatherings, find events that match your interests and token holdings.
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
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{upcomingEvents}</p>
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
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{totalParticipants}</p>
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
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{completedEvents}</p>
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
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0">
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
                variant={activeTab === 'past' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('past')}
              >
                Past Events
              </Button>
            </div>

            {canManageEvents && (
              <Button asChild>
                <Link href="/events/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Event
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-8">
          {activeTab === 'my-events' && (
            <EventList
              showCreateButton={false}
              showTokenGating={true}
              showOnlyUserEvents={true}
              title=""
              emptyMessage="You haven't registered for any events yet."
            />
          )}

          {activeTab === 'all' && (
            <EventList
              showCreateButton={false}
              showTokenGating={false}
              showAllEvents={true}
              title=""
              emptyMessage="No events available. Check back later or create the first event!"
            />
          )}

          {activeTab === 'past' && (
            <EventList
              showCreateButton={false}
              showPastEvents={true}
              showTokenGating={false}
              showAllEvents={true}
              title=""
              emptyMessage="No past events to display."
            />
          )}
        </div>


        {/* Call to Action for Event Management */}
        {canManageEvents && (
          <Card className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="p-8 text-center">
              <h3 className="text-xl font-semibold mb-4">Ready to Create an Event?</h3>
              <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                As an event manager, you can create and organize events for the community. 
                Set up token gating, manage registrations, and distribute funds to the right pods.
              </p>
              <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4">
                <Button asChild>
                  <Link href="/events/create">
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Event
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/events/manage">
                    Manage My Events
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}