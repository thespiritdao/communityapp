'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Clock, DollarSign, Lock } from 'lucide-react';
import { EventWithStats, EventRegistration } from '../types/event';
import { useEventAccess } from '../hooks/useEventTokenGating';

interface EventCardProps {
  event: EventWithStats;
  userRegistration?: EventRegistration | null;
  showRegistrationButton?: boolean;
  forceShowAll?: boolean; // For "All Events" view - show card even if user can't access
  onRegister?: () => void;
  onViewDetails?: () => void;
  compact?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  userRegistration,
  showRegistrationButton = true,
  forceShowAll = false,
  onRegister,
  onViewDetails,
  compact = false
}) => {
  const { canView, canRegister, loading } = useEventAccess(event);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-500';
      case 'draft':
        return 'bg-yellow-500';
      case 'cancelled':
        return 'bg-red-500';
      case 'completed':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getRegistrationStatusColor = (status?: string) => {
    switch (status) {
      case 'registered':
        return 'bg-blue-500';
      case 'checked_in':
        return 'bg-green-500';
      case 'completed':
        return 'bg-purple-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const isUpcoming = new Date(event.event_date) > new Date();
  const isPastEvent = new Date(event.event_date) < new Date();

  if (loading) {
    return (
      <Card className="w-full animate-pulse">
        <CardHeader>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </CardHeader>
        <CardContent>
          <div className="h-20 bg-gray-200 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  if (!canView && !forceShowAll) {
    return (
      <Card className="w-full opacity-60 border-dashed">
        <CardContent className="p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-gray-500 font-medium">Token Gated Event</p>
          <p className="text-sm text-gray-400">You need specific tokens to view this event</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full hover:shadow-lg transition-shadow ${compact ? 'max-w-sm' : 'max-w-md'}`}>
      <CardHeader className="relative">
        <div className="absolute top-2 right-2 flex gap-2">
          <Badge 
            variant="secondary" 
            className={`${getStatusColor(event.status)} text-white`}
          >
            {event.status}
          </Badge>
          {userRegistration && (
            <Badge 
              variant="outline"
              className={`${getRegistrationStatusColor(userRegistration.registration_status)} text-white border-none`}
            >
              {userRegistration.registration_status}
            </Badge>
          )}
        </div>
        
        <CardTitle className="pr-20">{event.title}</CardTitle>
        
        <div className="flex items-center text-sm text-gray-600 space-x-4">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-1" />
            {formatDate(event.event_date)}
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            {formatTime(event.event_date)}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <p className={`text-gray-700 mb-4 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
          {event.description}
        </p>

        <div className="space-y-2">
          {event.location && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="w-4 h-4 mr-2" />
              {event.location}
            </div>
          )}

          <div className="flex items-center text-sm text-gray-600">
            <Users className="w-4 h-4 mr-2" />
            {event.registration_count} registered
            {event.max_attendees && ` of ${event.max_attendees}`}
          </div>

          {event.price_token !== 'free' && (
            <div className="flex items-center text-sm text-gray-600">
              <DollarSign className="w-4 h-4 mr-2" />
              {event.price_amount} {event.price_token}
            </div>
          )}

          {event.required_tokens && event.required_tokens.length > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <Lock className="w-4 h-4 mr-2" />
              Token gated
            </div>
          )}
        </div>

        {/* Registration Status Info */}
        {userRegistration && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">
              Registration Status: {userRegistration.registration_status}
            </div>
            <div className="text-xs text-gray-500">
              Registered: {formatDate(userRegistration.registered_at)}
            </div>
            {userRegistration.checked_in_at && (
              <div className="text-xs text-gray-500">
                Checked in: {formatDate(userRegistration.checked_in_at)}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between items-center">
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewDetails}
            asChild
          >
            <Link href={`/events/${event.id}`}>
              View Details
            </Link>
          </Button>
        </div>

        {showRegistrationButton && isUpcoming && !userRegistration && (
          <div className="flex flex-col items-end space-y-1">
            <Button
              size="sm"
              onClick={onRegister}
              disabled={!canRegister || event.status !== 'published'}
              className={`${
                canRegister && event.status === 'published'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {canRegister ? 'Register' : 'Cannot Register'}
            </Button>
            {!canRegister && forceShowAll && event.required_tokens && event.required_tokens.length > 0 && (
              <p className="text-xs text-gray-500 text-right">
                You do not hold the required tokens for this event
              </p>
            )}
          </div>
        )}

        {userRegistration && userRegistration.registration_status === 'registered' && isUpcoming && (
          <Button
            variant="destructive"
            size="sm"
          >
            Cancel Registration
          </Button>
        )}

        {isPastEvent && (
          <Badge variant="secondary">Past Event</Badge>
        )}
      </CardFooter>
    </Card>
  );
};