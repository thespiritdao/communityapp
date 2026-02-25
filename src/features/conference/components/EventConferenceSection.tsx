'use client';

// src/features/conference/components/EventConferenceSection.tsx
//
// Sidebar card shown on the event detail page.
// - Organizer sees "Start Meeting" when no live room exists
// - Organizer sees "End Meeting" when a live room exists
// - Registered attendees see "Join Meeting" when the room is live
// - Everyone else sees a "Meeting not started" placeholder
//
// When joined, <ConferenceRoom> mounts as a full-screen overlay above the page.

import React, { useState, useEffect, useCallback } from 'react';
import { Video, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConferenceRoom } from './ConferenceRoom';
import {
  createConferenceRoom,
  getRoomByEventId,
} from '../services/conferenceService';
import type { ConferenceRoom as ConferenceRoomType, ParticipantRole } from '../types/conference';

interface EventConferenceSectionProps {
  eventId: string;
  eventTitle: string;
  /** Wallet of the currently connected user */
  walletAddress: string | undefined;
  /** True if the current user is the event organiser or has manage access */
  isOrganizer: boolean;
  /** True if the current user has a valid registration for this event */
  isRegistered: boolean;
}

export const EventConferenceSection: React.FC<EventConferenceSectionProps> = ({
  eventId,
  eventTitle,
  walletAddress,
  isOrganizer,
  isRegistered,
}) => {
  const [room, setRoom] = useState<ConferenceRoomType | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRoom, setShowRoom] = useState(false);

  // ── Fetch existing room for this event ───────────────────────────────────
  const fetchRoom = useCallback(async () => {
    try {
      const result = await getRoomByEventId(eventId);
      if (result) {
        setRoom(result.room);
        setParticipantCount(result.participantCount);
      } else {
        setRoom(null);
      }
    } catch {
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchRoom();
    // Poll every 15s to pick up live status changes made by the organizer
    const interval = setInterval(fetchRoom, 15_000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // ── Organizer: start a new meeting ──────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!walletAddress) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createConferenceRoom({
        displayName: eventTitle,
        eventId,
      });
      setRoom(created);
      setShowRoom(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start meeting');
    } finally {
      setCreating(false);
    }
  }, [walletAddress, eventTitle, eventId]);

  // ── Attendee / organizer: join existing live room ────────────────────────
  const handleJoin = useCallback(() => {
    setShowRoom(true);
  }, []);

  // ── After leaving / meeting ended ────────────────────────────────────────
  const handleLeave = useCallback(() => {
    setShowRoom(false);
    // Refresh room state (may now be ended)
    fetchRoom();
  }, [fetchRoom]);

  // ── Determine caller's role ───────────────────────────────────────────────
  const callerRole: ParticipantRole = isOrganizer ? 'host' : 'attendee';

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Checking meeting status…</span>
        </CardContent>
      </Card>
    );
  }

  const isLive = room?.status === 'live';
  const isScheduled = room?.status === 'scheduled';
  const isEnded = room?.status === 'ended';
  // Organizer can join a scheduled room (they'll flip it to live on connect).
  // Attendees can only join once the organizer has started it (status = live).
  const canJoin = !!room && !isEnded && !!walletAddress &&
    (isOrganizer || isLive && isRegistered);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="w-4 h-4" style={{ color: '#2F5D50' }} />
            Meeting Room
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* ── Live room ── */}
          {isLive && (
            <div
              className="flex items-center justify-between rounded-lg p-3"
              style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: '#E85555', boxShadow: '0 0 6px #E85555' }}
                />
                <span className="text-sm font-medium" style={{ color: '#1F453A' }}>
                  Live now
                </span>
              </div>
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs"
                style={{ borderColor: '#B8D9CA', color: '#3F7A5A' }}
              >
                <Users className="w-3 h-3" />
                {participantCount}
              </Badge>
            </div>
          )}

          {/* ── Scheduled / no room yet ── */}
          {!room && !isEnded && (
            <p className="text-sm text-gray-500 text-center py-1">
              {isOrganizer
                ? 'Start a meeting when you\'re ready to begin.'
                : 'The organiser has not started the meeting yet.'}
            </p>
          )}

          {/* ── Ended ── */}
          {isEnded && (
            <p className="text-sm text-gray-500 text-center py-1">
              This meeting has ended.
            </p>
          )}

          {/* ── CTA buttons ── */}
          {isOrganizer && !room && !isEnded && (
            <Button
              className="w-full"
              disabled={creating || !walletAddress}
              onClick={handleStart}
              style={{ backgroundColor: '#2F5D50', color: '#fff' }}
            >
              {creating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</>
                : <><Video className="w-4 h-4 mr-2" />Start Meeting</>
              }
            </Button>
          )}

          {canJoin && (
            <Button
              className="w-full hover:opacity-90"
              onClick={handleJoin}
              style={{ backgroundColor: '#2F5D50', color: '#fff' }}
            >
              <Video className="w-4 h-4 mr-2" />
              {isOrganizer && isScheduled ? 'Open Meeting Room' : isOrganizer ? 'Rejoin Meeting' : 'Join Meeting'}
            </Button>
          )}

          {/* Not registered and not organizer and room is live */}
          {isLive && !isOrganizer && !isRegistered && (
            <p className="text-sm text-center" style={{ color: '#8B3A3A' }}>
              Registration required to join the meeting.
            </p>
          )}

          {/* Not connected */}
          {canJoin === false && isLive && !walletAddress && (
            <p className="text-xs text-gray-400 text-center">
              Connect your wallet to join.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Full-screen conference room overlay */}
      {showRoom && room && walletAddress && (
        <ConferenceRoom
          room={room}
          walletAddress={walletAddress}
          requestedRole={callerRole}
          onLeave={handleLeave}
        />
      )}
    </>
  );
};
