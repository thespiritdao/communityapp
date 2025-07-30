import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { EventService } from '../lib/supabase';
import { Pod, Event } from '../types/event';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';

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
    refetch: fetchPods
  };
}

export function useEventAccess(event: Event | null) {
  const { address } = useAccount();
  const [canView, setCanView] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    if (!event || !address) {
      setCanView(false);
      setCanRegister(false);
      setCanManage(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if user is the creator
      const isCreator = event.creator_address.toLowerCase() === address.toLowerCase();
      setCanManage(isCreator);

      // For now, implement basic token gating logic
      // This should be enhanced based on your token balance checking requirements
      
      // Check if event has token requirements
      if (!event.required_tokens || event.required_tokens.length === 0) {
        // No token gating - everyone can view and register
        setCanView(true);
        setCanRegister(true);
      } else {
        // TODO: Implement actual token balance checking
        // For now, assume user has access if they're connected
        setCanView(true);
        
        // Check if user can register based on token requirements
        const canRegisterForEvent = await EventService.canUserRegisterForEvent(event.id, address);
        setCanRegister(canRegisterForEvent);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check event access');
      setCanView(false);
      setCanRegister(false);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [event, address]);

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
    recheckAccess: checkAccess
  };
}

export function useEventManagementAccess() {
  const { address } = useAccount();
  const [canManageEvents, setCanManageEvents] = useState(false);
  const [managedPods, setManagedPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkManagementAccess = useCallback(async () => {
    if (!address) {
      setCanManageEvents(false);
      setManagedPods([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if user holds EVENT_MANAGEMENT hat
      const tokenBalances = await fetchTokenBalances(address);
      const hasEventManagement = tokenBalances.hasEventManagement;
      
      console.log('Event Management Access Check:', {
        address,
        hasEventManagement,
        tokenBalances: {
          hasExecutivePod: tokenBalances.hasExecutivePod,
          hasEventManagement: tokenBalances.hasEventManagement
        }
      });
      
      setCanManageEvents(hasEventManagement);
      
      if (hasEventManagement) {
        // If user has event management permissions, get all pods they can manage
        const pods = await EventService.getPods();
        setManagedPods(pods);
      } else {
        setManagedPods([]);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check management access');
      setCanManageEvents(false);
      setManagedPods([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    checkManagementAccess();
  }, [checkManagementAccess]);

  return {
    canManageEvents,
    managedPods,
    loading,
    error,
    recheckAccess: checkManagementAccess
  };
}

export function useTokenGatedEvents(userAddress?: string) {
  const { address } = useAccount();
  const effectiveAddress = userAddress || address;
  
  const [visibleEvents, setVisibleEvents] = useState<Event[]>([]);
  const [registrableEvents, setRegistrableEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEventAccess = useCallback(async () => {
    if (!effectiveAddress) return;

    try {
      setLoading(true);
      setError(null);

      // Get all published events
      const allEvents = await EventService.getEvents({ status: 'published' });
      
      // TODO: Implement proper token gating logic
      // For now, show all events but with different registration capabilities
      
      const visible: Event[] = [];
      const registrable: Event[] = [];

      for (const event of allEvents) {
        // Check if user can view this event
        if (!event.required_tokens || event.required_tokens.length === 0) {
          // No token requirements - visible to all
          visible.push(event);
          
          // Check if user can register
          const canRegister = await EventService.canUserRegisterForEvent(event.id, effectiveAddress);
          if (canRegister) {
            registrable.push(event);
          }
        } else {
          // TODO: Check user's token balance against required tokens
          // For now, assume user has access if connected
          visible.push(event);
          
          const canRegister = await EventService.canUserRegisterForEvent(event.id, effectiveAddress);
          if (canRegister) {
            registrable.push(event);
          }
        }
      }

      setVisibleEvents(visible);
      setRegistrableEvents(registrable);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check event access');
    } finally {
      setLoading(false);
    }
  }, [effectiveAddress]);

  useEffect(() => {
    checkEventAccess();
  }, [checkEventAccess]);

  return {
    visibleEvents,
    registrableEvents,
    loading,
    error,
    refetch: checkEventAccess
  };
}

// Helper hook for checking specific token requirements
export function useTokenRequirements(requiredTokens: string[]) {
  const { address } = useAccount();
  const [hasRequiredTokens, setHasRequiredTokens] = useState(false);
  const [userTokenBalances, setUserTokenBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkTokenRequirements = useCallback(async () => {
    if (!address || !requiredTokens || requiredTokens.length === 0) {
      setHasRequiredTokens(!requiredTokens || requiredTokens.length === 0);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // TODO: Implement actual token balance checking
      // This should integrate with your existing token balance checking logic
      // For now, assume user has all required tokens if connected
      
      const balances: Record<string, string> = {};
      let hasAll = true;

      for (const tokenId of requiredTokens) {
        // This should check actual token balance
        balances[tokenId] = '1'; // Mock balance
        if (balances[tokenId] === '0') {
          hasAll = false;
        }
      }

      setUserTokenBalances(balances);
      setHasRequiredTokens(hasAll);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check token requirements');
      setHasRequiredTokens(false);
    } finally {
      setLoading(false);
    }
  }, [address, requiredTokens]);

  useEffect(() => {
    checkTokenRequirements();
  }, [checkTokenRequirements]);

  return {
    hasRequiredTokens,
    userTokenBalances,
    loading,
    error,
    recheck: checkTokenRequirements
  };
}