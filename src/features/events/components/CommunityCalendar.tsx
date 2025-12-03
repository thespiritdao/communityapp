'use client';

import type React from 'react';
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Plus,
  Clock,
  MapPin,
  Users,
  Lock,
} from 'lucide-react';

import type { Event } from '../types/event';
import { EventRegistrationModal } from './EventRegistrationModal';
import { useTokenGatedEvents } from '../hooks/useEventTokenGating';
import { usePods } from '../hooks/useEventTokenGating';
import Link from 'next/link';

type CalendarView = 'month' | 'week' | 'day';

interface CommunityCalendarProps {
  showCreateButton?: boolean;
}

export const CommunityCalendar: React.FC<CommunityCalendarProps> = ({
  showCreateButton = false,
}) => {
  const { visibleEvents, loading } = useTokenGatedEvents();
  const { pods } = usePods();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [filterPod, setFilterPod] = useState<string>('');

  // Filter events based on selected pod
  const filteredEvents = useMemo(() => {
    return visibleEvents.filter((event) => {
      if (!filterPod) return true;
      return event.organizing_pod_id === filterPod;
    });
  }, [visibleEvents, filterPod]);

  // Group events by date for calendar display
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, Event[]> = {};

    filteredEvents.forEach((event) => {
      const dateKey = new Date(event.event_date).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });

    return grouped;
  }, [filteredEvents]);

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleRegisterClick = (event: Event) => {
    setSelectedEvent(event);
    setShowRegistrationModal(true);
  };

  const exportToGoogleCalendar = (event: Event) => {
    const startDate = new Date(event.event_date);
    const endDate = event.event_end_date
      ? new Date(event.event_end_date)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
      details: event.description,
      location: event.location || '',
      sf: 'true',
      output: 'xml',
    });

    window.open(
      `https://calendar.google.com/calendar/render?${params}`,
      '_blank',
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="h-96 bg-gray-200 rounded animate-pulse"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Community Calendar</h1>
          <p className="text-gray-600 mt-1">
            View all community events in calendar format
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          {showCreateButton && (
            <Button asChild={true}>
              <Link href="/events/create">
                <Plus className="w-4 h-4 mr-2" />
                Create Event
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1 bg-white rounded-lg border p-1">
            <Button
              variant={view === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('month')}
            >
              Month
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('week')}
            >
              Week
            </Button>
            <Button
              variant={view === 'day' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('day')}
            >
              Day
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handlePrevious}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[200px] text-center">
              {view === 'month' &&
                currentDate.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              {view === 'week' &&
                `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              {view === 'day' &&
                currentDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
            </h2>
            <Button variant="outline" size="sm" onClick={handleNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterPod}
            onChange={(e) => setFilterPod(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">All Pods</option>
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar Display */}
      <Card>
        <CardContent className="p-0">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              onEventClick={handleRegisterClick}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              onEventClick={handleRegisterClick}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              onEventClick={handleRegisterClick}
            />
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <CalendarIcon className="w-8 h-8" style={{ color: '#3F7A5A' }} />
              <div>
                <p className="text-2xl font-bold" style={{ color: '#3F7A5A' }}>
                  {
                    filteredEvents.filter(
                      (e) => new Date(e.event_date) > new Date(),
                    ).length
                  }
                </p>
                <p className="text-sm text-gray-600">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8" style={{ color: '#C6933F' }} />
              <div>
                <p className="text-2xl font-bold" style={{ color: '#C6933F' }}>
                  {filteredEvents.reduce(
                    (sum, event) =>
                      sum + ((event as any).registration_count ?? 0),
                    0,
                  )}
                </p>
                <p className="text-sm text-gray-600">Attendees</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Registration Modal */}
      {selectedEvent && (
        <EventRegistrationModal
          event={selectedEvent as any}
          isOpen={showRegistrationModal}
          onClose={() => {
            setShowRegistrationModal(false);
            setSelectedEvent(null);
          }}
          onSuccess={() => {
            setShowRegistrationModal(false);
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
};

// Month View Component
interface MonthViewProps {
  currentDate: Date;
  eventsByDate: Record<string, Event[]>;
  onEventClick: (event: Event) => void;
}

const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  eventsByDate,
  onEventClick,
}) => {
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const days = getDaysInMonth(currentDate);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-4">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdays.map((day) => (
          <div
            key={day}
            className="p-2 text-center text-sm font-medium text-gray-600"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div
            key={index}
            className="min-h-[120px] p-2 border border-gray-100 bg-white hover:bg-gray-50"
          >
            {day && (
              <>
                <div className="text-sm font-medium mb-1">{day.getDate()}</div>
                <div className="space-y-1">
                  {(eventsByDate[day.toDateString()] || [])
                    .slice(0, 3)
                    .map((event) => (
                      <div
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="text-xs p-1 rounded cursor-pointer truncate"
                        style={{ backgroundColor: '#E8F1EE', color: '#2F5D50' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = '#D1E6DC')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = '#E8F1EE')
                        }
                      >
                        {event.required_tokens &&
                          event.required_tokens.length > 0 && (
                            <Lock className="w-3 h-3 inline mr-1" />
                          )}
                        {event.title}
                      </div>
                    ))}
                  {(eventsByDate[day.toDateString()] || []).length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{(eventsByDate[day.toDateString()] || []).length - 3}{' '}
                      more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Week View Component
const WeekView: React.FC<MonthViewProps> = ({
  currentDate,
  eventsByDate,
  onEventClick,
}) => {
  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays(currentDate);

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day) => (
          <div key={day.toDateString()} className="min-h-[400px]">
            <div className="text-center font-medium mb-4 p-2 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="text-lg">{day.getDate()}</div>
            </div>
            <div className="space-y-2">
              {(eventsByDate[day.toDateString()] || []).map((event) => (
                <div
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="p-2 rounded cursor-pointer text-sm"
                  style={{ backgroundColor: '#E8F1EE', color: '#2F5D50' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#D1E6DC')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = '#E8F1EE')
                  }
                >
                  <div className="font-medium truncate">{event.title}</div>
                  <div className="text-xs">
                    {new Date(event.event_date).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Day View Component
const DayView: React.FC<MonthViewProps> = ({
  currentDate,
  eventsByDate,
  onEventClick,
}) => {
  const dayEvents = eventsByDate[currentDate.toDateString()] || [];

  return (
    <div className="p-6">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold">
          {currentDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </h3>
      </div>

      {dayEvents.length === 0 ? (
        <div className="text-center py-12">
          <CalendarIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No events scheduled for this day</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl mx-auto">
          {dayEvents.map((event) => (
            <Card
              key={event.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6" onClick={() => onEventClick(event)}>
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-semibold">{event.title}</h4>
                  <Badge
                    variant={
                      event.status === 'published' ? 'default' : 'secondary'
                    }
                  >
                    {event.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    {new Date(event.event_date).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>

                  {event.location && (
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-2" />
                      {event.location}
                    </div>
                  )}

                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    {(event as any).registration_count ?? 0} registered
                  </div>
                </div>

                <p className="text-gray-700 mt-3 line-clamp-2">
                  {event.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
