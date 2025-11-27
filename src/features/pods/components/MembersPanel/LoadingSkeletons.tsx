/**
 * LoadingSkeletons - Optimized loading state components
 * 
 * Extracted common loading skeletons with proper memoization
 * to avoid recreating loading elements on every render.
 */

'use client';

import React from 'react';

interface MemberSkeletonProps {
  count?: number;
}

/**
 * Memoized skeleton for individual member cards
 */
const MemberSkeleton = React.memo(() => (
  <div className="flex items-center space-x-3">
    <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
    </div>
  </div>
));

MemberSkeleton.displayName = 'MemberSkeleton';

/**
 * Optimized loading skeleton for member lists
 */
export const MemberListSkeleton = React.memo<MemberSkeletonProps>(({ count = 3 }) => {
  // Memoize the skeleton array to prevent recreation
  const skeletons = React.useMemo(
    () => Array.from({ length: count }, (_, i) => (
      <MemberSkeleton key={`skeleton-${i}`} />
    )),
    [count]
  );

  return (
    <div className="space-y-3">
      {skeletons}
    </div>
  );
});

MemberListSkeleton.displayName = 'MemberListSkeleton';

/**
 * Adaptive loading skeleton that shows the right number of items
 */
export const AdaptiveMemberListSkeleton = React.memo<{ addresses: string[] }>(({ addresses }) => {
  // Use actual addresses length for more accurate loading state
  const count = Math.max(addresses.length, 3);
  
  return <MemberListSkeleton count={count} />;
});

AdaptiveMemberListSkeleton.displayName = 'AdaptiveMemberListSkeleton';