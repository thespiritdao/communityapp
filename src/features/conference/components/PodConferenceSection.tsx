'use client';

// src/features/conference/components/PodConferenceSection.tsx
//
// Inline section shown on the pod detail page for ad-hoc meetings.
// - Leaders see "Start Meeting" when no live room exists
// - Members see "Join Meeting" when a room is live
// - Non-members see nothing
//
// When joined, <ConferenceRoom> mounts as a full-screen overlay above the page.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConferenceRoom } from './ConferenceRoom';
import {
  createConferenceRoom,
  getRoomByPodId,
} from '../services/conferenceService';
import type { ConferenceRoom as ConferenceRoomType, ParticipantRole } from '../types/conference';

interface PodConferenceSectionProps {
  podId: string;
  podName: string;
  /** Wallet of the currently connected user */
  walletAddress: string | undefined;
  /** True if the current user is a pod leader */
  isLeader: boolean;
  /** True if the current user is a pod member (leader or regular member) */
  isMember: boolean;
}

export const PodConferenceSection: React.FC<PodConferenceSectionProps> = ({
  podId,
  podName,
  walletAddress,
  isLeader,
  isMember,
}) => {
  const [room, setRoom] = useState<ConferenceRoomType | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRoom, setShowRoom] = useState(false);
  // Frozen snapshot of the room at the moment of joining — never changes while
  // the conference overlay is mounted, preventing re-renders from breaking the
  // LiveKit peer connection.
  const [activeRoom, setActiveRoom] = useState<ConferenceRoomType | null>(null);

  // ── Fetch existing room for this pod ────────────────────────────────────
  const fetchRoom = useCallback(async () => {
    try {
      const result = await getRoomByPodId(podId);
      if (result) {
        setRoom(result.room);
        setParticipantCount(result.participantCount);
      } else {
        setRoom(null);
        setParticipantCount(0);
      }
    } catch {
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  // Initial fetch on mount
  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Poll every 15s — pause while the conference overlay is open so that
  // setRoom() never fires while a LiveKit peer connection is active.
  const showRoomRef = useRef(showRoom);
  useEffect(() => { showRoomRef.current = showRoom; }, [showRoom]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!showRoomRef.current) fetchRoom();
    }, 15_000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // ── Leader: start a new meeting ─────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!walletAddress) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createConferenceRoom({
        displayName: podName,
        podId,
      });
      setRoom(created);
      setActiveRoom(created);
      setShowRoom(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start meeting');
    } finally {
      setCreating(false);
    }
  }, [walletAddress, podName, podId]);

  // ── Member / leader: join existing live room ────────────────────────────
  const handleJoin = useCallback(() => {
    // Freeze the current room snapshot so polling can't swap it out mid-call
    setActiveRoom(room);
    setShowRoom(true);
  }, [room]);

  // ── After leaving / meeting ended ───────────────────────────────────────
  const handleLeave = useCallback(() => {
    setShowRoom(false);
    setActiveRoom(null);
    // Refresh room state (may now be ended)
    fetchRoom();
  }, [fetchRoom]);

  // ── Determine caller's role ─────────────────────────────────────────────
  const callerRole: ParticipantRole = isLeader ? 'host' : 'attendee';

  // ── Render ──────────────────────────────────────────────────────────────

  // Don't show anything while loading
  if (loading) return null;

  const isLive = room?.status === 'live';
  const isScheduled = room?.status === 'scheduled';

  // Leaders can join scheduled or live rooms. Members can only join live rooms.
  const canJoin = !!room && !!walletAddress && isMember &&
    (isLeader || isLive);

  // Nothing to show: no room and not a leader, or not a member at all
  if (!room && !isLeader) return null;
  if (!isMember) return null;

  return (
    <>
      {/* ── Live meeting banner ── */}
      {isLive && (
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ backgroundColor: '#E85555', boxShadow: '0 0 6px #E85555' }}
              />
              <Video className="w-5 h-5 flex-shrink-0" style={{ color: '#2F5D50' }} />
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs flex-shrink-0"
                style={{ borderColor: '#B8D9CA', color: '#3F7A5A' }}
              >
                <Users className="w-3 h-3" />
                {participantCount}
              </Badge>
            </div>
            {canJoin && (
              <Button
                size="sm"
                onClick={handleJoin}
                style={{ backgroundColor: '#2F5D50', color: 'white' }}
                className="flex-shrink-0"
              >
                <Video className="w-4 h-4 mr-1" />
                Join
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Scheduled room (leader started but not yet live) ── */}
      {isScheduled && isLeader && (
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 flex-shrink-0" style={{ color: '#2F5D50' }} />
            <span className="text-sm font-medium flex-1" style={{ color: '#1F2D2A' }}>
              Meeting room ready
            </span>
            <Button
              size="sm"
              onClick={handleJoin}
              style={{ backgroundColor: '#2F5D50', color: 'white' }}
              className="flex-shrink-0"
            >
              <Video className="w-4 h-4 mr-1" />
              Open
            </Button>
          </div>
        </div>
      )}

      {/* ── No room — leader can start ── */}
      {!room && isLeader && (
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 flex-shrink-0" style={{ color: '#2F5D50' }} />
            <div className="flex-1" />
            <Button
              size="sm"
              disabled={creating || !walletAddress}
              onClick={handleStart}
              style={{ backgroundColor: '#2F5D50', color: 'white' }}
              className="flex-shrink-0"
            >
              {creating
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Starting...</>
                : <><Video className="w-4 h-4 mr-1" />Start Meeting</>
              }
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </div>
      )}

      {/* Full-screen conference room overlay */}
      {showRoom && activeRoom && walletAddress && (
        <ConferenceRoom
          room={activeRoom}
          walletAddress={walletAddress}
          requestedRole={callerRole}
          onLeave={handleLeave}
        />
      )}
    </>
  );
};
