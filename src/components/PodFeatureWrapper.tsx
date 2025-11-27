/**
 * Pod Feature Wrapper - Enforces module toggle access control
 *
 * Wraps pod-specific features to check if:
 * 1. Module is enabled for the pod
 * 2. User has required Hat
 * 3. User's role has permission
 *
 * Usage:
 * ```typescript
 * <PodFeatureWrapper feature="chat" podId={podId}>
 *   <ChatInterface />
 * </PodFeatureWrapper>
 * ```
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { RefreshCw } from 'lucide-react';
import {
  checkPodFeatureAccess,
  type PodFeature,
  type FeatureAccessResult,
} from '@/utils/podFeatureAccess';
import { AccessDenied } from './AccessDenied';

interface PodFeatureWrapperProps {
  feature: PodFeature;
  podId: string;
  children: React.ReactNode;
  loadingMessage?: string;
  /**
   * Optional: Override wallet address (for SSR or testing)
   */
  userAddress?: string;
  /**
   * Optional: Callback when access check completes
   */
  onAccessCheckComplete?: (result: FeatureAccessResult) => void;
}

export const PodFeatureWrapper: React.FC<PodFeatureWrapperProps> = ({
  feature,
  podId,
  children,
  loadingMessage,
  userAddress: overrideAddress,
  onAccessCheckComplete,
}) => {
  const { address: walletAddress } = useAccount();
  const address = overrideAddress || walletAddress;

  const [accessCheck, setAccessCheck] = useState<{
    loading: boolean;
    result?: FeatureAccessResult;
  }>({ loading: true });

  useEffect(() => {
    if (!address || !podId) {
      setAccessCheck({
        loading: false,
        result: {
          allowed: false,
          reason: 'Please connect your wallet to access this feature',
        },
      });
      return;
    }

    console.log(
      `[PodFeatureWrapper] Checking ${feature} access for ${address} in pod ${podId}`,
    );

    setAccessCheck({ loading: true });

    checkPodFeatureAccess(feature, address, podId)
      .then((result) => {
        console.log(`[PodFeatureWrapper] Access check result:`, result);
        setAccessCheck({ loading: false, result });
        onAccessCheckComplete?.(result);
      })
      .catch((error) => {
        console.error('[PodFeatureWrapper] Error checking access:', error);
        setAccessCheck({
          loading: false,
          result: {
            allowed: false,
            reason: 'Error checking access permissions. Please try again.',
          },
        });
      });
  }, [feature, address, podId, onAccessCheckComplete]);

  // Loading state
  if (accessCheck.loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">
            {loadingMessage || `Checking ${feature} access...`}
          </p>
        </div>
      </div>
    );
  }

  // Access denied
  if (!accessCheck.result?.allowed) {
    return (
      <AccessDenied
        feature={feature.charAt(0).toUpperCase() + feature.slice(1)}
        reason={accessCheck.result?.reason || 'Access denied'}
        details={accessCheck.result?.details}
      />
    );
  }

  // Access granted - render children
  return <>{children}</>;
};

/**
 * Hook version for imperative access checks
 */
export function usePodFeatureAccess(
  feature: PodFeature,
  podId?: string,
  userAddress?: string,
) {
  const { address: walletAddress } = useAccount();
  const address = userAddress || walletAddress;

  const [accessCheck, setAccessCheck] = useState<{
    loading: boolean;
    result?: FeatureAccessResult;
  }>({ loading: true });

  useEffect(() => {
    if (!address || !podId) {
      setAccessCheck({
        loading: false,
        result: {
          allowed: false,
          reason: 'Wallet not connected or pod not specified',
        },
      });
      return;
    }

    checkPodFeatureAccess(feature, address, podId).then((result) => {
      setAccessCheck({ loading: false, result });
    });
  }, [feature, address, podId]);

  return accessCheck;
}
