'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { usePodAccessControl } from '../hooks/usePodAccessControl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';

interface PodAccessGateProps {
  children: ReactNode;
  requireExecutive?: boolean;
  requirePodLeader?: string;
  requirePodMember?: string;
  requireHat?: string;
  redirectTo?: string;
  fallback?: ReactNode;
  loadingComponent?: ReactNode;
  title?: string;
  description?: string;
}

export const PodAccessGate: React.FC<PodAccessGateProps> = ({
  children,
  requireExecutive,
  requirePodLeader,
  requirePodMember,
  requireHat,
  redirectTo = '/pods',
  fallback,
  loadingComponent,
  title = 'Access Restricted',
  description,
}) => {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();

  const {
    hasAccess,
    isLoading,
    errorMessage,
    isExecutiveMember,
    isPodLeader,
    isPodMember,
  } = usePodAccessControl({
    requireExecutive,
    requirePodLeader,
    requirePodMember,
    requireHat,
    redirectTo: undefined, // We'll handle redirect manually for better UX
  });

  // Loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              <p className="text-gray-600">Verifying access permissions...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Access granted
  if (hasAccess) {
    return <>{children}</>;
  }

  // Access denied - show fallback or default UI
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default access denied UI
  const getAccessRequirement = () => {
    if (requireExecutive) return 'Executive Pod Membership';
    if (requirePodLeader) return 'Pod Leadership';
    if (requirePodMember) return 'Pod Membership';
    if (requireHat) return 'Required Token (Hat)';
    return 'Special Access';
  };

  const getAccessIcon = () => {
    if (requireExecutive)
      return <Shield className="h-12 w-12" style={{ color: '#2F5D50' }} />;
    if (requirePodLeader)
      return <Shield className="h-12 w-12" style={{ color: '#6A5F7A' }} />;
    return <Lock className="h-12 w-12 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">{getAccessIcon()}</div>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error/Requirement Message */}
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="h-5 w-5 mt-0.5"
                style={{ color: '#C6933F' }}
              />
              <div className="flex-1">
                <p className="font-medium" style={{ color: '#7A5F3F' }}>
                  {getAccessRequirement()} Required
                </p>
                <p className="text-sm mt-1" style={{ color: '#9B7F5F' }}>
                  {errorMessage ||
                    description ||
                    `You need ${getAccessRequirement().toLowerCase()} to access this page.`}
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          {!address && (
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: '#E8F1EE',
                border: '1px solid #B8D9CA',
              }}
            >
              <p className="text-sm" style={{ color: '#1F453A' }}>
                Please connect your wallet to verify your access permissions.
              </p>
            </div>
          )}

          {/* Current Status */}
          {address && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Your Access Status:
              </p>
              <div className="space-y-1">
                {requireExecutive && (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isExecutiveMember
                          ? '#3F7A5A'
                          : '#8B3A3A',
                      }}
                    />
                    <span className="text-gray-600">Executive Pod Member</span>
                  </div>
                )}
                {requirePodLeader && (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isPodLeader ? '#3F7A5A' : '#8B3A3A',
                      }}
                    />
                    <span className="text-gray-600">Pod Leader</span>
                  </div>
                )}
                {requirePodMember && (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isPodMember ? '#3F7A5A' : '#8B3A3A',
                      }}
                    />
                    <span className="text-gray-600">Pod Member</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => router.push(redirectTo)}
              variant="outline"
              className="flex-1"
            >
              Go Back
            </Button>
            {requireExecutive && (
              <Button
                onClick={() => router.push('/pods/executive')}
                className="flex-1"
              >
                View Executive Pod
              </Button>
            )}
            {requirePodMember && !requirePodLeader && (
              <Button onClick={() => router.push('/pods')} className="flex-1">
                Join a Pod
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Pre-configured gates for common use cases
export const ExecutivePodGate: React.FC<{ children: ReactNode }> = ({
  children,
}) => (
  <PodAccessGate
    requireExecutive={true}
    title="Executive Access Required"
    description="This page is restricted to Executive Pod members only."
  >
    {children}
  </PodAccessGate>
);

export const PodLeaderGate: React.FC<{
  children: ReactNode;
  podId: string;
}> = ({ children, podId }) => (
  <PodAccessGate
    requirePodLeader={podId}
    title="Pod Leader Access Required"
    description="Only pod leaders can access this management page."
  >
    {children}
  </PodAccessGate>
);

export const PodMemberGate: React.FC<{
  children: ReactNode;
  podId: string;
}> = ({ children, podId }) => (
  <PodAccessGate
    requirePodMember={podId}
    title="Pod Membership Required"
    description="You must be a member of this pod to view this content."
  >
    {children}
  </PodAccessGate>
);

/**
 * AnyPodLeaderGate - Allows access to users who hold ANY leader hat
 * Used for pod creation and other actions that should be available to all pod leaders
 */
export const AnyPodLeaderGate: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const router = useRouter();
  const [isChecking, setIsChecking] = React.useState(true);
  const [isLeader, setIsLeader] = React.useState(false);

  React.useEffect(() => {
    const checkLeaderStatus = async () => {
      if (!address) {
        setIsChecking(false);
        setIsLeader(false);
        return;
      }

      try {
        // Check if user has ANY leader role in active_pod_members
        const { data: leaderRoles, error } = await supabase
          .from('active_pod_members')
          .select('membership_type, pod_name')
          .eq('wallet', address.toLowerCase())
          .eq('membership_type', 'leader')
          .eq('is_active', true)
          .limit(1);

        if (error) {
          console.error('❌ Error checking leader status:', error);
          setIsLeader(false);
        } else {
          setIsLeader(leaderRoles && leaderRoles.length > 0);
          if (leaderRoles && leaderRoles.length > 0) {
            console.log(
              '👑 User is a leader in pod:',
              leaderRoles[0].pod_name,
            );
          }
        }
      } catch (err) {
        console.error('❌ Exception checking leader status:', err);
        setIsLeader(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkLeaderStatus();
  }, [address]);

  // Loading state
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              <p className="text-gray-600">Verifying leadership status...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Access granted
  if (isLeader) {
    return <>{children}</>;
  }

  // Access denied
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12" style={{ color: '#6A5F7A' }} />
          </div>
          <CardTitle className="text-2xl">Pod Leader Access Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="h-5 w-5 mt-0.5"
                style={{ color: '#C6933F' }}
              />
              <div className="flex-1">
                <p className="font-medium" style={{ color: '#7A5F3F' }}>
                  Pod Leadership Required
                </p>
                <p className="text-sm mt-1" style={{ color: '#9B7F5F' }}>
                  You must be a leader of any pod to create new pods. Pod leaders can
                  create nested sub-pods within their own pod.
                </p>
              </div>
            </div>
          </div>

          {!address && (
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: '#E8F1EE',
                border: '1px solid #B8D9CA',
              }}
            >
              <p className="text-sm" style={{ color: '#1F453A' }}>
                Please connect your wallet to verify your leadership status.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => router.push('/pods')}
              variant="outline"
              className="flex-1"
            >
              View Pods
            </Button>
            <Button
              onClick={() => router.push('/pods/apply')}
              className="flex-1"
            >
              Apply to Join
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
