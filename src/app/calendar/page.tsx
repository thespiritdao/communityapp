'use client';
import { CommunityCalendar } from '@/features/events/components/CommunityCalendar';
import { useEventManagementAccess } from '@/features/events/hooks/useEventTokenGating';

export default function CalendarPage() {
  const { canManageEvents } = useEventManagementAccess();

  return (
    <div className="min-h-screen bg-gray-50 p-4 bottom-nav-spacing">
      <div className="max-w-7xl mx-auto">
        <CommunityCalendar showCreateButton={canManageEvents} />
      </div>
    </div>
  );
}