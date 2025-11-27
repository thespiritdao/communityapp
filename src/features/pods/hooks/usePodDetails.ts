import { useState, useEffect, useCallback } from 'react';
import { PodCoreService } from '../services/PodCoreService';
import {
  getTreasuryAddress,
  getTreasuryAddressSync,
} from '../utils/treasuryAddressUtils';
import type { Pod } from '../types';

export interface UsePodDetailsConfig {
  podId: string;
}

export interface UsePodDetailsReturn {
  pod: Pod | null;
  loading: boolean;
  error: string | null;
  treasuryAddress: string | null;
  treasuryLoading: boolean;
  refetch: () => Promise<void>;
  isValidPodId: boolean;
}

/**
 * Hook for loading and managing single pod details
 * Includes treasury address resolution and validation
 */
export function usePodDetails({
  podId,
}: UsePodDetailsConfig): UsePodDetailsReturn {
  const [pod, setPod] = useState<Pod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);

  // Validate pod ID format
  const isValidPodId = useCallback(() => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(podId);
  }, [podId]);

  /**
   * Load pod details and treasury information
   */
  const loadPod = useCallback(async () => {
    if (!podId || !isValidPodId()) {
      console.warn('❌ Invalid pod ID format:', podId);
      setPod(null);
      setLoading(false);
      setError('Invalid pod ID format');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load pod data
      console.log('🔄 Loading pod details for:', podId);
      const podData = await PodCoreService.getPodById(podId);

      if (!podData) {
        setError('Pod not found');
        setPod(null);
        return;
      }

      setPod(podData);
      console.log('✅ Pod loaded:', podData.name);

      // Load treasury address if pod has one
      if (podData.id) {
        setTreasuryLoading(true);
        try {
          console.log('🏦 Resolving treasury address...');
          const factoryTreasuryAddress = await getTreasuryAddress(
            podData.id,
            podData.treasury_contract_address,
          );
          setTreasuryAddress(factoryTreasuryAddress);
          console.log('✅ Treasury address resolved:', factoryTreasuryAddress);
        } catch (treasuryError) {
          console.error('❌ Treasury address lookup failed:', treasuryError);
          // Fallback to sync method with database value
          const syncTreasuryAddress = getTreasuryAddressSync(
            podData.treasury_contract_address,
          );
          setTreasuryAddress(syncTreasuryAddress);
        } finally {
          setTreasuryLoading(false);
        }
      }
    } catch (err) {
      console.error('❌ Failed to load pod:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pod');
      setPod(null);
    } finally {
      setLoading(false);
    }
  }, [podId, isValidPodId]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    await loadPod();
  }, [loadPod]);

  // Load pod on mount and when podId changes
  useEffect(() => {
    loadPod();
  }, [loadPod]);

  return {
    pod,
    loading,
    error,
    treasuryAddress,
    treasuryLoading,
    refetch,
    isValidPodId: isValidPodId(),
  };
}
