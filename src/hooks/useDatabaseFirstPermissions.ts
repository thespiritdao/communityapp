/**
 * Database-First Permissions Hook
 *
 * FAST, RELIABLE permission checks using database as source of truth
 * Blockchain verification happens async in background
 *
 * USE THIS FOR:
 * - Pod management access checks
 * - Critical UI rendering (tabs, buttons, etc.)
 * - Any permission check that blocks user interaction
 *
 * Benefits:
 * - 50-100ms response time (vs 2-5 seconds with RPC)
 * - No rate limit issues (database vs Infura)
 * - Graceful degradation (RPC failures don't block access)
 * - Still secure (async verification catches mismatches)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  DatabaseFirstPermissionService,
  type PodMembership,
  type PermissionCheckResult,
} from '@/services/DatabaseFirstPermissionService';

interface UseDatabaseFirstPermissionsReturn {
  // State
  memberships: PodMembership[];
  isExecutiveLeader: boolean;
  managedPods: string[];
  isLoading: boolean;
  error: string | null;

  // Methods
  canManagePod: (podId: string) => Promise<PermissionCheckResult>;
  canManagePodSync: (podId: string) => boolean; // Instant check using loaded data
  refreshMemberships: () => Promise<void>;

  // Computed helpers
  isPodLeader: (podId: string) => boolean;
  isMemberOf: (podId: string) => boolean;
}

/**
 * Database-First Permissions Hook
 *
 * Loads user permissions from database FAST, verifies blockchain ASYNC
 */
export const useDatabaseFirstPermissions =
  (): UseDatabaseFirstPermissionsReturn => {
    const { evmAddress: address } = useEvmAddress();
    const [memberships, setMemberships] = useState<PodMembership[]>([]);
    const [isExecutiveLeader, setIsExecutiveLeader] = useState(false);
    const [managedPods, setManagedPods] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load user's memberships from database
     * This is FAST (50-100ms) and doesn't hit RPC
     */
    const loadMemberships = useCallback(async () => {
      if (!address) {
        setMemberships([]);
        setIsExecutiveLeader(false);
        setManagedPods([]);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const summary =
          await DatabaseFirstPermissionService.getUserPermissionsSummary(
            address,
          );

        setMemberships(summary.memberships);
        setIsExecutiveLeader(summary.isExecutiveLeader);
        setManagedPods(summary.managedPods);

        console.log('✅ Database permissions loaded:', {
          memberships: summary.memberships.length,
          isExecutiveLeader: summary.isExecutiveLeader,
          managedPods: summary.managedPods.length,
        });
      } catch (err) {
        console.error('❌ Failed to load permissions:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }, [address]);

    // Load on mount and when address changes
    useEffect(() => {
      loadMemberships();
    }, [loadMemberships]);

    /**
     * Check if user can manage a pod (ASYNC - for initial checks)
     * Returns detailed result with verification status
     */
    const canManagePod = useCallback(
      async (podId: string): Promise<PermissionCheckResult> => {
        if (!address) {
          return {
            granted: false,
            reason: 'No wallet connected',
            source: 'denied',
            verificationStatus: 'error',
            loadTimeMs: 0,
          };
        }

        return DatabaseFirstPermissionService.canUserManagePod(address, podId);
      },
      [address],
    );

    /**
     * Check if user can manage a pod (SYNC - for UI rendering)
     * Uses already-loaded memberships for instant checks
     */
    const canManagePodSync = useCallback(
      (podId: string): boolean => {
        if (!address || !memberships.length) return false;

        // Executive leaders can manage all pods
        if (isExecutiveLeader) return true;

        // Check if user is a leader of this specific pod
        const podMembership = memberships.find((m) => m.podId === podId);
        return podMembership?.membershipType === 'leader';
      },
      [address, memberships, isExecutiveLeader],
    );

    /**
     * Check if user is a leader of specific pod
     */
    const isPodLeader = useCallback(
      (podId: string): boolean => {
        if (isExecutiveLeader) return true; // Exec leaders are leaders of all pods
        const membership = memberships.find((m) => m.podId === podId);
        return membership?.membershipType === 'leader';
      },
      [memberships, isExecutiveLeader],
    );

    /**
     * Check if user is a member (leader or regular) of specific pod
     */
    const isMemberOf = useCallback(
      (podId: string): boolean => {
        return memberships.some((m) => m.podId === podId);
      },
      [memberships],
    );

    return {
      // State
      memberships,
      isExecutiveLeader,
      managedPods,
      isLoading,
      error,

      // Methods
      canManagePod,
      canManagePodSync,
      refreshMemberships: loadMemberships,

      // Computed helpers
      isPodLeader,
      isMemberOf,
    };
  };
