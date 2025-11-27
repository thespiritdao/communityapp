'use client';
import { EventManagementDashboard } from '@/features/events/components/EventManagementDashboard';

export default function EventManagePage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-7xl mx-auto">
        <EventManagementDashboard />
      </div>
    </div>
  );
}
