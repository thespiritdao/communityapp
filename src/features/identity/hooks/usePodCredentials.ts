'use client';

/**
 * usePodCredentials Hook
 *
 * Dynamically fetches pod leader credentials based on user's actual hat holdings.
 * Replaces hardcoded TOKEN_CONFIGS for credentials category.
 *
 * Architecture:
 * - Uses useHatPermissions to get user's roles
 * - Filters for leader roles only
 * - Fetches pod metadata from database
 * - Returns formatted token configs for TokenGallery
 */

import { useState, useEffect } from 'react';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { supabase } from '@/utils/supabaseClient';
import type {
  PodCredential,
  UsePodCredentialsReturn,
} from './usePodCredentials.types';

// Re-export types for backward compatibility
export type {
  PodCredential,
  UsePodCredentialsReturn,
} from './usePodCredentials.types';

/**
 * Hook to fetch dynamic pod credentials based on user's actual hat holdings
 */
export function usePodCredentials(
  walletAddress: string | undefined,
): UsePodCredentialsReturn {
  const [credentials, setCredentials] = useState<PodCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user's hat permissions and roles
  const { userRoles, isLoading: rolesLoading } = useHatPermissions();

  const loadPodCredentials = async () => {
    if (!walletAddress) {
      setCredentials([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('[usePodCredentials] Loading credentials for', walletAddress);
      console.log('[usePodCredentials] User roles:', userRoles.length);

      // Filter for leader roles only
      const leaderRoles = userRoles.filter((role) => role.isLeaderRole);
      console.log(
        '[usePodCredentials] Leader roles found:',
        leaderRoles.length,
      );

      if (leaderRoles.length === 0) {
        console.log('[usePodCredentials] No leader roles found');
        setCredentials([]);
        setIsLoading(false);
        return;
      }

      // Get pod IDs for leader roles
      const podIds = leaderRoles
        .map((role) => role.podId)
        .filter((id): id is string => !!id);

      console.log('[usePodCredentials] Pod IDs:', podIds);

      if (podIds.length === 0) {
        console.log('[usePodCredentials] No pod IDs found in leader roles');
        setCredentials([]);
        setIsLoading(false);
        return;
      }

      // Fetch pod metadata from database
      const { data: pods, error: podsError } = await supabase
        .from('pods')
        .select('id, name, pod_image_url, management_hat_id')
        .in('id', podIds);

      if (podsError) {
        console.error('[usePodCredentials] Error fetching pods:', podsError);
        throw podsError;
      }

      console.log('[usePodCredentials] Fetched pods:', pods?.length);

      // Map pods to credential format
      const podCredentials: PodCredential[] = (pods || [])
        .filter((pod) => pod.management_hat_id) // Only include pods with hat IDs
        .map((pod) => ({
          address: pod.management_hat_id!,
          type: 'hat' as const,
          label: `${pod.name} Leader`,
          category: 'credential' as const,
          image: pod.pod_image_url || '/images/symbolobinfin.png',
          podId: pod.id,
          isLeader: true,
        }));

      console.log(
        '[usePodCredentials] Generated credentials:',
        podCredentials.length,
      );
      console.log(
        '[usePodCredentials] Credentials:',
        podCredentials.map((c) => c.label),
      );

      setCredentials(podCredentials);
    } catch (err) {
      console.error('[usePodCredentials] Error loading pod credentials:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load pod credentials',
      );
      setCredentials([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload when roles change or wallet changes
  useEffect(() => {
    if (!rolesLoading) {
      loadPodCredentials();
    }
  }, [walletAddress, rolesLoading, userRoles.length]);

  return {
    credentials,
    isLoading: isLoading || rolesLoading,
    error,
    refresh: loadPodCredentials,
  };
}
