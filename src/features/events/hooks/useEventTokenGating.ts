import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { EventService } from '../lib/supabase';
import { getClientHatId } from '@/lib/hatRegistryClient';
import type { Pod, Event, EventWithStats } from '../types/event';
import { fetchTokenBalances } from '../../../utils/fetchTokenBalances';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { usePodModules } from '@/features/pods/hooks/usePodModules';
import {
  getUserIdentity,
  getAccessibleEvents,
  hasEventAccess,
  canRegisterForEvents,
  logUserIdentity,
} from '@/utils/accessControlUtils';

export function usePods() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await EventService.getPods();
      setPods(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  return {
    pods,
    loading,
    error,
    refetch: fetchPods,
  };
}

export function useEventAccess(event: Event | null) {
  const { evmAddress: address } = useEvmAddress();
  const { balances: tokenBalances, error: tokenBalancesError } =
    useTokenBalances();
  const { userHats, isLoading: hatPermissionsLoading } = useHatPermissions();
  const [canView, setCanView] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    if (!event || !address || hatPermissionsLoading) {
      setCanView(false);
      setCanRegister(false);
      setCanManage(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if user is the creator
      const isCreator =
        event.creator_address.toLowerCase() === address.toLowerCase();
      setCanManage(isCreator);

      // NEW: Use normalized access control system
      const effectiveTokenBalances =
        tokenBalances || (await fetchTokenBalances(address));
      const identity = await getUserIdentity(
        address,
        effectiveTokenBalances,
        userHats,
      );
      logUserIdentity(identity, 'Event Access Check');

      // Check if user has access to this specific event
      const hasAccess = await hasEventAccess(event.id, identity, address);
      console.log(`🎪 User has access to event "${event.title}": ${hasAccess}`);

      setCanView(hasAccess);

      if (hasAccess) {
        // Check if user can register based on other requirements (date, capacity, etc.)
        try {
          const canRegisterForEvent =
            await EventService.canUserRegisterForEvent(event.id, address);
          const generalRegistrationPermission = canRegisterForEvents(identity);
          setCanRegister(canRegisterForEvent && generalRegistrationPermission);
        } catch (registrationError) {
          console.warn(
            'Error checking registration permission, defaulting to true:',
            registrationError,
          );
          setCanRegister(canRegisterForEvents(identity));
        }
      } else {
        setCanRegister(false);
      }
    } catch (err) {
      console.error('Error in event access check:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to check event access',
      );
      setCanView(false);
      setCanRegister(false);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [event, address, tokenBalances, userHats, hatPermissionsLoading]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    canView,
    canRegister,
    canManage,
    userTokens,
    loading,
    error,
    recheckAccess: checkAccess,
  };
}

export function useEventManagementAccess() {
  const { evmAddress: address } = useEvmAddress();
  const { balances: tokenBalances } = useTokenBalances();
  const {
    userHats,
    isLoading: hatPermissionsLoading,
    userRoles,
  } = useHatPermissions();
  const { modules, loading: modulesLoading } = usePodModules();
  const [canManageEvents, setCanManageEvents] = useState(false);
  const [canCreateEvents, setCanCreateEvents] = useState(false);
  const [managedPods, setManagedPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true); // Start true — access not yet determined
  const [error, setError] = useState<string | null>(null);

  // Create a stable string representation of modules for events
  // This prevents infinite loops while still updating when module data changes
  const eventsModulesKey = useMemo(() => {
    const podIds = Object.keys(modules).sort();
    return podIds
      .map((podId) => `${podId}:${modules[podId]?.events_enabled ? '1' : '0'}`)
      .join(',');
  }, [modules]);

  const checkManagementAccess = useCallback(async () => {
    if (!address) {
      setCanManageEvents(false);
      setCanCreateEvents(false);
      setManagedPods([]);
      setLoading(false);
      return;
    }
    if (hatPermissionsLoading || modulesLoading) {
      // Dependencies still loading — keep loading=true, wait for next call
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get all pods first
      const allPods = await EventService.getPods();

      // Filter pods to only include those where:
      // 1. Pod module for Events is enabled (pod-wide)
      // 2. User has eventCreation permission (role-specific)
      const podsWithPermission = allPods.filter((pod) => {
        // Check 1: Does pod have Events module enabled?
        // Use modules object directly instead of isModuleEnabled function to avoid dependency issues
        const hasEventsModule = modules[pod.id]?.events_enabled ?? false;

        // Check 2: Does user have eventCreation permission in this pod?
        const podRoles = userRoles.filter((role) => role.podId === pod.id);
        const hasPermission = podRoles.some(
          (role) => role.permissions?.eventCreation,
        );

        console.log(
          `🎪 [Events] Pod ${pod.name} (${pod.id}): module=${hasEventsModule}, permission=${hasPermission}`,
        );

        // Must satisfy BOTH conditions (module is pod-wide, overrides permission)
        return hasEventsModule && hasPermission;
      });

      console.log(
        `🎪 [Events] User can create events in ${podsWithPermission.length}/${allPods.length} pods`,
      );

      // User can manage events if they have permission in at least one pod
      const hasAnyPermission = podsWithPermission.length > 0;

      setCanManageEvents(hasAnyPermission);
      setCanCreateEvents(hasAnyPermission);
      setManagedPods(podsWithPermission);
    } catch (err) {
      console.error('Error in event management access check:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to check management access',
      );
      setCanManageEvents(false);
      setCanCreateEvents(false);
      setManagedPods([]);
    } finally {
      setLoading(false);
    }
  }, [
    address,
    userRoles,
    hatPermissionsLoading,
    modulesLoading,
    eventsModulesKey,
  ]);

  useEffect(() => {
    checkManagementAccess();
  }, [checkManagementAccess]);

  return {
    canManageEvents,
    canCreateEvents,
    managedPods,
    loading,
    error,
    recheckAccess: checkManagementAccess,
  };
}

export function useTokenGatedEvents(userAddress?: string) {
  const { evmAddress: address } = useEvmAddress();
  const { balances: contextTokenBalances } = useTokenBalances();
  const { userHats, isLoading: hatPermissionsLoading } = useHatPermissions();
  const effectiveAddress = userAddress || address;

  const [visibleEvents, setVisibleEvents] = useState<EventWithStats[]>([]);
  const [registrableEvents, setRegistrableEvents] = useState<EventWithStats[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<EventWithStats[]>([]);
  // Start true: consumers render "no events" when loading is false and the
  // lists are empty, so a false initial value flashed an empty My Events tab
  // before the first fetch had even begun.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkEventAccess = useCallback(async () => {
    if (!effectiveAddress) {
      setVisibleEvents([]);
      setRegistrableEvents([]);
      setRegisteredEvents([]);
      setLoading(false);
      return;
    }
    if (hatPermissionsLoading) {
      // Permissions still resolving; keep loading=true and wait for the re-run.
      return;
    }

    setLoading(true);
    setError(null);

    // The two halves of this hook have different failure modes and are
    // fetched independently so one cannot blank the other:
    //
    //   "mine"       — registrations + events the member created. Plain table
    //                  reads under RLS. Feeds My Events.
    //   "accessible" — the events_accessible_by_identity RPC. Feeds the
    //                  Calendar and the registrable list.
    //
    // From 2026-09-20 to 2026-10-19 the RPC lacked an EXECUTE grant and the
    // old single try/catch cleared all three lists on that one error, so My
    // Events showed 0 for everyone even though their registrations loaded.

    const loadMine = async () => {
      const userRegistrations =
        await EventService.getUserRegistrations(effectiveAddress);
      const registeredEventIds = new Set(
        userRegistrations.map((reg) => reg.event_id),
      );

      // Full details for registered events, bypassing token gating, so
      // My Events shows everything the member signed up for.
      const [registeredFromDb, createdEvents] = await Promise.all([
        registeredEventIds.size > 0
          ? EventService.getEventsByIds(Array.from(registeredEventIds))
          : Promise.resolve([] as EventWithStats[]),
        EventService.getEvents({ creator_address: effectiveAddress }),
      ]);

      const mine: EventWithStats[] = [...registeredFromDb];
      const seen = new Set(mine.map((e) => e.id));
      for (const event of createdEvents) {
        if (!seen.has(event.id)) {
          mine.push(event);
          seen.add(event.id);
        }
      }
      return { mine, registeredEventIds };
    };

    const loadAccessible = async () => {
      const effectiveTokenBalances =
        contextTokenBalances && address === effectiveAddress
          ? contextTokenBalances
          : await fetchTokenBalances(effectiveAddress);

      const identity = await getUserIdentity(
        effectiveAddress,
        effectiveTokenBalances,
        address === effectiveAddress ? userHats : [],
      );
      logUserIdentity(identity, 'Token Gated Events Check');

      const accessibleEvents = await getAccessibleEvents(identity);
      console.log(
        `🎪 User has access to ${accessibleEvents.length} events via RPC`,
      );
      return { accessibleEvents, identity };
    };

    const [mineResult, accessibleResult] = await Promise.allSettled([
      loadMine(),
      loadAccessible(),
    ]);

    const errors: string[] = [];

    let registeredEventIds = new Set<string>();
    if (mineResult.status === 'fulfilled') {
      registeredEventIds = mineResult.value.registeredEventIds;
      setRegisteredEvents(mineResult.value.mine);
    } else {
      console.error('Error loading registered events:', mineResult.reason);
      errors.push(
        mineResult.reason instanceof Error
          ? mineResult.reason.message
          : 'Failed to load your events',
      );
      setRegisteredEvents([]);
    }

    if (accessibleResult.status === 'fulfilled') {
      const { accessibleEvents, identity } = accessibleResult.value;
      const visible: EventWithStats[] = [];
      const registrable: EventWithStats[] = [];
      const now = new Date();
      const canRegister = canRegisterForEvents(identity);

      for (const event of accessibleEvents) {
        visible.push(event);

        const eventEndDate = event.event_end_date
          ? new Date(event.event_end_date)
          : new Date(new Date(event.event_date).getTime() + 8 * 60 * 60 * 1000);
        const hasNotEnded = eventEndDate > now;
        const isNotRegistered = !registeredEventIds.has(event.id);
        const isPublished = event.status === 'published';
        const hasCapacity =
          !event.max_attendees ||
          (event.registration_count || 0) < event.max_attendees;

        if (
          hasNotEnded &&
          isNotRegistered &&
          isPublished &&
          hasCapacity &&
          canRegister
        ) {
          registrable.push(event);
        }
      }

      setVisibleEvents(visible);
      setRegistrableEvents(registrable);
    } else {
      console.error('Error in token gated events check:', accessibleResult.reason);
      errors.push(
        accessibleResult.reason instanceof Error
          ? accessibleResult.reason.message
          : 'Failed to check event access',
      );
      setVisibleEvents([]);
      setRegistrableEvents([]);
    }

    setError(errors.length > 0 ? errors.join('; ') : null);
    setLoading(false);
  }, [
    effectiveAddress,
    contextTokenBalances,
    address,
    userHats,
    hatPermissionsLoading,
  ]);

  useEffect(() => {
    checkEventAccess();
  }, [checkEventAccess]);

  return {
    visibleEvents,
    registrableEvents,
    registeredEvents,
    loading,
    error,
    refetch: checkEventAccess,
  };
}

