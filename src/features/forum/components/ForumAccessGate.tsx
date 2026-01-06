'use client';

import type React from 'react';
import { useRouter } from 'next/navigation';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { useUnifiedForumAccess } from '../hooks/useUnifiedForumAccess';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';

interface ForumAccessGateProps {
  children: React.ReactNode;
  categoryId?: string;
  requireModeration?: boolean;
  requirePosting?: boolean;
  allowPublic?: boolean;
  fallbackMessage?: string;
}

export default function ForumAccessGate({
  children,
  categoryId,
  requireModeration = false,
  requirePosting = false,
  allowPublic = false,
  fallbackMessage,
}: ForumAccessGateProps) {
  const router = useRouter();
  const { address, isConnected, isInitializing } = useCDPStatus();
  const { permissions, isLoading, error } = useUnifiedForumAccess();

  // Handle wallet connection
  const handleConnectWallet = () => {
    router.push(
      '/login?redirect=' + encodeURIComponent(window.location.pathname),
    );
  };

  // CDP wallet still initializing
  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <h1 className="text-2xl font-bold">Connecting Wallet...</h1>
        <p className="text-muted-foreground mt-2">
          Initializing your wallet connection
        </p>
      </div>
    );
  }

  // Loading permissions
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <h1 className="text-2xl font-bold">Checking Forum Access...</h1>
        <p className="text-muted-foreground mt-2">
          Verifying your roles, tokens, and pod permissions
        </p>
      </div>
    );
  }

  // Not connected - show connection prompt
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold">Connect Wallet to Access Forum</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          This forum requires wallet connection to verify your permissions.
        </p>
        <Button onClick={handleConnectWallet}>Connect Wallet</Button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Access Check Failed</h1>
        <p className="text-muted-foreground mt-2 mb-6">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // No permissions loaded
  if (!permissions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Forum Access Restricted</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          Unable to verify your forum permissions. Please try again.
        </p>
        <Button onClick={() => window.location.reload()}>Refresh</Button>
      </div>
    );
  }

  // Check category access
  if (categoryId && !permissions.canViewCategory(categoryId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Category Access Restricted</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          {fallbackMessage ||
            "You don't have the required roles, tokens, or pod permissions to access this category."}
        </p>

        <div className="bg-muted p-4 rounded-lg mb-6 max-w-md">
          <h3 className="font-semibold mb-2">Your Current Permissions:</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Accessible Categories: {permissions.accessibleCategories.length}
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            Active Roles: {permissions.userHats.length}
          </p>
          <p className="text-sm text-muted-foreground">
            Pod Roles: {permissions.podRoles.length}
          </p>
          {permissions.podRoles.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-semibold mb-1">Your Roles:</p>
              {permissions.podRoles.map((role, idx) => (
                <p key={idx} className="text-xs text-muted-foreground">
                  • {role.roleName} ({role.podName})
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={() => router.push('/forum')}>
            Back to Forum
          </Button>
          <Button onClick={() => window.location.reload()}>
            Refresh Access
          </Button>
        </div>
      </div>
    );
  }

  // Check moderation requirement
  if (requireModeration && !permissions.canModerate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Moderator Access Required</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          This page requires forum moderation permissions via
          pod_role_permissions.
        </p>
        <div className="bg-muted p-4 rounded-lg mb-6 max-w-md">
          <p className="text-sm">
            <strong>Required Permission:</strong> forumModeration = true
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Contact your pod leader to request moderator permissions.
          </p>
        </div>
        <Button onClick={() => router.push('/forum')}>Back to Forum</Button>
      </div>
    );
  }

  // Check posting requirement
  if (
    requirePosting &&
    categoryId &&
    !permissions.canPostInCategory(categoryId)
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold">Posting Not Allowed</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          You can view this category but don't have forumAccess permission to
          post.
        </p>
        <div className="bg-muted p-4 rounded-lg mb-6 max-w-md">
          <p className="text-sm">
            <strong>Required Permission:</strong> forumAccess = true
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Join a pod or request forumAccess permissions to participate in
            discussions.
          </p>
        </div>
        <Button onClick={() => router.push(`/forum/category/${categoryId}`)}>
          View Category (Read-Only)
        </Button>
      </div>
    );
  }

  // Access granted - render children
  return <>{children}</>;
}
