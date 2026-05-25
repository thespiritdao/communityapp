import { useState, useEffect, useCallback } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useWalletClient } from 'wagmi';
import { HatEligibilityIntegration } from '../../../services/hatEligibilityIntegration';

interface TimeBoundMembership {
  hatId: string;
  userAddress: string;
  eligible: boolean;
  validFrom?: Date;
  validUntil?: Date;
  timeRemaining?: number;
  status: 'active' | 'expired' | 'pending' | 'error';
  reason?: string;
}

interface UseTimeBoundMembershipOptions {
  podId?: string;
  hatId?: bigint;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

/**
 * Hook for managing time-bound membership with HATs Protocol
 * Monitors eligibility, expiration, and automatic membership revocation
 */
export function useTimeBoundMembership(
  options: UseTimeBoundMembershipOptions = {},
) {
  const address = useUserWallet();
  const { data: walletClient } = useWalletClient();

  const {
    podId,
    hatId,
    autoRefresh = true,
    refreshInterval = 60000, // 1 minute
  } = options;

  const [membership, setMembership] = useState<TimeBoundMembership | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  /**
   * Check current membership status
   */
  const checkMembershipStatus = useCallback(async () => {
    if (!address || !hatId) {
      setMembership(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Checking time-bound membership status:', {
        userAddress: address,
        hatId: hatId.toString(),
      });

      // Check HAT eligibility with time bounds
      const eligibilityResult =
        await HatEligibilityIntegration.checkHatEligibility(
          address as `0x${string}`,
          hatId,
        );

      // Get time-bound summary
      const timeBoundSummary =
        await HatEligibilityIntegration.getHatTimeBoundSummary(hatId);

      // Calculate time remaining if there's an expiration
      let timeRemaining: number | undefined;
      let status: TimeBoundMembership['status'] = 'active';

      if (timeBoundSummary.validUntil) {
        const now = new Date();
        const expiration = timeBoundSummary.validUntil;
        timeRemaining = Math.max(0, expiration.getTime() - now.getTime());

        if (timeRemaining === 0) {
          status = 'expired';
        } else if (!eligibilityResult.eligible) {
          status = 'error';
        }
      } else if (!eligibilityResult.eligible) {
        status = eligibilityResult.reason?.includes('Not valid until')
          ? 'pending'
          : 'error';
      }

      const membershipData: TimeBoundMembership = {
        hatId: hatId.toString(),
        userAddress: address,
        eligible: eligibilityResult.eligible,
        validFrom: timeBoundSummary.validFrom,
        validUntil: timeBoundSummary.validUntil,
        timeRemaining,
        status,
        reason: eligibilityResult.reason,
      };

      setMembership(membershipData);
      setLastChecked(new Date());

      console.log('✅ Membership status checked:', membershipData);
    } catch (error: any) {
      console.error('❌ Failed to check membership status:', error);
      setError(error.message || 'Failed to check membership status');
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, [address, hatId]);

  /**
   * Update time-bound criteria
   */
  const updateTimeBounds = useCallback(
    async (newValidFrom: Date | null, newValidUntil: Date | null) => {
      if (!hatId || !walletClient) {
        throw new Error('HAT ID and wallet client required');
      }

      try {
        setLoading(true);

        const result = await HatEligibilityIntegration.updateTimeBoundCriteria(
          hatId,
          newValidFrom,
          newValidUntil,
          walletClient,
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to update time bounds');
        }

        // Refresh membership status after update
        await checkMembershipStatus();

        return result;
      } catch (error: any) {
        console.error('❌ Failed to update time bounds:', error);
        setError(error.message || 'Failed to update time bounds');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [hatId, walletClient, checkMembershipStatus],
  );

  /**
   * Force refresh membership status
   */
  const refresh = useCallback(() => {
    return checkMembershipStatus();
  }, [checkMembershipStatus]);

  /**
   * Get formatted time remaining
   */
  const getFormattedTimeRemaining = useCallback(() => {
    if (!membership?.timeRemaining) return null;

    const days = Math.floor(membership.timeRemaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (membership.timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor(
      (membership.timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }, [membership?.timeRemaining]);

  /**
   * Check if membership is expiring soon (within 24 hours)
   */
  const isExpiringSoon = useCallback(() => {
    if (!membership?.timeRemaining) return false;
    return membership.timeRemaining <= 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }, [membership?.timeRemaining]);

  /**
   * Get membership status color and message
   */
  const getStatusInfo = useCallback(() => {
    if (!membership) return { color: 'gray', message: 'No membership data' };

    switch (membership.status) {
      case 'active':
        if (isExpiringSoon()) {
          return { color: 'yellow', message: 'Membership expiring soon' };
        }
        return { color: 'green', message: 'Membership active' };
      case 'expired':
        return { color: 'red', message: 'Membership expired' };
      case 'pending':
        return { color: 'blue', message: 'Membership pending activation' };
      case 'error':
        return {
          color: 'red',
          message: membership.reason || 'Membership error',
        };
      default:
        return { color: 'gray', message: 'Unknown status' };
    }
  }, [membership, isExpiringSoon]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !address || !hatId) return;

    // Initial check
    checkMembershipStatus();

    // Set up interval for auto-refresh
    const interval = setInterval(checkMembershipStatus, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, address, hatId, refreshInterval, checkMembershipStatus]);

  // Manual trigger effect
  useEffect(() => {
    if (address && hatId && !autoRefresh) {
      checkMembershipStatus();
    }
  }, [address, hatId, autoRefresh, checkMembershipStatus]);

  return {
    // Data
    membership,
    loading,
    error,
    lastChecked,

    // Actions
    refresh,
    updateTimeBounds,

    // Computed values
    isExpiringSoon: isExpiringSoon(),
    formattedTimeRemaining: getFormattedTimeRemaining(),
    statusInfo: getStatusInfo(),

    // Utilities
    checkMembershipStatus,
  };
}

/**
 * Hook for monitoring multiple HATs with time-bound memberships
 */
export function useMultipleTimeBoundMemberships(hatIds: bigint[]) {
  const address = useUserWallet();
  const [memberships, setMemberships] = useState<
    Map<string, TimeBoundMembership>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAllMemberships = useCallback(async () => {
    if (!address || hatIds.length === 0) {
      setMemberships(new Map());
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const results = await Promise.all(
        hatIds.map(async (hatId) => {
          try {
            const eligibilityResult =
              await HatEligibilityIntegration.checkHatEligibility(
                address as `0x${string}`,
                hatId,
              );

            const timeBoundSummary =
              await HatEligibilityIntegration.getHatTimeBoundSummary(hatId);

            let timeRemaining: number | undefined;
            let status: TimeBoundMembership['status'] = 'active';

            if (timeBoundSummary.validUntil) {
              const now = new Date();
              timeRemaining = Math.max(
                0,
                timeBoundSummary.validUntil.getTime() - now.getTime(),
              );

              if (timeRemaining === 0) {
                status = 'expired';
              } else if (!eligibilityResult.eligible) {
                status = 'error';
              }
            } else if (!eligibilityResult.eligible) {
              status = eligibilityResult.reason?.includes('Not valid until')
                ? 'pending'
                : 'error';
            }

            return {
              hatId: hatId.toString(),
              userAddress: address,
              eligible: eligibilityResult.eligible,
              validFrom: timeBoundSummary.validFrom,
              validUntil: timeBoundSummary.validUntil,
              timeRemaining,
              status,
              reason: eligibilityResult.reason,
            } as TimeBoundMembership;
          } catch (error: any) {
            console.error(
              `❌ Failed to check membership for HAT ${hatId}:`,
              error,
            );
            return null;
          }
        }),
      );

      const membershipMap = new Map<string, TimeBoundMembership>();
      results.forEach((membership) => {
        if (membership) {
          membershipMap.set(membership.hatId, membership);
        }
      });

      setMemberships(membershipMap);
    } catch (error: any) {
      console.error('❌ Failed to check multiple memberships:', error);
      setError(error.message || 'Failed to check memberships');
    } finally {
      setLoading(false);
    }
  }, [address, hatIds]);

  useEffect(() => {
    checkAllMemberships();
  }, [checkAllMemberships]);

  return {
    memberships,
    loading,
    error,
    refresh: checkAllMemberships,
    getExpiringSoon: () =>
      Array.from(memberships.values()).filter(
        (m) => m.timeRemaining && m.timeRemaining <= 24 * 60 * 60 * 1000,
      ),
    getExpired: () =>
      Array.from(memberships.values()).filter((m) => m.status === 'expired'),
  };
}

export default useTimeBoundMembership;
