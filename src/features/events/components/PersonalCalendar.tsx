'use client';

import React, { useState, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, CheckCircle } from 'lucide-react';
import { useTokenGatedEvents } from '../hooks/useEventTokenGating';
import { useBatchEventRegistrationStatus } from '../hooks/useEventRegistrationStatus';
import { EventRegistrationModal } from './EventRegistrationModal';

interface PersonalCalendarProps {
  podId?: string; // if set, only show events from this pod
}

export const PersonalCalendar: React.FC<PersonalCalendarProps> = ({ podId }) => {
  const { evmAddress: address } = useEvmAddress();
  const { visibleEvents, registeredEvents, loading } = useTokenGatedEvents();

  const [showRegisteredOnly, setShowRegisteredOnly] = useState(false);
  const [filterPodId, setFilterPodId] = useState<string>(podId || '');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  // Derive unique pods from visible events for filter dropdown
  const podOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (visibleEvents || []).forEach((e: any) => {
      if (e.organizing_pod_id && e.organizing_pod?.name) {
        seen.set(e.organizing_pod_id, e.organizing_pod.name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [visibleEvents]);

  const registeredIds = useMemo(
    () => new Set((registeredEvents || []).map((e: any) => e.id)),
    [registeredEvents],
  );

  const now = new Date();

  const displayEvents = useMemo(() => {
    const base = showRegisteredOnly
      ? (registeredEvents || [])
      : (visibleEvents || []);

    return base
      .filter((e: any) => {
        if (new Date(e.event_date) < now) return false;
        if (e.status === 'cancelled' || e.status === 'completed') return false;
        if (filterPodId && e.organizing_pod_id !== filterPodId) return false;
        return true;
      })
      .sort((a: any, b: any) =>
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
      );
  }, [visibleEvents, registeredEvents, showRegisteredOnly, filterPodId]);

  const eventIds = useMemo(() => displayEvents.map((e: any) => e.id), [displayEvents]);
  const { getRegistrationStatus } = useBatchEventRegistrationStatus(eventIds);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 rounded-full animate-spin mx-auto mb-4" style={{ border: '4px solid #2F5D50', borderTopColor: 'transparent' }} />
          <p className="text-gray-600">Loading your calendar…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col items-center gap-3">
        {/* Toggle — centered */}
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
          <button
            onClick={() => setShowRegisteredOnly(false)}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={!showRegisteredOnly ? { backgroundColor: '#2F5D50', color: '#fff' } : { color: '#5F7A74' }}
          >
            All Accessible
          </button>
          <button
            onClick={() => setShowRegisteredOnly(true)}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={showRegisteredOnly ? { backgroundColor: '#2F5D50', color: '#fff' } : { color: '#5F7A74' }}
          >
            Registered Only
          </button>
        </div>

        {/* Pod filter — only show if not locked to a specific pod */}
        {!podId && podOptions.length > 0 && (
          <select
            value={filterPodId}
            onChange={(e) => setFilterPodId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            style={{ color: '#1A2E28' }}
          >
            <option value="">All Pods</option>
            {podOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Events */}
      {displayEvents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">
              {showRegisteredOnly ? 'No registered events coming up.' : 'No upcoming accessible events.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayEvents.map((event: any) => {
            const { date, time } = formatDate(event.event_date);
            const isRegistered = registeredIds.has(event.id);

            return (
              <Card
                key={event.id}
                onClick={() => { setSelectedEvent(event); setShowModal(true); }}
                className="cursor-pointer hover:shadow-md transition-shadow"
                style={isRegistered ? { borderColor: '#2F5D50', borderWidth: '2px' } : {}}
              >
                {event.event_image_url && (
                  <div className="aspect-video overflow-hidden rounded-t-lg">
                    <img src={event.event_image_url} alt={event.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-4 space-y-2">
                  {/* Registered badge */}
                  {isRegistered && (
                    <div className="flex items-center gap-1 text-sm font-medium" style={{ color: '#2F5D50' }}>
                      <CheckCircle size={14} />
                      <span>Registered</span>
                    </div>
                  )}

                  <h3 className="font-semibold text-gray-900 line-clamp-2">{event.title}</h3>

                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} />
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={13} />
                      <span>{time}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} />
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                    )}
                  </div>

                  {event.organizing_pod?.name && (
                    <p className="text-xs text-gray-400">by {event.organizing_pod.name}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <EventRegistrationModal
          event={selectedEvent}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={() => setShowModal(false)}
          currentRegistrationCount={selectedEvent.registration_count || 0}
        />
      )}
    </div>
  );
};
