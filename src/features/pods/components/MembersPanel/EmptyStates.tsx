/**
 * EmptyStates - Optimized empty state components
 *
 * Extracted and memoized empty state displays to prevent
 * unnecessary re-renders when data changes.
 */

'use client';

import React from 'react';
import { Users, UserCheck } from 'lucide-react';

interface EmptyMembersProps {
  type: 'members' | 'leaders';
  showRefreshHint?: boolean;
}

/**
 * Memoized empty state for member lists
 */
export const EmptyMembersList = React.memo<EmptyMembersProps>(
  ({ type, showRefreshHint = false }) => {
    const content = React.useMemo(() => {
      const isLeaders = type === 'leaders';

      return {
        icon: isLeaders ? UserCheck : Users,
        title: isLeaders ? 'No pod leaders found' : 'No current members found',
        subtitle: isLeaders
          ? 'Pod leaders will appear here once assigned'
          : 'Members will appear here once they join the pod',
      };
    }, [type, showRefreshHint]);

    const Icon = content.icon;

    return (
      <div className="text-center py-8 text-gray-500">
        <Icon className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>{content.title}</p>
        <p className="text-xs mt-1">{content.subtitle}</p>
      </div>
    );
  },
);

EmptyMembersList.displayName = 'EmptyMembersList';
