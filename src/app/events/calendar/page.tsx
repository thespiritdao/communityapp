'use client';
import { CommunityEventCalendar } from '@/features/events/components/CommunityEventCalendar';

export default function EventCalendarPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Event Calendar
          </h1>
          <p className="text-gray-600">
            View all community events in a calendar format. Click on events to
            register or view details.
          </p>
        </div>

        <CommunityEventCalendar />
      </div>
    </div>
  );
}
