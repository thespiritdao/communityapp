// src/app/forum/moderation/page.tsx

'use client';

import ForumAccessGate from '@/features/forum/components/ForumAccessGate';
import { ModerationLog } from '@/features/forum/components/ModerationLog';
import { ReportQueue } from '@/features/forum/components/ReportQueue';
import { MutedUsersList } from '@/features/forum/components/MutedUsersList';
import { useModerationPermissions } from '@/features/forum/hooks/useModerationPermissions';

export default function ModerationDashboard() {
  return (
    <ForumAccessGate requireModeration={true}>
      <ModerationDashboardContent />
    </ForumAccessGate>
  );
}

function ModerationDashboardContent() {
  const { canModerate, moderatorRoles } = useModerationPermissions();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Forum Moderation</h1>
        <p className="text-gray-600">
          Manage forum content, review reports, and moderate users
        </p>
        {moderatorRoles.length > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Moderating as: {moderatorRoles.map((r) => r.roleName).join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {/* Statistics and Recent Actions */}
        <ModerationLog />

        {/* Report Queue */}
        <ReportQueue />

        {/* Muted Users */}
        <MutedUsersList />
      </div>
    </div>
  );
}
