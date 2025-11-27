import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { EventService } from '../lib/supabase';
import type { Pod, Event } from '../types/event';
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
  const { address } = useAccount();
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
      const hasAccess = await hasEventAccess(event.id, identity);
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
  const { address } = useAccount();
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
  const [loading, setLoading] = useState(false);
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
    if (!address || hatPermissionsLoading || modulesLoading) {
      setCanManageEvents(false);
      setCanCreateEvents(false);
      setManagedPods([]);
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
  const { address } = useAccount();
  const { balances: contextTokenBalances } = useTokenBalances();
  const { userHats, isLoading: hatPermissionsLoading } = useHatPermissions();
  const effectiveAddress = userAddress || address;

  const [visibleEvents, setVisibleEvents] = useState<Event[]>([]);
  const [registrableEvents, setRegistrableEvents] = useState<Event[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEventAccess = useCallback(async () => {
    if (!effectiveAddress || hatPermissionsLoading) {
      setVisibleEvents([]);
      setRegistrableEvents([]);
      setRegisteredEvents([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // NEW: Use normalized access control system with RPC
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

      // Get accessible events using the new RPC function
      const accessibleEvents = await getAccessibleEvents(identity);
      console.log(
        `🎪 User has access to ${accessibleEvents.length} events via RPC`,
      );

      // Get user's registrations
      const userRegistrations =
        await EventService.getUserRegistrations(effectiveAddress);
      const registeredEventIds = new Set(
        userRegistrations.map((reg) => reg.event_id),
      );

      // Process accessible events
      const visible: Event[] = [];
      const registrable: Event[] = [];
      const registered: Event[] = [];

      // All events returned from RPC are accessible, so we just need to categorize them
      for (const event of accessibleEvents) {
        // Check if user is registered for this event
        if (registeredEventIds.has(event.id)) {
          registered.push(event);
        }

        // All events from RPC are visible
        visible.push(event);

        // Check if user can register for this event
        const now = new Date();
        const eventEndDate = event.event_end_date
          ? new Date(event.event_end_date)
          : new Date(new Date(event.event_date).getTime() + 8 * 60 * 60 * 1000);
        const hasNotEnded = eventEndDate > now;
        const isNotRegistered = !registeredEventIds.has(event.id);
        const isPublished = event.status === 'published';
        const hasCapacity =
          !event.max_attendees ||
          (event.registration_count || 0) < event.max_attendees;
        const canRegister = canRegisterForEvents(identity);

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
      setRegisteredEvents(registered);
    } catch (err) {
      console.error('Error in token gated events check:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to check event access',
      );
      setVisibleEvents([]);
      setRegistrableEvents([]);
      setRegisteredEvents([]);
    } finally {
      setLoading(false);
    }
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
  const { address } = useAccount();
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
            tokenId === process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER) &&
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