// Helper hook for checking specific token requirements
export function useTokenRequirements(requiredTokens: string[]) {
  const { evmAddress: address } = useEvmAddress();
  const { balances: contextTokenBalances } = useTokenBalances();
  const [hasRequiredTokens, setHasRequiredTokens] = useState(false);
  const [userTokenBalances, setUserTokenBalances] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stabilize requiredTokens array to prevent infinite re-renders
  const stableRequiredTokens = useMemo(() => {
    return requiredTokens.sort().join(',');
  }, [requiredTokens]);

  const checkTokenRequirements = useCallback(async () => {
    if (!address || !requiredTokens || requiredTokens.length === 0) {
      setHasRequiredTokens(!requiredTokens || requiredTokens.length === 0);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use context balances if available, fallback to direct fetch
      let tokenBalances;
      if (contextTokenBalances) {
        tokenBalances = contextTokenBalances;
        console.log(
          '🔄 Using cached token balances from context for token requirements',
        );
      } else {
        console.log(
          '⚠️ Context balances not available, fetching directly for token requirements',
        );
        tokenBalances = await fetchTokenBalances(address);
      }

      const balances: Record<string, string> = {};
      let hasAll = true;

      for (const tokenId of requiredTokens) {
        let hasToken = false;

        // Check against known token IDs (both shorthand and full hat ID)
        if (
          (tokenId === 'exec' ||
            tokenId === getClientHatId('EXECUTIVE_POD_LEADER')) &&
          tokenBalances.hasExecutivePod
        ) {
          hasToken = true;
        } else if (
          (tokenId === 'event_management' ||
            tokenId === process.env.NEXT_PUBLIC_EVENT_MANAGEMENT) &&
          tokenBalances.hasEventManagement
        ) {
          hasToken = true;
        }

        balances[tokenId] = hasToken ? '1' : '0';
        if (!hasToken) {
          hasAll = false;
        }
      }

      setUserTokenBalances(balances);
      setHasRequiredTokens(hasAll);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to check token requirements',
      );
      setHasRequiredTokens(false);
    } finally {
      setLoading(false);
    }
  }, [address, stableRequiredTokens, contextTokenBalances]); // Use stable string instead of array

  useEffect(() => {
    checkTokenRequirements();
  }, [checkTokenRequirements]);

  return {
    hasRequiredTokens,
    userTokenBalances,
    loading,
    error,
    recheck: checkTokenRequirements,
  };
}
