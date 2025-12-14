import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { EventService } from '../lib/supabase';
import type { EventRegistration } from '../types/event';

export function useEventRegistrationStatus(eventId: string | null) {
  const { evmAddress: address } = useEvmAddress();
  const [registration, setRegistration] = useState<EventRegistration | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegistration = useCallback(async () => {
    if (!eventId || !address) {
      setRegistration(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getUserRegistration(eventId, address);
      setRegistration(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch registration',
      );
      setRegistration(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, address]);

  useEffect(() => {
    fetchRegistration();
  }, [fetchRegistration]);

  const isRegistered =
    registration !== null &&
    ['registered', 'checked_in', 'completed'].includes(
      registration.registration_status || '',
    );

  return {
    registration,
    isRegistered,
    loading,
    error,
    refetch: fetchRegistration,
  };
}

// Batch hook for multiple events (more efficient for lists)
export function useBatchEventRegistrationStatus(
  eventIds: string[],
  refreshKey = 0,
) {
  const { evmAddress: address } = useEvmAddress();
  const [registrations, setRegistrations] = useState<
    Record<string, EventRegistration>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stabilize eventIds array to prevent infinite re-renders
  const stableEventIds = useMemo(() => {
    return eventIds.sort().join(',');
  }, [eventIds]);

  const fetchRegistrations = useCallback(async () => {
    if (!address || eventIds.length === 0) {
      setRegistrations({});
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Batch fetch all registrations for this user
      const allRegistrations = await EventService.getUserRegistrations(address);

      // Create a map of event_id -> registration for the requested events
      const registrationMap: Record<string, EventRegistration> = {};
      allRegistrations.forEach((reg) => {
        if (eventIds.includes(reg.event_id)) {
          registrationMap[reg.event_id] = reg;
        }
      });

      setRegistrations(registrationMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch registrations',
      );
      setRegistrations({});
    } finally {
      setLoading(false);
    }
  }, [address, stableEventIds, refreshKey]); // Include refreshKey to trigger refetch

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const getRegistrationStatus = useCallback(
    (eventId: string) => {
      const registration = registrations[eventId];
      const isRegistered =
        registration !== undefined &&
        ['registered', 'checked_in', 'completed'].includes(
          registration.registration_status || '',
        );

      return {
        registration,
        isRegistered,
      };
    },
    [registrations],
  );

  return {
    registrations,
    loading,
    error,
    getRegistrationStatus,
    refetch: fetchRegistrations,
  };
}
