'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  CheckCircle,
  User,
  Hand,
  Lock,
} from 'lucide-react';
import type { EventWithStats, EventRegistration } from '../types/event';
import { useEventAccess } from '../hooks/useEventTokenGating';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { EventService } from '../lib/supabase';

interface EventCardProps {
  event: EventWithStats;
  userRegistration?: EventRegistration | null;
  showRegistrationButton?: boolean;
  forceShowAll?: boolean;
  onRegister?: () => void;
  onViewDetails?: () => void;
  compact?: boolean;
  registrationStatus?: {
    registration: EventRegistration | undefined;
    isRegistered: boolean;
  };
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  userRegistration,
  showRegistrationButton = true,
  forceShowAll = false,
  onRegister,
  onViewDetails,
  compact = false,
  registrationStatus,
}) => {
  const { canView, canRegister, loading } = useEventAccess(event);
  const { evmAddress: address } = useEvmAddress();

  // Fetch tokens from Supabase and store in state
  const [tokens, setTokens] = useState<{ id: string; name: string }[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);

  useEffect(() => {
    const fetchTokens = async () => {
      setTokensLoading(true);
      try {
        const result = await EventService.getAllTokens(); // Should return [{id, name}, ...]
        setTokens(result || []);
      } catch (e) {
        console.error('Error loading tokens', e);
      } finally {
        setTokensLoading(false);
      }
    };
    fetchTokens();
  }, []);

  // Lookup function to map id -> token name
  const getTokenNameById = (id: string) => {
    const token = tokens.find((t) => t.id === id);
    return token ? token.name : id;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate event status (upcoming/ongoing/past)
  const getEventStatus = () => {
    const now = new Date();
    const eventStartDate = new Date(event.event_date);
    const eventEndDate = event.event_end_date
      ? new Date(event.event_end_date)
      : new Date(eventStartDate.getTime() + 8 * 60 * 60 * 1000);

    const hasStarted = eventStartDate <= now;
    const hasEnded = eventEndDate < now;
    const isManuallyCompleted =
      event.status === 'cancelled' || event.status === 'completed';

    if (isManuallyCompleted)
      return {
        status: 'completed',
        label: event.status === 'cancelled' ? 'Cancelled' : 'Completed',
        color: 'bg-gray-500',
      };
    if (!hasStarted)
      return { status: 'upcoming', label: 'Upcoming', color: 'bg-[#2F5D50]' };
    if (hasStarted && !hasEnded)
      return { status: 'ongoing', label: 'Ongoing', color: 'bg-[#3F7A5A]' };
    return { status: 'past', label: 'Past', color: 'bg-gray-500' };
  };

  const eventStatus = getEventStatus();

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

  const getRegistrationStatusColor = (status?: string) => {
    switch (status) {
      case 'registered':
        return 'bg-[#2F5D50]';
      case 'checked_in':
        return 'bg-[#3F7A5A]';
      case 'completed':
        return 'bg-[#2F5D50]';
      case 'cancelled':
        return 'bg-[#8B3A3A]';
      default:
        return 'bg-gray-500';
    }
  };

  const isUpcoming = new Date(event.event_date) > new Date();
  const isPastEvent = new Date(event.event_date) < new Date();

  const effectiveRegistration =
    registrationStatus?.registration || userRegistration;
  const effectiveIsRegistered =
    registrationStatus?.isRegistered ||
    (userRegistration !== null && userRegistration !== undefined);

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
    return null;
  }

  return (
    <Card className="w-full hover:shadow-lg transition-shadow max-w-md">
      <CardHeader className="relative">
        <div className="absolute top-2 right-2 flex gap-2">
          {/* Event Timing Status Badge */}
          <Badge className={`text-white ${eventStatus.color}`}>
            {eventStatus.label}
          </Badge>
          {/* Database Status Badge (for draft/published/cancelled) */}
          {event.status !== 'published' && (
            <Badge
              variant="secondary"
              className={`${getStatusColor(event.status)} text-white`}
            >
              {event.status}
            </Badge>
          )}
          {/* Registration Badge */}
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
        <p
          className={`text-gray-700 mb-4 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}
        >
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
        </div>

        {/* Host Info */}
        <HostInfo creatorAddress={event.creator_address} />

        {/* Requirements */}
        {event.required_tokens && event.required_tokens.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center text-sm text-gray-600">
              <Lock className="w-4 h-4 mr-1" />
              <span className="font-medium">Requirements:</span>
              {tokensLoading ? (
                <span className="ml-2 text-xs text-gray-400">
                  Loading requirements…
                </span>
              ) : (
                <span className="text-gray-700 ml-1">
                  {event.required_tokens.map((tokenId, index) => (
                    <span key={tokenId}>
                      {getTokenNameById(tokenId)}
                      {index < event.required_tokens.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between items-center">
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewDetails}
            asChild={true}
          >
            <Link href={`/events/${event.id}`}>View Details</Link>
          </Button>
        </div>

        {showRegistrationButton && isUpcoming && (
          <div className="flex flex-col items-end space-y-1">
            {effectiveIsRegistered ? (
              <div
                className="flex items-center space-x-1"
                style={{ color: '#3F7A5A' }}
              >
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">You're Registered!</span>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={onRegister}
                disabled={!canRegister || event.status !== 'published'}
                className={`${
                  canRegister && event.status === 'published'
                    ? 'hover:opacity-90'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
                style={{
                  backgroundColor:
                    canRegister && event.status === 'published'
                      ? '#8FAAA1'
                      : undefined,
                  color:
                    canRegister && event.status === 'published'
                      ? '#FFFFFF'
                      : undefined,
                }}
              >
                {canRegister ? 'Register' : 'Ineligible'}
              </Button>
            )}
            {!canRegister &&
              forceShowAll &&
              (event.required_tokens?.length ?? 0) > 0 &&
              null}
          </div>
        )}

        {isPastEvent && <Badge variant="secondary">Past Event</Badge>}
      </CardFooter>
    </Card>
  );
};

// HostInfo Component
interface HostInfoProps {
  creatorAddress: string;
}

const HostInfo: React.FC<HostInfoProps> = ({ creatorAddress }) => {
  const [hostProfile, setHostProfile] = useState<{
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHostProfile = async () => {
      if (!creatorAddress) return;
      try {
        setLoading(true);
        const profile =
          await EventService.getUserProfileByWallet(creatorAddress);
        setHostProfile(profile);
      } catch (error) {
        console.error('Failed to fetch host profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHostProfile();
  }, [creatorAddress]);

  const getHostDisplayName = () => {
    if (loading) return 'Loading...';
    if (hostProfile?.first_name || hostProfile?.last_name) {
      return `${hostProfile.first_name || ''} ${hostProfile.last_name || ''}`.trim();
    }
    return `${creatorAddress.substring(0, 6)}...${creatorAddress.substring(38)}`;
  };

  return (
    <div className="mt-4">
      <div className="flex items-center text-sm text-gray-600">
        <Hand className="w-4 h-4 mr-1" />
        <span className="font-medium mr-2">Host:</span>
        <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden mr-2">
          {hostProfile?.profile_picture ? (
            <img
              src={hostProfile.profile_picture}
              alt="Host"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <span>{getHostDisplayName()}</span>
      </div>
    </div>
  );
};
