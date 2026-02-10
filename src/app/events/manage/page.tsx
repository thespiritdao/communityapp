'use client';
import { EventManagementDashboard } from '@/features/events/components/EventManagementDashboard';

export default function EventManagePage() {
  return (
    <div className="min-h-screen p-4 pb-20" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-7xl mx-auto">
        <EventManagementDashboard />
      </div>
    </div>
  );
}
