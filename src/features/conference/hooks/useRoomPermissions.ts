// src/features/conference/hooks/useRoomPermissions.ts
//
// Wraps conferenceHostActions with loading/error state so UI components
// can show spinners and toast errors without managing async state themselves.

import { useState, useCallback } from 'react';
import { conferenceHostActions } from '../services/conferenceService';
import type { ParticipantRole } from '../types/conference';

interface UseRoomPermissionsReturn {
  isPending: boolean;
  error: string | null;
  muteParticipant:   (targetWallet: string) => Promise<void>;
  promoteToSpeaker:  (targetWallet: string) => Promise<void>;
  demoteToAttendee:  (targetWallet: string) => Promise<void>;
  removeParticipant: (targetWallet: string) => Promise<void>;
  endMeeting:        () => Promise<void>;
  canManage:         (viewerRole: ParticipantRole, targetRole: ParticipantRole) => boolean;
}

export function useRoomPermissions(roomName: string): UseRoomPermissionsReturn {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setIsPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setError(msg);
      console.error('❌ Host action error:', err);
    } finally {
      setIsPending(false);
    }
  }, []);

  const muteParticipant = useCallback(
    (targetWallet: string) => run(() => conferenceHostActions.muteParticipant(roomName, targetWallet)),
    [roomName, run],
  );

  const promoteToSpeaker = useCallback(
    (targetWallet: string) => run(() => conferenceHostActions.promoteToSpeaker(roomName, targetWallet)),
    [roomName, run],
  );

  const demoteToAttendee = useCallback(
    (targetWallet: string) => run(() => conferenceHostActions.demoteToAttendee(roomName, targetWallet)),
    [roomName, run],
  );

  const removeParticipant = useCallback(
    (targetWallet: string) => run(() => conferenceHostActions.removeParticipant(roomName, targetWallet)),
    [roomName, run],
  );

  const endMeeting = useCallback(
    () => run(() => conferenceHostActions.endMeeting(roomName)),
    [roomName, run],
  );

  /**
   * Whether the viewer with `viewerRole` can take management actions on a
   * participant with `targetRole`. Hosts outrank co_hosts, co_hosts outrank
   * speakers/attendees. Nobody can manage someone of equal or higher rank.
   */
  const canManage = useCallback(
    (viewerRole: ParticipantRole, targetRole: ParticipantRole): boolean => {
      const rank: Record<ParticipantRole, number> = {
        host: 3, co_host: 2, speaker: 1, attendee: 0,
      };
      return rank[viewerRole] > rank[targetRole];
    },
    [],
  );

  return {
    isPending,
    error,
    muteParticipant,
    promoteToSpeaker,
    demoteToAttendee,
    removeParticipant,
    endMeeting,
    canManage,
  };
}
